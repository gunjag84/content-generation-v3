const GRAPH_VERSION = 'v21.0';
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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
    const carouselRes = await graphPost(`/${igUserId}/media`, {
      media_type: 'CAROUSEL',
      caption,
      children: childIds,
      access_token: metaToken,
    }) as { id: string };
    creationId = carouselRes.id;
  }

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
