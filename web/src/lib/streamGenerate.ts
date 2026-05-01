// NDJSON consumer for POST /api/generate.
// One JSON object per line; the trailing line may NOT end in a newline -
// the loop must parse what's left in the buffer when reader returns done.

import type { GenerateRequest } from '../../../shared/schemas/generateRequest';
import type { SocialSlide } from '../../../shared/types/slide';

export interface StreamGenerateOptions {
  token: string;
  body: GenerateRequest;
  signal: AbortSignal;
  onChunk: (text: string) => void;
  onComplete: (payload: { postId: string; slides: SocialSlide[]; caption: string }) => void;
  onError: (err: { message: string; code?: string }) => void;
}

export async function streamGenerate(opts: StreamGenerateOptions): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/generate', {
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

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    opts.onError({ message: (errBody as { error?: string }).error ?? 'Request failed' });
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  const handle = (line: string) => {
    if (!line) return;
    let evt: { type: string; [k: string]: unknown };
    try {
      evt = JSON.parse(line);
    } catch {
      return;
    }
    if (evt.type === 'chunk') {
      opts.onChunk(((evt as unknown as { text?: string }).text) ?? '');
    } else if (evt.type === 'complete') {
      opts.onComplete(evt as unknown as { postId: string; slides: SocialSlide[]; caption: string });
    } else if (evt.type === 'error') {
      const e = evt as unknown as { error?: string; code?: string };
      opts.onError({ message: e.error ?? 'Unknown error', code: e.code });
    }
  };

  while (true) {
    let value: Uint8Array | undefined;
    let done = false;
    try {
      const r = await reader.read();
      value = r.value;
      done = r.done;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      opts.onError({ message: (err as Error).message });
      return;
    }
    if (value) buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      handle(line);
    }
    if (done) {
      const tail = buf.trim();
      if (tail) handle(tail);
      return;
    }
  }
}
