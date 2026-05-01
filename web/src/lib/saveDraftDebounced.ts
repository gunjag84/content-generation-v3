// Debounced draft writer. Restricts the patch shape so callers cannot accidentally
// write `aiSnapshot` (which is server-authored and immutable per Firestore rules).

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { SocialSlide } from '../../../shared/types/slide';

export const AUTOSAVE_DELAY_MS = 800;

export interface DraftPatch {
  slides?: SocialSlide[];
  caption?: string;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, DraftPatch>();

export function saveDraftDebounced(
  uid: string,
  brandId: string,
  postId: string,
  patch: DraftPatch,
): void {
  pending.set(postId, { ...(pending.get(postId) ?? {}), ...patch });
  const existing = timers.get(postId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    const finalPatch = pending.get(postId) ?? {};
    pending.delete(postId);
    timers.delete(postId);
    const ref = doc(db, 'users', uid, 'brands', brandId, 'posts', postId);
    void updateDoc(ref, { ...finalPatch, updatedAt: serverTimestamp() });
  }, AUTOSAVE_DELAY_MS);
  timers.set(postId, t);
}

// For tests: flush all pending writes immediately.
export function __flushAllForTest(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  pending.clear();
}
