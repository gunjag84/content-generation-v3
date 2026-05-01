import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { RenderJobStatus } from '../../../shared/schemas/renderJob';

export interface RenderJobState {
  status: RenderJobStatus | 'idle';
  completedSlides: number;
  slideUrls: string[];
  error: string | null;
}

const IDLE: RenderJobState = {
  status: 'idle',
  completedSlides: 0,
  slideUrls: [],
  error: null,
};

export function useRenderJob(
  brandId: string | null,
  jobId: string | null,
): RenderJobState {
  const [state, setState] = useState<RenderJobState>(IDLE);

  useEffect(() => {
    const uid = auth.currentUser?.uid ?? null;
    if (!uid || !brandId || !jobId) {
      setState(IDLE);
      return;
    }

    const ref = doc(db, 'users', uid, 'brands', brandId, 'renderJobs', jobId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setState(IDLE);
        return;
      }
      const data = snap.data();
      const status = (data.status as RenderJobStatus) ?? 'pending';
      setState({
        status,
        completedSlides: (data.completedSlides as number) ?? 0,
        slideUrls: (data.slideUrls as string[]) ?? [],
        error: (data.error as string | null) ?? null,
      });
    });

    return () => unsub();
  }, [brandId, jobId]);

  // Stop live subscription once terminal state is reached — handled by the
  // effect dependency: when status flips to done/error the component can
  // clear jobId to drop the subscription; we don't force-unsub internally
  // because the parent needs the final URLs from state after completion.

  return state;
}
