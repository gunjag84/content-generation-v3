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

// Publish a multi-image carousel to Instagram.
//
// Steps (per Meta Graph API docs):
//   1. Create a media container for each image (is_carousel_item=true).
//   2. Create a carousel container referencing all child IDs.
//   3. Publish the carousel container.
//   4. (Optional) Fetch the permalink for the published media.
export async function publishCarousel({
  metaToken,
  igUserId,
  slideUrls,
  caption,
}: PublishCarouselArgs): Promise<PublishCarouselResult> {
  if (!slideUrls.length) {
    throw new Error('publishCarousel: slideUrls must not be empty');
  }

  // Step 1: create item containers
  const childIds: string[] = [];
  for (const imageUrl of slideUrls) {
    const res = await graphPost(`/${igUserId}/media`, {
      image_url: imageUrl,
      is_carousel_item: true,
      access_token: metaToken,
    }) as { id: string };
    childIds.push(res.id);
  }

  // Step 2: create carousel container
  const carouselRes = await graphPost(`/${igUserId}/media`, {
    media_type: 'CAROUSEL',
    caption,
    children: childIds,
    access_token: metaToken,
  }) as { id: string };
  const carouselId = carouselRes.id;

  // Step 3: publish
  const publishRes = await graphPost(`/${igUserId}/media_publish`, {
    creation_id: carouselId,
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
