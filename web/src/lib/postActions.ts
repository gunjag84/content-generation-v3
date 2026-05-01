import { api } from './api';

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
