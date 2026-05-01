import { db } from './firebase.js';

interface CacheEntry { value: { enabled: boolean }; fetchedAt: number; }
const TTL_MS = 30_000;
let cache: CacheEntry | null = null;

export async function getCachedKillSwitch(): Promise<{ enabled: boolean }> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.value;
  const snap = await db.doc('system/killSwitch').get();
  const data = snap.data() as { enabled?: boolean } | undefined;
  // Default true if missing/malformed; only an explicit `false` trips the gate.
  const value = { enabled: data?.enabled !== false };
  cache = { value, fetchedAt: now };
  return value;
}

export function invalidateKillSwitchCache(): void { cache = null; }
