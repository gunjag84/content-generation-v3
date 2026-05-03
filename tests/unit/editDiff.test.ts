import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  computeEditDiff,
  type ZoneEdit,
} from '../../shared/lib/editDiff.js';
import type { SocialSlide } from '../../shared/types/slide.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSlide(
  overrides: Partial<SocialSlide> & { zones?: { id: string; label: string; text: string }[] },
): SocialSlide {
  const zones = (overrides.zones ?? []).map((z) => ({
    id: z.id,
    label: z.label,
    text: z.text,
    x: 0,
    y: 0,
    w: 500,
    h: 100,
    fontSize: 32,
    fontFamily: 'Inter',
    fontWeight: 400,
    color: '#000000',
    alignH: 'left' as const,
    alignV: 'top' as const,
    italic: false,
    lineHeight: 1.4,
    letterSpacing: 0,
    rotation: 0,
  }));
  return {
    number: overrides.number ?? 1,
    type: overrides.type ?? 'photo',
    lines: [],
    zones,
    imageScale: 1,
    imageX: 0,
    imageY: 0,
    overlayOpacity: 0,
  };
}

// ── levenshtein ─────────────────────────────────────────────────────────────

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  it('returns source length when b is empty', () => {
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('returns target length when a is empty', () => {
    expect(levenshtein('', 'xyz')).toBe(3);
  });

  it('computes classic kitten → sitting correctly (distance 3)', () => {
    // kitten → sitten (substitute k→s)
    // sitten → sittin (substitute e→i)
    // sittin → sitting (insert g)
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('computes single character substitution', () => {
    expect(levenshtein('a', 'b')).toBe(1);
  });

  it('computes single insertion', () => {
    expect(levenshtein('abc', 'abcd')).toBe(1);
  });
});

// ── classifyZone (tested via computeEditDiff) ────────────────────────────────

describe('classifyZone via computeEditDiff', () => {
  it('classifies slide.type=cta zones as cta regardless of label', () => {
    const before = {
      slides: [
        makeSlide({
          type: 'cta',
          zones: [{ id: 'z1', label: 'Hook', text: 'Buy now' }],
        }),
      ],
      caption: '',
    };
    const after = {
      slides: [
        makeSlide({
          type: 'cta',
          zones: [{ id: 'z1', label: 'Hook', text: 'Order today' }],
        }),
      ],
      caption: '',
    };
    const diff = computeEditDiff(before, after);
    expect(diff.zones).toHaveLength(1);
    expect(diff.zones[0].zone).toBe('cta');
  });

  it('classifies label=Hook as hook', () => {
    const before = {
      slides: [
        makeSlide({ zones: [{ id: 'z1', label: 'Hook', text: 'Original hook' }] }),
      ],
      caption: '',
    };
    const after = {
      slides: [
        makeSlide({ zones: [{ id: 'z1', label: 'Hook', text: 'New hook text here' }] }),
      ],
      caption: '',
    };
    const diff = computeEditDiff(before, after);
    expect(diff.zones[0].zone).toBe('hook');
  });

  it('classifies label=Body as body', () => {
    const before = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Body', text: 'Old body' }] })],
      caption: '',
    };
    const after = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Body', text: 'New body content' }] })],
      caption: '',
    };
    const diff = computeEditDiff(before, after);
    expect(diff.zones[0].zone).toBe('body');
  });

  it('classifies label=Subtle as body', () => {
    const before = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Subtle', text: 'Subtle old' }] })],
      caption: '',
    };
    const after = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Subtle', text: 'Subtle new' }] })],
      caption: '',
    };
    const diff = computeEditDiff(before, after);
    expect(diff.zones[0].zone).toBe('body');
  });

  it('excludes Brand/Divider labels (null classification)', () => {
    const before = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Brand', text: 'Logo' }] })],
      caption: '',
    };
    const after = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Brand', text: 'New Logo' }] })],
      caption: '',
    };
    const diff = computeEditDiff(before, after);
    expect(diff.zones).toHaveLength(0);
  });
});

// ── computeEditDiff ─────────────────────────────────────────────────────────

describe('computeEditDiff', () => {
  it('returns empty zones and totalRatio=0 for identical input', () => {
    const snap = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Hook', text: 'Same text' }] })],
      caption: 'Same caption',
    };
    const diff = computeEditDiff(snap, snap);
    expect(diff.zones).toHaveLength(0);
    expect(diff.totalRatio).toBe(0);
  });

  it('returns one hook ZoneEdit when only hook text changes', () => {
    const before = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Hook', text: 'Original' }] })],
      caption: '',
    };
    const after = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Hook', text: 'Completely different' }] })],
      caption: '',
    };
    const diff = computeEditDiff(before, after);
    expect(diff.zones).toHaveLength(1);
    expect(diff.zones[0].zone).toBe('hook');
    expect(diff.zones[0].slideIndex).toBe(0);
    expect(diff.byZone.hook.ratio).toBeGreaterThan(0);
    expect(diff.totalRatio).toBeGreaterThan(0);
  });

  it('returns one caption ZoneEdit with slideIndex=null when only caption changes', () => {
    const before = {
      slides: [makeSlide({ zones: [] })],
      caption: 'Old caption text',
    };
    const after = {
      slides: [makeSlide({ zones: [] })],
      caption: 'Completely new caption content',
    };
    const diff = computeEditDiff(before, after);
    const captionEdits = diff.zones.filter((z) => z.zone === 'caption');
    expect(captionEdits).toHaveLength(1);
    expect(captionEdits[0].slideIndex).toBeNull();
    expect(diff.byZone.caption.ratio).toBeGreaterThan(0);
  });

  it('aggregates multiple zone edits into byZone correctly', () => {
    const before = {
      slides: [
        makeSlide({
          zones: [
            { id: 'z1', label: 'Hook', text: 'Hook text' },
            { id: 'z2', label: 'Body', text: 'Body text' },
          ],
        }),
      ],
      caption: 'Caption old',
    };
    const after = {
      slides: [
        makeSlide({
          zones: [
            { id: 'z1', label: 'Hook', text: 'Different hook' },
            { id: 'z2', label: 'Body', text: 'Different body content' },
          ],
        }),
      ],
      caption: 'Caption new',
    };
    const diff = computeEditDiff(before, after);
    // Should have 3 edits: hook, body, caption
    expect(diff.zones.length).toBeGreaterThanOrEqual(3);
    expect(diff.byZone.hook.ratio).toBeGreaterThan(0);
    expect(diff.byZone.body.ratio).toBeGreaterThan(0);
    expect(diff.byZone.caption.ratio).toBeGreaterThan(0);
  });
});

// ── diffHash ────────────────────────────────────────────────────────────────

describe('diffHash', () => {
  it('is deterministic - same input produces same hash', () => {
    const before = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Hook', text: 'Original' }] })],
      caption: '',
    };
    const after = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Hook', text: 'Edited' }] })],
      caption: '',
    };
    const diff1 = computeEditDiff(before, after);
    const diff2 = computeEditDiff(before, after);
    expect(diff1.diffHash).toBe(diff2.diffHash);
  });

  it('produces different hashes for different diffs', () => {
    const base = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Hook', text: 'Original' }] })],
      caption: '',
    };
    const afterA = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Hook', text: 'Edit A' }] })],
      caption: '',
    };
    const afterB = {
      slides: [makeSlide({ zones: [{ id: 'z1', label: 'Hook', text: 'Edit B is very different' }] })],
      caption: '',
    };
    const hashA = computeEditDiff(base, afterA).diffHash;
    const hashB = computeEditDiff(base, afterB).diffHash;
    expect(hashA).not.toBe(hashB);
  });
});
