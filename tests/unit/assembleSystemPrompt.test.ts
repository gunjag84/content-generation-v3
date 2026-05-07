import { describe, it, expect } from 'vitest';
import { assembleSystemPrompt, type BrandIdentityForPrompt } from '../../server/lib/assembleSystemPrompt.js';

// assembleSystemPrompt reads prompt files from `server/prompts/` relative to
// process.cwd(). Vitest runs with cwd = project root, so the paths resolve
// correctly when tests run via `pnpm test:unit` from the project root.

const baseInput = {
  method: 'story',
  methodName: 'Story',
  methodDescription: '',
  length: 'medium' as const,
  slideCount: 7,
  mode: 'create-demand' as const,
};

// The prompt files reference `<brand_identity>` and `<learned_patterns>` as
// content tokens (mostly inside backtick code spans) so we can't assert
// "<brand_identity>" doesn't appear in the output. Instead we look for the
// rendered block's distinctive children (<voice>, <persona>) and content.

describe('assembleSystemPrompt - brand_identity block', () => {
  it('produces no <voice>/<persona> tags when both are empty', () => {
    const output = assembleSystemPrompt({
      ...baseInput,
      brandIdentity: { voice: '', persona: '' },
    });
    expect(output).not.toContain('<voice>');
    expect(output).not.toContain('<persona>');
  });

  it('produces no <voice>/<persona> tags when identity is undefined', () => {
    const output = assembleSystemPrompt(baseInput);
    expect(output).not.toContain('<voice>');
    expect(output).not.toContain('<persona>');
  });

  it('includes voice element when voice is provided', () => {
    const identity: BrandIdentityForPrompt = {
      voice: 'Punchy short sentences.',
      persona: '',
    };
    const output = assembleSystemPrompt({ ...baseInput, brandIdentity: identity });
    expect(output).toContain('<voice>');
    expect(output).toContain('Punchy short sentences.');
    expect(output).toContain('</voice>');
    expect(output).not.toContain('<persona>');
  });

  it('includes both voice and persona when both are provided', () => {
    const identity: BrandIdentityForPrompt = {
      voice: 'Direct and warm.',
      persona: 'Expert friend, not a guru.',
    };
    const output = assembleSystemPrompt({ ...baseInput, brandIdentity: identity });
    expect(output).toContain('<voice>');
    expect(output).toContain('Direct and warm.');
    expect(output).toContain('<persona>');
    expect(output).toContain('Expert friend, not a guru.');
  });
});

describe('assembleSystemPrompt - learned_patterns block position', () => {
  it('places the learned_patterns block as the last layer (after mode)', () => {
    const sentinel = '<learned_patterns>\n  <hook>\n    - Use questions for hooks.\n  </hook>\n</learned_patterns>';
    const output = assembleSystemPrompt({ ...baseInput, patternsBlock: sentinel });

    expect(output).toContain(sentinel);
    expect(output.trimEnd().endsWith('</learned_patterns>')).toBe(true);
  });

  it('omits the rendered learned_patterns block when patternsBlock is empty', () => {
    const output = assembleSystemPrompt({ ...baseInput, patternsBlock: '' });
    // The standalone block emitted by the renderer is `<learned_patterns>\n` at
    // the start of a layer (after the join separator). Any inline reference in
    // the source markdown is harmless. Asserting on the layer-start pattern is
    // a more honest check than `not.toContain('<learned_patterns>')`.
    expect(output).not.toMatch(/\n---\n\n<learned_patterns>/);
  });

  it('omits the rendered learned_patterns block when patternsBlock is whitespace only', () => {
    const output = assembleSystemPrompt({ ...baseInput, patternsBlock: '   ' });
    expect(output).not.toMatch(/\n---\n\n<learned_patterns>/);
  });
});

describe('assembleSystemPrompt - generic fallback for user-added methods', () => {
  it('falls back to _generic.md when no slug template exists', () => {
    const output = assembleSystemPrompt({
      method: 'unknown-custom-method',
      methodName: 'Unknown Custom Method',
      methodDescription: 'A bespoke method the user authored in Settings.',
      length: 'medium',
      slideCount: 5,
      mode: 'create-demand',
    });
    expect(output).toContain('Unknown Custom Method');
    expect(output).toContain('A bespoke method the user authored in Settings.');
  });
});

describe('assembleSystemPrompt - length-keyed template resolution', () => {
  it('picks hormozi-ve-short.md for length=short', () => {
    const output = assembleSystemPrompt({
      method: 'hormozi-ve',
      methodName: 'Hormozi Value Equation',
      methodDescription: '',
      length: 'short',
      slideCount: 6,
      mode: 'convert-demand',
    });
    expect(output).toContain('Hormozi Value Equation | Kurz');
  });

  it('picks twist-the-knife-long.md for length=long', () => {
    const output = assembleSystemPrompt({
      method: 'twist-the-knife',
      methodName: 'Twist the Knife',
      methodDescription: '',
      length: 'long',
      slideCount: 9,
      mode: 'convert-demand',
    });
    expect(output).toContain('Twist the Knife | Lang');
  });

  it('falls back to legacy slide-count file for create-demand methods', () => {
    // story-{short,medium,long}.md does not exist; legacy story-7.md should be picked.
    const output = assembleSystemPrompt({
      method: 'story',
      methodName: 'Story',
      methodDescription: '',
      length: 'medium',
      slideCount: 7,
      mode: 'create-demand',
    });
    expect(output).toContain('Personal Story | 7 Slides');
  });
});
