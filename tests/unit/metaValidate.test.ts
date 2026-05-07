import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { validateMetaToken, validateIgUserId } from '../../server/lib/metaValidate.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function mockFetch(impl: (url: string) => Promise<Response> | Response) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return impl(url);
  }) as unknown as typeof fetch;
}

describe('validateMetaToken', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns ok with name+id on happy response', async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ name: 'Page', id: '12345' }), { status: 200 }),
    );
    const r = await validateMetaToken('EAAxxxxxxxxxxxxxxxxxxx');
    expect(r).toEqual({ ok: true, name: 'Page', id: '12345' });
  });

  it('returns ok=false on code 190 (token expired)', async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({ error: { code: 190, message: 'Token expired' } }),
        { status: 401 },
      ),
    );
    const r = await validateMetaToken('EAAxxxxxxxxxxxxxxxxxxx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Account nicht zugänglich');
  });

  it('returns ok=false on code 100 (bad param)', async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ error: { code: 100, message: 'Bad' } }), {
        status: 400,
      }),
    );
    const r = await validateMetaToken('EAAxxxxxxxxxxxxxxxxxxx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Account nicht zugänglich');
  });

  it('returns ok=false on network failure', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('ECONNRESET'))) as unknown as typeof fetch;
    const r = await validateMetaToken('EAAxxxxxxxxxxxxxxxxxxx');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Netzwerkfehler beim Token-Check');
  });
});

describe('validateIgUserId', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns username on happy response', async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ username: 'leben.lieben', name: 'LL' }), {
        status: 200,
      }),
    );
    const r = await validateIgUserId('token', '17841000000000');
    expect(r).toEqual({ ok: true, username: 'leben.lieben' });
  });

  it('returns ok=false when username missing', async () => {
    mockFetch(() => new Response(JSON.stringify({ name: 'no username field' }), { status: 200 }));
    const r = await validateIgUserId('token', '17841000000000');
    expect(r.ok).toBe(false);
  });

  it('returns ok=false on Meta error', async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ error: { code: 100, message: 'Bad ID' } }), {
        status: 400,
      }),
    );
    const r = await validateIgUserId('token', '99999');
    expect(r.ok).toBe(false);
  });

  it('returns ok=false on network timeout', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('timeout'))) as unknown as typeof fetch;
    const r = await validateIgUserId('token', '17841000000000');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Netzwerkfehler beim IG-Check');
  });
});
