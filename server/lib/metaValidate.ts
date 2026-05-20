// Pure functions for validating Meta Graph credentials against the live API.
// Extracted so the same logic is used by:
//   - POST /api/settings/validate-token
//   - POST /api/settings/validate-ig-user-id
//   - POST /api/settings/brand-ig (new, write-after-validate)
//   - tests can mock fetch directly without touching Express.

import { GRAPH_BASE_URL as GRAPH } from './graphConstants.js';

function metaErrorMessage(payload: any, status: number): string {
  const err = payload?.error;
  if (err?.code === 100 || err?.code === 190) return 'Account nicht zugänglich';
  if (typeof err?.message === 'string' && err.message) return err.message;
  return `Meta API ${status}`;
}

export type ValidateTokenResult =
  | { ok: true; name: string; id: string }
  | { ok: false; error: string };

export async function validateMetaToken(token: string): Promise<ValidateTokenResult> {
  try {
    const url = `${GRAPH}/me?fields=name,id&access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url);
    const body = (await r.json().catch(() => ({}))) as any;
    if (!r.ok || body?.error) {
      return { ok: false, error: metaErrorMessage(body, r.status) };
    }
    if (typeof body?.name !== 'string' || typeof body?.id !== 'string') {
      return { ok: false, error: 'Meta API liefert kein name/id' };
    }
    return { ok: true, name: body.name, id: body.id };
  } catch {
    return { ok: false, error: 'Netzwerkfehler beim Token-Check' };
  }
}

export type ValidateIgUserIdResult =
  | { ok: true; username: string }
  | { ok: false; error: string };

export async function validateIgUserId(
  token: string,
  igUserId: string,
): Promise<ValidateIgUserIdResult> {
  try {
    const url = `${GRAPH}/${encodeURIComponent(igUserId)}?fields=username,name&access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url);
    const body = (await r.json().catch(() => ({}))) as any;
    if (!r.ok || body?.error) {
      return { ok: false, error: metaErrorMessage(body, r.status) };
    }
    if (typeof body?.username !== 'string' || !body.username) {
      return { ok: false, error: 'Kein Instagram-Username im Response' };
    }
    return { ok: true, username: body.username };
  } catch {
    return { ok: false, error: 'Netzwerkfehler beim IG-Check' };
  }
}
