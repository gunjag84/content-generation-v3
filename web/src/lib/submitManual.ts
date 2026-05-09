// Plain JSON consumer for POST /api/generate-manual.
// Mirrors streamGenerate's option shape but without NDJSON streaming —
// the manual path returns one synchronous JSON response.

import type { GenerateRequest } from '../../../shared/schemas/generateRequest';
import type { SocialSlide } from '../../../shared/types/slide';

export interface SubmitManualOptions {
  token: string;
  body: GenerateRequest;
  signal: AbortSignal;
  onComplete: (payload: { postId: string; slides: SocialSlide[]; caption: string }) => void;
  onError: (err: { message: string; code?: string }) => void;
}

export async function submitManual(opts: SubmitManualOptions): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/generate-manual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    opts.onError({ message: (err as Error).message });
    return;
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    opts.onError({ message: (err as Error).message });
    return;
  }

  if (!res.ok) {
    const e = data as { error?: string; code?: string };
    opts.onError({ message: e.error ?? 'Request failed', code: e.code });
    return;
  }

  opts.onComplete(data as { postId: string; slides: SocialSlide[]; caption: string });
}
