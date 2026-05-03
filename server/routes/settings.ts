import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../lib/firebase.js';
import { kmsEncrypt } from '../lib/kms.js';
import { getMetaToken } from '../lib/getMetaToken.js';
import { SetApiKeysBody } from '../../shared/schemas/apiKeys.js';

const router = Router();

function uid(req: Request): string {
  return (req as any).uid as string;
}

async function assertBrandOwnership(
  req: Request,
  res: Response,
  brandId: unknown,
): Promise<boolean> {
  if (typeof brandId !== 'string' || !brandId) {
    res.status(400).json({ error: 'brandId required' });
    return false;
  }
  const snap = await db.doc(`users/${uid(req)}/brands/${brandId}`).get();
  if (!snap.exists) {
    res.status(404).json({ error: 'brand_not_found' });
    return false;
  }
  return true;
}

function metaErrorMessage(payload: any, status: number): string {
  const err = payload?.error;
  if (err?.code === 100 || err?.code === 190) return 'Account nicht zugänglich';
  if (typeof err?.message === 'string' && err.message) return err.message;
  return `Meta API ${status}`;
}

router.post('/api-keys', async (req, res) => {
  const parsed = SetApiKeysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  const apiKeys: { anthropic?: string; metaGraph?: string } = {};
  if (parsed.data.anthropic) apiKeys.anthropic = await kmsEncrypt(parsed.data.anthropic);
  if (parsed.data.metaGraph) apiKeys.metaGraph = await kmsEncrypt(parsed.data.metaGraph);
  await db.doc(`users/${uid(req)}`).set({ apiKeys }, { merge: true });
  res.status(204).end();
});

router.get('/api-keys', async (req, res) => {
  const snap = await db.doc(`users/${uid(req)}`).get();
  const data = snap.data() as { apiKeys?: { anthropic?: string; metaGraph?: string } } | undefined;
  res.json({
    anthropic: { configured: !!data?.apiKeys?.anthropic },
    metaGraph: { configured: !!data?.apiKeys?.metaGraph },
  });
});

const ValidateTokenBody = z.object({ token: z.string().min(20) });

router.post('/validate-token', async (req, res) => {
  const parsed = ValidateTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  try {
    const url = `https://graph.facebook.com/v21.0/me?fields=name,id&access_token=${encodeURIComponent(parsed.data.token)}`;
    const r = await fetch(url);
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body?.error) {
      const msg = metaErrorMessage(body, r.status);
      console.warn('validate-token meta error', { status: r.status, msg });
      res.json({ ok: false, error: msg });
      return;
    }
    res.json({ ok: true, name: body.name, id: body.id });
  } catch (e: any) {
    console.warn('validate-token network error', e?.message);
    res.json({ ok: false, error: 'Netzwerkfehler beim Token-Check' });
  }
});

const ValidateIgUserIdBody = z.object({
  brandId: z.string().min(1),
  igUserId: z.string().min(1),
});

router.post('/validate-ig-user-id', async (req, res) => {
  const parsed = ValidateIgUserIdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  if (!(await assertBrandOwnership(req, res, parsed.data.brandId))) return;

  let token: string;
  try {
    token = await getMetaToken(uid(req));
  } catch {
    res.json({ ok: false, error: 'Meta-Token nicht konfiguriert' });
    return;
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(parsed.data.igUserId)}?fields=username,name&access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url);
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body?.error) {
      const msg = metaErrorMessage(body, r.status);
      console.warn('validate-ig-user-id meta error', { status: r.status, msg });
      res.json({ ok: false, error: msg });
      return;
    }
    if (!body?.username) {
      res.json({ ok: false, error: 'Kein Instagram-Username im Response' });
      return;
    }
    res.json({ ok: true, username: body.username });
  } catch (e: any) {
    console.warn('validate-ig-user-id network error', e?.message);
    res.json({ ok: false, error: 'Netzwerkfehler beim IG-Check' });
  }
});

const SetIgUserIdBody = z.object({
  brandId: z.string().min(1),
  igUserId: z.string().regex(/^\d{5,30}$/),
});

router.post('/ig-user-id', async (req, res) => {
  const parsed = SetIgUserIdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  if (!(await assertBrandOwnership(req, res, parsed.data.brandId))) return;

  await db
    .doc(`users/${uid(req)}/brands/${parsed.data.brandId}`)
    .set({ instagramUserId: parsed.data.igUserId }, { merge: true });
  res.status(204).end();
});

export default router;
