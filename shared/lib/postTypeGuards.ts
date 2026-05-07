// Discriminator type guards for Post.
//
// Posts come from two sources:
//   - 'tool'      : generated and published by this app (has aiSnapshot,
//                   slides, mode/method, photoUrls, etc.)
//   - 'ig-native' : pulled from the IG Graph feed by igFeedSync (has
//                   igMediaId, mediaType, mediaUrl/thumbnailUrl)
//
// `source` defaults to 'tool' on read so pre-migration posts (no `source`
// field on disk) read back as tool posts. Always use these guards before
// touching tool-only fields like `slides`, `aiSnapshot`, `method`, etc.

import type { Post, ToolPost, IgNativePost } from '../schemas/post.js';

export function isToolPost(p: Post): p is ToolPost {
  // undefined -> 'tool' (pre-migration posts have no `source` on disk).
  return p.source === undefined || p.source === 'tool';
}

export function isIgNativePost(p: Post): p is IgNativePost {
  return p.source === 'ig-native';
}
