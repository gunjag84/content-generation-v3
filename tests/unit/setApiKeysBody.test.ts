import { describe, it, expect } from 'vitest';
import { SetApiKeysBody } from '../../shared/schemas/apiKeys.js';

describe('SetApiKeysBody', () => {
  it('accepts anthropic only', () => {
    const r = SetApiKeysBody.safeParse({ anthropic: 'sk-ant-xxxxxxxxxxxxxxxxxxxx' });
    expect(r.success).toBe(true);
  });

  it('accepts metaGraph only', () => {
    const r = SetApiKeysBody.safeParse({ metaGraph: 'EAAxxxxxxxxxxxxxxxxxxx' });
    expect(r.success).toBe(true);
  });

  it('accepts both keys', () => {
    const r = SetApiKeysBody.safeParse({
      anthropic: 'sk-ant-xxxxxxxxxxxxxxxxxxxx',
      metaGraph: 'EAAxxxxxxxxxxxxxxxxxxx',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty object (refine fires)', () => {
    const r = SetApiKeysBody.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects anthropic too short', () => {
    const r = SetApiKeysBody.safeParse({ anthropic: 'sk-short' });
    expect(r.success).toBe(false);
  });

  it('rejects metaGraph too short', () => {
    const r = SetApiKeysBody.safeParse({ metaGraph: 'short' });
    expect(r.success).toBe(false);
  });
});
