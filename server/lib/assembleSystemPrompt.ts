// Assemble the system prompt for Anthropic.
//
// Order: output-format -> base -> product -> [brand_identity] -> method -> mode
//        -> [learned_patterns]
//
// Method resolution:
//   1. Try methods/{slug}-{slideCount}.md (built-in template per slide-count).
//   2. Fall back to methods/{slug}.md (slug-only template).
//   3. Fall back to methods/_generic.md with the method's name + description
//      injected as <method_definition>. This is the path user-added methods take.
//
// Mode-aware filtering of output-format / base / product / mode is preserved.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// __dirname at runtime is dist/server/lib/. Prompts live in source tree under server/prompts/.
// Use process.cwd() (server package root) instead, which is robust under tsx + compiled.
const PROMPT_ROOT = path.resolve(process.cwd(), 'server', 'prompts');

function readPrompt(...segments: string[]): string {
  const p = path.join(PROMPT_ROOT, ...segments);
  return fs.readFileSync(p, 'utf8');
}

function tryReadPrompt(...segments: string[]): string | null {
  const p = path.join(PROMPT_ROOT, ...segments);
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

export type Mode = 'create-demand' | 'convert-demand';

// Strip the product layer down to brand name + hashtags only for create-demand.
// Create-Demand posts must have zero product mention; Claude should not see
// bridge patterns or CTA templates.
export function stripProductForCreateDemand(content: string): string {
  const lines: string[] = ['# Produkt-Kontext (Create-Demand: nur Markenname + Hashtags)', ''];

  const idMatch = content.match(/## Identität[\s\S]*?(?=\n## )/);
  if (idMatch) {
    const nameMatch = idMatch[0].match(/- Markenname.*/);
    if (nameMatch) lines.push(nameMatch[0]);
  }

  const hashMatch = content.match(/## Pflicht-Hashtags[\s\S]*?(?=\n## |$)/);
  if (hashMatch) {
    lines.push('');
    lines.push(hashMatch[0].trim());
  }

  return lines.join('\n');
}

export interface BrandIdentityForPrompt {
  voice: string;
  persona: string;
}

function renderBrandIdentityBlock(identity?: BrandIdentityForPrompt): string {
  if (!identity) return '';
  const voice = identity.voice?.trim() ?? '';
  const persona = identity.persona?.trim() ?? '';
  if (!voice && !persona) return '';
  const lines: string[] = ['<brand_identity>'];
  if (voice) {
    lines.push('  <voice>');
    lines.push(`    ${voice}`);
    lines.push('  </voice>');
  }
  if (persona) {
    lines.push('  <persona>');
    lines.push(`    ${persona}`);
    lines.push('  </persona>');
  }
  lines.push('</brand_identity>');
  return lines.join('\n');
}

// Resolve the method-layer content. Built-in shipped templates win; otherwise
// the generic template gets the method's name + description injected so
// user-added methods generate end-to-end without a code deploy.
function resolveMethodContent(
  method: string,
  slideCount: number,
  methodName: string,
  methodDescription: string,
): string {
  const slugCount = tryReadPrompt('methods', `${method}-${slideCount}.md`);
  if (slugCount) return slugCount;
  const slugOnly = tryReadPrompt('methods', `${method}.md`);
  if (slugOnly) return slugOnly;
  const generic = readPrompt('methods', '_generic.md');
  return generic
    .replace(/{{METHOD_NAME}}/g, methodName)
    .replace(/{{METHOD_DESCRIPTION}}/g, methodDescription || '(keine Beschreibung gepflegt)')
    .replace(/{{SLIDE_COUNT}}/g, String(slideCount));
}

export interface AssembleSystemPromptInput {
  method: string;
  methodName: string;
  methodDescription: string;
  slideCount: number;
  mode: Mode;
  patternsBlock?: string;
  brandIdentity?: BrandIdentityForPrompt;
}

export function assembleSystemPrompt(input: AssembleSystemPromptInput): string {
  const { method, methodName, methodDescription, slideCount, mode, patternsBlock, brandIdentity } = input;
  const isConvert = mode === 'convert-demand';
  const isCreate = mode === 'create-demand';
  const blocks: string[] = [];

  // Layer 1: output format
  let outputFormat = readPrompt('output-format.md');
  if (isCreate) {
    // Convert-Demand-only: dual caption block + the convert-demand char-limit table.
    outputFormat = outputFormat.replace(
      /## Doppelte Caption[\s\S]*?(?=\n## |$)/,
      '',
    );
    outputFormat = outputFormat.replace(
      /## Zeichenlimits nach Slide-Rolle \(Convert-Demand\)[\s\S]*?(?=\n## |$)/,
      '',
    );
  }
  blocks.push(outputFormat.replace(/\n{3,}/g, '\n\n').trim());

  // Layer 2: base
  let base = readPrompt('base.md');
  if (isCreate) {
    // Strip product-bridge voice pattern (conflicts with create-demand "zero product").
    base = base.replace(
      /### Produktbrücke in Listen und Tipps[\s\S]*?(?=\n### |\n## |$)/,
      '',
    );
  }
  blocks.push(base.replace(/\n{3,}/g, '\n\n').trim());

  // Layer 3: product
  if (isCreate) {
    blocks.push(stripProductForCreateDemand(readPrompt('product.md')));
  } else {
    blocks.push(readPrompt('product.md').trim());
  }

  // Layer 3.5: brand identity (voice + persona, user-edited)
  const identityBlock = renderBrandIdentityBlock(brandIdentity);
  if (identityBlock) blocks.push(identityBlock);

  // Layer 4: method (zitat is shortcircuited upstream and never reaches here).
  // Built-in templates own the slide-by-slide table; the generic fallback
  // forwards the user-authored description as the method definition.
  const methodContent = resolveMethodContent(method, slideCount, methodName, methodDescription);
  blocks.push(methodContent.trim());

  // Layer 5: mode (no method-specific filtering needed any more — convert-demand.md
  // is method-agnostic; method file owns the slide structure).
  const modeFile = mode === 'create-demand' ? 'create-demand.md' : 'convert-demand.md';
  blocks.push(readPrompt('modes', modeFile).trim());

  // Layer 6 (optional): brand-specific learned patterns from prior edits.
  if (patternsBlock && patternsBlock.trim().length > 0) {
    blocks.push(patternsBlock.trim());
  }

  return blocks.join('\n\n---\n\n');
}
