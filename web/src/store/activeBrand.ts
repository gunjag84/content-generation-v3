import { useAuthStore } from './auth';
import { useUserDoc } from '../auth/useUserDoc';

/**
 * Single source of truth for the user's currently active brand id.
 * Pages must NOT call useUserDoc() directly for activeBrandId; always go through this hook.
 */
export function useActiveBrand(): { uid: string | null; brandId: string | null } {
  const user = useAuthStore((s) => s.user);
  const { data } = useUserDoc(user?.uid ?? null);
  return {
    uid: user?.uid ?? null,
    brandId: data?.activeBrandId ?? null,
  };
}
