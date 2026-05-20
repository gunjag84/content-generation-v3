import type { Request, Response, NextFunction } from 'express';
import { auth, db } from '../lib/firebase.js';

// D-27: hardcoded allowlist. Tim updates this list and redeploys to add users.
export const ALLOWED_EMAILS = [
  'tim.gansczyk@gmail.com',
  'juliane@gansczyk.de',
];

// Paths exempted from onboarding gate (must be reachable before apiKeys.anthropic is set).
// Path is relative to the /api mount, so '/settings/api-keys' here matches '/api/settings/api-keys'.
const ONBOARDING_EXEMPT_PATHS = new Set([
  '/settings/api-keys',
]);

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).end(); return; }
  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    res.status(401).end();
    return;
  }
  if (!decoded.email || !ALLOWED_EMAILS.includes(decoded.email)) {
    res.status(403).end();
    return;
  }
  (req as any).uid = decoded.uid;
  (req as any).userEmail = decoded.email;

  // D-19 onboarding gate
  if (ONBOARDING_EXEMPT_PATHS.has(req.path)) { next(); return; }
  try {
    const userSnap = await db.doc(`users/${decoded.uid}`).get();
    const data = userSnap.data();
    if (!data?.apiKeys?.anthropic || !data?.activeBrandId) {
      res.status(412).json({ error: 'onboarding_incomplete' });
      return;
    }
  } catch {
    res.status(500).json({ error: 'user_doc_read_failed' });
    return;
  }
  next();
}
