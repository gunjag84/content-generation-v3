import { Router } from 'express';
import { db } from '../lib/firebase.js';
import { kmsEncrypt } from '../lib/kms.js';
import { SetApiKeysBody } from '../../shared/schemas/apiKeys.js';

const router = Router();

router.post('/api-keys', async (req, res) => {
  const parsed = SetApiKeysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  const uid = (req as any).uid as string;
  const ciphertext = await kmsEncrypt(parsed.data.anthropic);
  await db.doc(`users/${uid}`).set({ apiKeys: { anthropic: ciphertext } }, { merge: true });
  res.status(204).end();
});

router.get('/api-keys', async (req, res) => {
  const uid = (req as any).uid as string;
  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.data() as { apiKeys?: { anthropic?: string; metaGraph?: string } } | undefined;
  res.json({
    anthropic: { configured: !!data?.apiKeys?.anthropic },
    metaGraph: { configured: !!data?.apiKeys?.metaGraph },
  });
});

export default router;
