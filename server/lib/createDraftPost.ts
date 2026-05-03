// Server-authored draft post creation.
// The aiSnapshot field is set ONCE here and is immutable forever after
// (enforced by Firestore rule: request.resource.data.aiSnapshot == resource.data.aiSnapshot).

import { db } from './firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import type { SocialSlide } from '../../shared/types/slide.js';
import { linesToZones } from '../../shared/lib/linesToZones.js';
import type { BrandDesign } from '../../shared/schemas/brand.js';

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
  const { uid, brandId, slides: rawSlides, caption } = input;

  // Load brand design so per-zone-role defaults (font/size + standard|accent
  // color choice) and the configured text colors flow into the initial zone layout.
  const brandSnap = await db.doc(`users/${uid}/brands/${brandId}`).get();
  const design = (brandSnap.data()?.design ?? {}) as Partial<BrandDesign>;
  const linesOpts = {
    zoneDefaults: design.zoneDefaults,
    standardTextColor: design.standardTextColor,
    accentTextColor: design.accentTextColor,
  };

  // parseSlidesMd leaves zones[] empty; populate them from lines so the editor
  // renders text on first load. aiSnapshot captures the zone-filled version too
  // so future edit-diff comparisons are apples-to-apples.
  const slides = rawSlides.map((s) => ({ ...s, zones: linesToZones(s, linesOpts) }));

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
