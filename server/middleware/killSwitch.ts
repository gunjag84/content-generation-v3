import type { Request, Response, NextFunction } from 'express';
import { getCachedKillSwitch } from '../lib/killSwitchCache.js';

export async function killSwitchGate(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const flag = await getCachedKillSwitch();
    if (flag.enabled === false) {
      res.status(503).json({ error: 'suspended' });
      return;
    }
    next();
  } catch {
    // Fail open: if killSwitch read fails, do not block traffic. Logged for ops.
    next();
  }
}
