import { GRAPH_VERSION, GRAPH_BASE_URL as BASE } from './graphConstants.js';

export interface PublishCarouselArgs {
  metaToken: string;
  igUserId: string;
  slideUrls: string[];
  caption: string;
}

export interface PublishCarouselResult {
  igMediaId: string;
  igPermalink: string | null;
}

// Thin wrapper around Meta Graph API errors.
function metaError(label: string, body: unknown): Error {
  const err = (body as any)?.error;
  const code: number | undefined = err?.code;
  const msg: string = err?.message ?? JSON.stringify(body);
  return new Error(`Meta Graph API error [${label}] code=${code ?? 'unknown'}: ${msg}`);
}

async function graphPost(path: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!res.ok || (body as any)?.error) {
    throw metaError(path, body);
  }
  return body;
}

async function graphGet(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`);
  const body = await res.json();
  if (!res.ok || (body as any)?.error) {
    throw metaError(path, body);
  }
  return body;
}

// Poll a media container until status_code is FINISHED.
// Meta processes uploaded images asynchronously; calling /media_publish before
// processing is done returns code 9007 ("media ID is not available").
// Larger images (1080x1350 portrait, 1080x1920 story) take longer than 1080x1080.
//
// Status codes: EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED.
// Default timeout: 60s with 2s polling. Empirically a single 1080x1350 PNG
// finishes in ~2-8s; carousels with N children finish in ~5-20s.
async function waitForContainer(
  containerId: string,
  metaToken: string,
  timeoutMs = 60000,
  pollMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = (await graphGet(`/${containerId}`, {
      fields: 'status_code,status',
      access_token: metaToken,
    })) as { status_code?: string; status?: string };
    const code = res.status_code;
    if (code === 'FINISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(
        `container_${code.toLowerCase()} (${containerId}): ${res.status ?? 'no detail'}`,
      );
    }
    // IN_PROGRESS / undefined: keep polling
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`container_timeout (${containerId}) after ${timeoutMs}ms`);
}

// Publish to Instagram. Routes to single-image when slideUrls.length === 1
// (Meta carousels require 2-10 children — a 1-child carousel is rejected with
// code=100 Invalid parameter), otherwise multi-image carousel.
//
// Carousel steps (per Meta Graph API docs):
//   1. Create a media container for each image (is_carousel_item=true).
//   2. Create a carousel container referencing all child IDs (+ caption).
//   3. Publish the carousel container.
//
// Single-image steps:
//   1. Create a media container with image_url + caption (no is_carousel_item,
//      no media_type — default is IMAGE).
//   2. Publish the container.
//
// Both paths fetch the permalink at the end (best-effort).
export async function publishCarousel({
  metaToken,
  igUserId,
  slideUrls,
  caption,
}: PublishCarouselArgs): Promise<PublishCarouselResult> {
  if (!slideUrls.length) {
    throw new Error('publishCarousel: slideUrls must not be empty');
  }

  let creationId: string;

  if (slideUrls.length === 1) {
    // Single-image path
    const res = await graphPost(`/${igUserId}/media`, {
      image_url: slideUrls[0],
      caption,
      access_token: metaToken,
    }) as { id: string };
    creationId = res.id;
  } else {
    // Carousel path
    const childIds: string[] = [];
    for (const imageUrl of slideUrls) {
      const res = await graphPost(`/${igUserId}/media`, {
        image_url: imageUrl,
        is_carousel_item: true,
        access_token: metaToken,
      }) as { id: string };
      childIds.push(res.id);
    }
    // Wait for every child to finish processing before composing the carousel.
    // Meta's carousel /media endpoint accepts unfinished children, but the
    // subsequent /media_publish then fails with code 9007.
    for (const childId of childIds) {
      await waitForContainer(childId, metaToken);
    }
    const carouselRes = await graphPost(`/${igUserId}/media`, {
      media_type: 'CAROUSEL',
      caption,
      children: childIds,
      access_token: metaToken,
    }) as { id: string };
    creationId = carouselRes.id;
  }

  // Final container readiness check. The single-image and carousel paths both
  // need this gate; without it /media_publish returns 9007 if Meta hasn't
  // finished processing yet.
  await waitForContainer(creationId, metaToken);

  // Publish (same endpoint for both paths)
  const publishRes = await graphPost(`/${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: metaToken,
  }) as { id: string };
  const igMediaId = publishRes.id;

  // Step 4: fetch permalink (best-effort; non-fatal if it fails)
  let igPermalink: string | null = null;
  try {
    const mediaRes = await graphGet(`/${igMediaId}`, {
      fields: 'permalink',
      access_token: metaToken,
    }) as { permalink?: string };
    igPermalink = mediaRes.permalink ?? null;
  } catch {
    // Permalink fetch is non-critical — swallow and continue.
  }

  return { igMediaId, igPermalink };
}
