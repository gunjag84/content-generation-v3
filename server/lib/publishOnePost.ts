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
import { resignIfExpiring } from './resignSlides.js';
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

  // Re-sign slide URLs that are expiring within the 7-day threshold so IG
  // never receives a broken URL. Failures are non-fatal — we log and proceed
  // with the original URLs rather than aborting the publish.
  let slideUrls = renderedSlideUrls;
  try {
    const resigned = await resignIfExpiring({
      uid,
      brandId,
      postId: postRef.id,
      renderedSlideUrls,
    });
    if (resigned !== null) {
      slideUrls = resigned.newUrls;
      // Persist fresh URLs so subsequent re-publish attempts start clean.
      await postRef.update({ renderedSlideUrls: resigned.newUrls });
    }
  } catch (err) {
    console.error('[publishClaimedPost] resignIfExpiring failed — proceeding with original URLs', postRef.path, err);
  }

  const metaToken = await getMetaToken(uid, brandId);

  const brandSnap = await db.doc(`users/${uid}/brands/${brandId}`).get();
  if (!brandSnap.exists) throw new Error('brand_not_found');
  const igUserId: string | undefined = brandSnap.data()?.instagramUserId;
  if (!igUserId) throw new Error('instagram_not_configured');

  const caption: string = postData.caption ?? '';

  const { igMediaId, igPermalink } = await publishCarousel({
    metaToken,
    igUserId,
    slideUrls,
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
  // Skip extraction if mode/method are missing (legacy / ig-native posts).
  const aiSnapshot = postData.aiSnapshot as
    | { slides: SocialSlide[]; caption: string }
    | undefined;
  if (aiSnapshot && postData.mode && postData.method) {
    void runLearningExtraction({
      uid,
      brandId,
      postId: postRef.id,
      mode: postData.mode,
      method: postData.method,
      length: postData.length ?? 'medium',
      aiSnapshot,
      publishedSnapshot: { slides: publishedSlides, caption },
    }).catch((err) => {
      console.error('[publishClaimedPost] learningExtraction failed for', postRef.path, err);
    });
  }

  return { igMediaId, igPermalink: igPermalink ?? null };
}
