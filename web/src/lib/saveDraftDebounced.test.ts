// Tests for saveDraftDebounced.
// Core invariant: the patch sent to Firestore must NEVER include `aiSnapshot`.
// The DraftPatch type enforces this at compile time; this test confirms it at
// runtime — even when aiSnapshot is in scope in the calling context.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveDraftDebounced, AUTOSAVE_DELAY_MS, __flushAllForTest } from './saveDraftDebounced';

// Mock ./firebase so firebase.ts never executes (avoids import.meta.env issues).
vi.mock('./firebase', () => ({ db: {} }));

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
}));

describe('saveDraftDebounced — no aiSnapshot in Firestore patch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUpdateDoc.mockClear();
  });

  afterEach(() => {
    __flushAllForTest();
    vi.useRealTimers();
  });

  it('omits aiSnapshot when patch contains only slides + caption', async () => {
    saveDraftDebounced('uid1', 'brand1', 'post1', { slides: [], caption: 'user text' });

    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS + 10);
    await Promise.resolve(); // allow the fire-and-forget updateDoc to be called

    expect(mockUpdateDoc).toHaveBeenCalledOnce();
    const [, patch] = mockUpdateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(patch).not.toHaveProperty('aiSnapshot');
    expect(patch).toHaveProperty('caption', 'user text');
    expect(patch).toHaveProperty('updatedAt', '__SERVER_TS__');
  });

  it('omits aiSnapshot even when the calling scope has an aiSnapshot variable in scope', async () => {
    // aiSnapshot intentionally in scope here — simulates a caller that has
    // generated content and must not accidentally include it in the draft patch.
    const aiSnapshot = { slides: [{ number: 1 }], caption: 'ai-generated' };

    const userCaption = 'edited by user';
    saveDraftDebounced('uid1', 'brand1', 'post2', {
      // Only DraftPatch fields — aiSnapshot stays out by type contract.
      slides: [],
      caption: userCaption,
    });

    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS + 10);
    await Promise.resolve();

    expect(mockUpdateDoc).toHaveBeenCalledOnce();
    const [, patch] = mockUpdateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(patch).not.toHaveProperty('aiSnapshot');
    expect(patch).toHaveProperty('caption', userCaption);

    void aiSnapshot; // prevent unused-variable lint warning
  });

  it('merges accumulated patches and omits aiSnapshot from the merged result', async () => {
    // Two rapid calls — debounce coalesces them. Neither should produce aiSnapshot.
    saveDraftDebounced('uid1', 'brand1', 'post3', { caption: 'draft 1' });
    saveDraftDebounced('uid1', 'brand1', 'post3', { slides: [] });

    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS + 10);
    await Promise.resolve();

    // Only one Firestore write (debounced).
    expect(mockUpdateDoc).toHaveBeenCalledOnce();
    const [, patch] = mockUpdateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(patch).not.toHaveProperty('aiSnapshot');
    expect(patch).toHaveProperty('caption', 'draft 1');
    expect(patch).toHaveProperty('slides');
  });
});
