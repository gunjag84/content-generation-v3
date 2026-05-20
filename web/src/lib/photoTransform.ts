import type { PhotoTransform, Zone } from '../../../shared/types/slide';

export const DEFAULT_PHOTO_TRANSFORM: PhotoTransform = {
  x: 50,
  y: 50,
  scale: 1,
  rotation: 0,
};

/**
 * Two-level lookup with zone-override precedence:
 * 1. zone.photoTransform (per-zone override) — highest priority
 * 2. brandPhotoTransforms[photoId] — per-photo brand default
 * 3. DEFAULT_PHOTO_TRANSFORM — centered/fit baseline
 *
 * brandPhotoTransforms uses { rotation, scale } shape from existing Editor.tsx
 * state; x/y default to 50 if not present.
 */
export function resolvePhotoTransform(
  zone: Zone | null | undefined,
  brandPhotoTransforms: Record<string, { rotation: number; scale: number; x?: number; y?: number }>,
  photoId: string | undefined,
): PhotoTransform {
  if (zone?.photoTransform) return zone.photoTransform;
  if (photoId && brandPhotoTransforms[photoId]) {
    const bt = brandPhotoTransforms[photoId];
    return {
      x: bt.x ?? 50,
      y: bt.y ?? 50,
      scale: bt.scale,
      rotation: bt.rotation,
    };
  }
  return { ...DEFAULT_PHOTO_TRANSFORM };
}
