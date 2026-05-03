// Shared publish path used by both the publish-worker (scheduled) and the
// /api/posts/:postId/publish-now endpoint (synchronous immediate publish).
//
// Caller is responsible for the claim transaction (e.g. scheduled→publishing
// or draft→publishing) BEFORE calling this. On success: transitions to
// 'published' with IG metadata. On failure: throws — caller decides whether
// to mark error + how to surface to the user.

import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import { getMetaToken } from './getMetaToken.js';
import { publishCarousel } from './instagram.js';
import { runLearningExtraction } from './learningExtractor.js';
import type { SocialSlide } from '../../shared/types/slide.js';

export async function publishClaimedPost(
  postRef: FirebaseFirestore.DocumentReference,
  uid: string,
  brandId: string,
): Promise<{ igMediaId: string; igPermalink: string | null }> {
  const snap = await postRef.get();
  if (!snap.exists) throw new Error('post_not_found');
  const postData = snap.data()!;

  const renderedSlideUrls: string[] | null = postData.renderedSlideUrls ?? null;
  if (!renderedSlideUrls || renderedSlideUrls.length === 0) {
    throw new Error('no_rendered_slides — render before publish');
  }

  const metaToken = await getMetaToken(uid);

  const brandSnap = await db.doc(`users/${uid}/brands/${brandId}`).get();
  if (!brandSnap.exists) throw new Error('brand_not_found');
  const igUserId: string | undefined = brandSnap.data()?.instagramUserId;
  if (!igUserId) throw new Error('instagram_not_configured');

  const caption: string = postData.caption ?? '';

  const { igMediaId, igPermalink } = await publishCarousel({
    metaToken,
    igUserId,
    slideUrls: renderedSlideUrls,
    caption,
  });

  const publishedSlides: SocialSlide[] = postData.slides ?? [];
  await postRef.update({
    status: 'published',
    publishedAt: FieldValue.serverTimestamp(),
    publishedSnapshot: { slides: publishedSlides, caption },
    igMediaId,
    igPermalink: igPermalink ?? null,
    publishingStartedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Fire-and-forget learning extraction. Never blocks; never throws into caller.
  const aiSnapshot = postData.aiSnapshot as
    | { slides: SocialSlide[]; caption: string }
    | undefined;
  if (aiSnapshot) {
    void runLearningExtraction({
      uid,
      brandId,
      postId: postRef.id,
      mode: postData.mode,
      method: postData.method,
      aiSnapshot,
      publishedSnapshot: { slides: publishedSlides, caption },
    }).catch((err) => {
      console.error('[publishClaimedPost] learningExtraction failed for', postRef.path, err);
    });
  }

  return { igMediaId, igPermalink: igPermalink ?? null };
}
