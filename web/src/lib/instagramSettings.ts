import { api } from './api';

export async function validateMetaToken(
  token: string,
): Promise<{ ok: true; name: string; id: string } | { ok: false; error: string }> {
  const res = await api('/api/settings/validate-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  return res.json();
}

export async function saveMetaToken(token: string): Promise<void> {
  const res = await api('/api/settings/api-keys', {
    method: 'POST',
    body: JSON.stringify({ metaGraph: token }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

export async function validateIgUserId(
  brandId: string,
  igUserId: string,
): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const res = await api('/api/settings/validate-ig-user-id', {
    method: 'POST',
    body: JSON.stringify({ brandId, igUserId }),
  });
  return res.json();
}

export async function saveIgUserId(brandId: string, igUserId: string): Promise<void> {
  const res = await api('/api/settings/ig-user-id', {
    method: 'POST',
    body: JSON.stringify({ brandId, igUserId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

// Multi-brand migration (2026-05-06): combined token + igUserId write at the
// brand level. Server validates both against the live Meta API before persist.
export async function saveBrandIgToken(
  brandId: string,
  token: string,
  igUserId: string,
): Promise<{ ok: true; username?: string; pageName?: string } | { ok: false; error: string; step?: string }> {
  const res = await api('/api/settings/brand-ig', {
    method: 'POST',
    body: JSON.stringify({ brandId, token, igUserId }),
  });
  return res.json();
}
