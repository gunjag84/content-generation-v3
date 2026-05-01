import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';

const oauthClient = new OAuth2Client();
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'contentai-78bfb';
const ALLOWED_INVOKERS = [`internal-invoker@${PROJECT_ID}.iam.gserviceaccount.com`];
const SERVICE_URL = process.env.CLOUD_RUN_SERVICE_URL!;

export async function requireOidc(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).end(); return; }
  try {
    const ticket = await oauthClient.verifyIdToken({ idToken: token, audience: SERVICE_URL });
    const payload = ticket.getPayload();
    if (!payload?.email || !ALLOWED_INVOKERS.includes(payload.email)) {
      res.status(403).end();
      return;
    }
    next();
  } catch {
    res.status(401).end();
    return;
  }
}
