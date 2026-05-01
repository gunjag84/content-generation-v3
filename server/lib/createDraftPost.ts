// Server-authored draft post creation.
// The aiSnapshot field is set ONCE here and is immutable forever after
// (enforced by Firestore rule: request.resource.data.aiSnapshot == resource.data.aiSnapshot).

import { db } from './firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import type { SocialSlide } from '../../shared/types/slide.js';

export interface CreateDraftPostInput {
  uid: string;
  brandId: string;
  mode: 'create-demand' | 'convert-demand';
  method: 'story' | 'liste' | 'vorher-nachher' | 'zitat';
  focusAreaId: string | null;
  situationText: string;
  situationId: string | null;
  photoUrls: Record<string, string>;
  slides: SocialSlide[];
  caption: string;
}

export async function createDraftPost(input: CreateDraftPostInput): Promise<string> {
  const { uid, brandId, slides, caption } = input;

  const ref = db.collection(`users/${uid}/brands/${brandId}/posts`).doc();
  await ref.set({
    status: 'draft',
    aiSnapshot: {
      slides,
      caption,
    },
    slides,
    caption,
    mode: input.mode,
    method: input.method,
    focusAreaId: input.focusAreaId,
    situationText: input.situationText,
    situationId: input.situationId,
    photoUrls: input.photoUrls,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}
