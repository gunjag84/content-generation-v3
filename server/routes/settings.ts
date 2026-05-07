import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.js';
import { kmsEncrypt } from '../lib/kms.js';
import { getMetaToken } from '../lib/getMetaToken.js';
import {
  validateMetaToken as fetchValidateMetaToken,
  validateIgUserId as fetchValidateIgUserId,
} from '../lib/metaValidate.js';
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
  const result = await fetchValidateMetaToken(parsed.data.token);
  res.json(result);
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
    token = await getMetaToken(uid(req), parsed.data.brandId);
  } catch {
    res.json({ ok: false, error: 'Meta-Token nicht konfiguriert' });
    return;
  }

  const result = await fetchValidateIgUserId(token, parsed.data.igUserId);
  res.json(result);
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

// Multi-brand migration (2026-05-06): write Meta token + IG user-id at the
// brand level in a single round-trip. Both validated against the live API
// before persistence; either failure returns ok=false without writes.
const SetBrandIgBody = z.object({
  brandId: z.string().min(1),
  token: z.string().min(20),
  igUserId: z.string().regex(/^\d{5,30}$/),
});

router.post('/brand-ig', async (req, res) => {
  const parsed = SetBrandIgBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  if (!(await assertBrandOwnership(req, res, parsed.data.brandId))) return;

  const tokenCheck = await fetchValidateMetaToken(parsed.data.token);
  if (!tokenCheck.ok) {
    res.json({ ok: false, step: 'token', error: tokenCheck.error });
    return;
  }
  const igCheck = await fetchValidateIgUserId(parsed.data.token, parsed.data.igUserId);
  if (!igCheck.ok) {
    res.json({ ok: false, step: 'igUserId', error: igCheck.error });
    return;
  }

  const ciphertext = await kmsEncrypt(parsed.data.token);
  await db.doc(`users/${uid(req)}/brands/${parsed.data.brandId}`).set(
    {
      metaGraphCiphertext: ciphertext,
      metaGraphSetAt: Timestamp.now(),
      instagramUserId: parsed.data.igUserId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  res.json({ ok: true, username: igCheck.username, pageName: tokenCheck.name });
});

export default router;
