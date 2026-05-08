// Tests for the NDJSON stream consumer in streamGenerate.
// Key invariant: the parser must handle the case where the final event in the
// stream arrives without a trailing newline (i.e. the server closes the stream
// mid-line from the parser's perspective).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamGenerate } from './streamGenerate';
import type { StreamGenerateOptions } from './streamGenerate';

afterEach(() => {
  vi.restoreAllMocks();
});

function buildStream(ndjson: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(ndjson);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function stubFetch(stream: ReadableStream<Uint8Array>): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }));
}

const baseOpts: Omit<StreamGenerateOptions, 'onChunk' | 'onComplete' | 'onError'> = {
  token: 'test-token',
  body: {
    brandId: 'b1',
    mode: 'create-demand',
    method: 'basic',
    situationText: 'test situation here',
    situationId: null,
    length: 'medium',
    photos: [],
  },
  signal: new AbortController().signal,
};

describe('streamGenerate — trailing-byte edge case', () => {
  it('surfaces the complete event when the last line has no trailing newline', async () => {
    const completeEvent = {
      type: 'complete',
      postId: 'p1',
      slides: [],
      caption: 'test caption',
    };

    // Build NDJSON where the "complete" line is the last chunk with NO trailing \n.
    const ndjson = `{"type":"chunk","text":"hello"}\n${JSON.stringify(completeEvent)}`;
    expect(ndjson.endsWith('\n')).toBe(false); // guard: confirm the invariant

    stubFetch(buildStream(ndjson));

    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await streamGenerate({ ...baseOpts, onChunk, onComplete, onError });

    expect(onError).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith('hello');
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'p1', slides: [], caption: 'test caption' }),
    );
  });

  it('surfaces the complete event when the stream emits only a single no-newline chunk', async () => {
    const completeEvent = { type: 'complete', postId: 'p2', slides: [], caption: 'solo' };
    const ndjson = JSON.stringify(completeEvent); // no newline at all

    stubFetch(buildStream(ndjson));

    const onComplete = vi.fn();
    const onError = vi.fn();

    await streamGenerate({ ...baseOpts, onChunk: vi.fn(), onComplete, onError });

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ postId: 'p2' }));
  });
});
