import { describe, it, expect } from 'vitest';
import { renderPatternsBlock } from '../../server/lib/learnedPatterns.js';
import type { LoadedPattern } from '../../server/lib/learnedPatterns.js';

// renderPatternsBlock is a pure function - no Firebase dependency.
// The Firebase-dependent functions (loadTopPatterns, markPatternsUsed) are
// tested in tests/integration/.

function makePattern(overrides: Partial<LoadedPattern>): LoadedPattern {
  return {
    id: overrides.id ?? 'pat1',
    description: overrides.description ?? 'Use punchy short sentences.',
    confidence: overrides.confidence ?? 0.8,
    zone: overrides.zone ?? 'hook',
    sourcePostId: 'post-abc',
    sourceMethod: 'story',
    sourceMode: 'create-demand',
    sourceLength: 'medium',
    idempotencyKey: 'post-abc_abc123_hook',
    status: 'active',
    promotionCandidate: false,
    createdAt: null,
    lastUsedAt: null,
    useCount: 1,
    ...overrides,
  };
}

describe('renderPatternsBlock', () => {
  it('returns empty string for empty patterns array', () => {
    expect(renderPatternsBlock([])).toBe('');
  });

  it('wraps a single hook pattern in correct XML structure', () => {
    const patterns = [makePattern({ zone: 'hook', description: 'Start with a question.' })];
    const block = renderPatternsBlock(patterns);
    expect(block).toContain('<learned_patterns>');
    expect(block).toContain('</learned_patterns>');
    expect(block).toContain('<hook>');
    expect(block).toContain('</hook>');
    expect(block).toContain('- Start with a question.');
    // Other zones should not appear
    expect(block).not.toContain('<body>');
    expect(block).not.toContain('<cta>');
    expect(block).not.toContain('<caption>');
  });

  it('groups multi-zone patterns under their correct zone elements', () => {
    const patterns = [
      makePattern({ id: 'p1', zone: 'hook', description: 'Hook rule.' }),
      makePattern({ id: 'p2', zone: 'body', description: 'Body rule.' }),
      makePattern({ id: 'p3', zone: 'cta', description: 'CTA rule.' }),
      makePattern({ id: 'p4', zone: 'caption', description: 'Caption rule.' }),
    ];
    const block = renderPatternsBlock(patterns);
    expect(block).toContain('<hook>');
    expect(block).toContain('- Hook rule.');
    expect(block).toContain('</hook>');
    expect(block).toContain('<body>');
    expect(block).toContain('- Body rule.');
    expect(block).toContain('</body>');
    expect(block).toContain('<cta>');
    expect(block).toContain('- CTA rule.');
    expect(block).toContain('</cta>');
    expect(block).toContain('<caption>');
    expect(block).toContain('- Caption rule.');
    expect(block).toContain('</caption>');
  });

  it('places multiple patterns in the same zone under one zone element', () => {
    const patterns = [
      makePattern({ id: 'p1', zone: 'hook', description: 'Rule one.' }),
      makePattern({ id: 'p2', zone: 'hook', description: 'Rule two.' }),
    ];
    const block = renderPatternsBlock(patterns);
    // Only one <hook> / </hook> pair
    const hookOpenCount = (block.match(/<hook>/g) ?? []).length;
    expect(hookOpenCount).toBe(1);
    expect(block).toContain('- Rule one.');
    expect(block).toContain('- Rule two.');
  });
});
