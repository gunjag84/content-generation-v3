import { deleteDoc, deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { api } from './api';
import { db } from './firebase';

export async function deletePost(uid: string, brandId: string, postId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'brands', brandId, 'posts', postId));
}

// Flip an errored post back to draft so the user can re-schedule or re-publish.
// Used when the publish-worker marks a post status='error' (e.g. missing token,
// missing renders, IG API failure) — those posts otherwise vanish from every tab.
export async function resetPostToDraft(uid: string, brandId: string, postId: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'brands', brandId, 'posts', postId), {
    status: 'draft',
    error: deleteField(),
    scheduledAt: null,
    publishingStartedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function schedulePost(brandId: string, postId: string, scheduledAtIso: string): Promise<void> {
  const res = await api(`/api/posts/${postId}/schedule`, {
    method: 'POST',
    body: JSON.stringify({ brandId, scheduledAt: scheduledAtIso }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Fehler ${res.status}`);
  }
}

export async function cancelSchedule(brandId: string, postId: string): Promise<void> {
  const res = await api(`/api/posts/${postId}/cancel-schedule`, {
    method: 'POST',
    body: JSON.stringify({ brandId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Fehler ${res.status}`);
  }
}

export async function publishNow(brandId: string, postId: string): Promise<void> {
  const res = await api(`/api/posts/${postId}/publish-now`, {
    method: 'POST',
    body: JSON.stringify({ brandId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Fehler ${res.status}`);
  }
}
