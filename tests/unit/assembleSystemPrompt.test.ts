import { describe, it, expect } from 'vitest';
import { assembleSystemPrompt, type BrandIdentityForPrompt } from '../../server/lib/assembleSystemPrompt.js';

// assembleSystemPrompt reads prompt files from `server/prompts/` relative to
// process.cwd(). Vitest runs with cwd = project root, so the paths resolve
// correctly when tests run via `pnpm test:unit` from the project root.

describe('assembleSystemPrompt - brand_identity block', () => {
  it('produces no brand_identity block when both voice and persona are empty', () => {
    const output = assembleSystemPrompt('story', 7, 'create-demand', undefined, {
      voice: '',
      persona: '',
    });
    expect(output).not.toContain('<brand_identity>');
  });

  it('produces no brand_identity block when identity is undefined', () => {
    const output = assembleSystemPrompt('story', 7, 'create-demand');
    expect(output).not.toContain('<brand_identity>');
  });

  it('includes voice element when voice is provided', () => {
    const identity: BrandIdentityForPrompt = {
      voice: 'Punchy short sentences.',
      persona: '',
    };
    const output = assembleSystemPrompt('story', 7, 'create-demand', undefined, identity);
    expect(output).toContain('<brand_identity>');
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
    const output = assembleSystemPrompt('story', 7, 'create-demand', undefined, identity);
    expect(output).toContain('<voice>');
    expect(output).toContain('Direct and warm.');
    expect(output).toContain('<persona>');
    expect(output).toContain('Expert friend, not a guru.');
  });
});

describe('assembleSystemPrompt - learned_patterns block position', () => {
  it('places the learned_patterns block as the last layer (after mode)', () => {
    const patternsBlock = '<learned_patterns>\n  <hook>\n    - Use questions.\n  </hook>\n</learned_patterns>';
    const output = assembleSystemPrompt('story', 7, 'create-demand', patternsBlock);

    // The output is blocks joined by `\n\n---\n\n`. The patterns block must
    // appear after the mode block, so its position must be the last occurrence.
    const patternsPos = output.lastIndexOf('<learned_patterns>');
    expect(patternsPos).toBeGreaterThan(-1);

    // Verify nothing follows the closing tag of the patterns block
    const afterPatterns = output.slice(patternsPos).trim();
    expect(afterPatterns.startsWith('<learned_patterns>')).toBe(true);
    // The last meaningful content is the patterns block itself
    expect(output.trimEnd().endsWith('</learned_patterns>')).toBe(true);
  });

  it('omits learned_patterns block when patternsBlock is empty string', () => {
    const output = assembleSystemPrompt('story', 7, 'create-demand', '');
    expect(output).not.toContain('<learned_patterns>');
  });

  it('omits learned_patterns block when patternsBlock is whitespace only', () => {
    const output = assembleSystemPrompt('story', 7, 'create-demand', '   ');
    expect(output).not.toContain('<learned_patterns>');
  });
});
