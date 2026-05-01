// Assemble the 5-layer system prompt for Anthropic.
// Order: output-format -> base -> product -> methods/{method}-{count} -> modes/{mode}
// Filtering rules ported from v2 socialClub.ts (with Pillar -> Mode rename).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closestTemplateCount, type MethodSlug } from './methodResolution.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// __dirname at runtime is dist/server/lib/. Prompts live in source tree under server/prompts/.
// Use process.cwd() (server package root) instead, which is robust under tsx + compiled.
const PROMPT_ROOT = path.resolve(process.cwd(), 'server', 'prompts');

function readPrompt(...segments: string[]): string {
  const p = path.join(PROMPT_ROOT, ...segments);
  return fs.readFileSync(p, 'utf8');
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

// In convert-demand the mode file owns the full slide structure (story/liste/vorher-nachher
// tables). Drop the structure tables from the method file to avoid duplicate / conflicting
// instruction.
export function stripMethodStructureForConvertDemand(content: string): string {
  let out = content;
  out = out.replace(/### Story-Struktur[\s\S]*?(?=\n### |\n## |$)/g, '');
  out = out.replace(/### Liste-Struktur[\s\S]*?(?=\n### |\n## |$)/g, '');
  out = out.replace(/### Vorher\/Nachher-Struktur[\s\S]*?(?=\n### |\n## |$)/g, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// In the mode file, keep only the section that matches the chosen method.
export function filterModeByMethod(content: string, method: MethodSlug): string {
  let out = content;

  // Method-specific subsections in modes/*.md use headings like:
  //   ### Story (Create-Demand)
  //   ### Liste (Create-Demand)
  //   ### Vorher/Nachher (Create-Demand)
  // and (without suffix) ### Story-Struktur / ### Liste-Struktur / ### Vorher/Nachher-Struktur

  if (method !== 'story') {
    out = out.replace(/### Story \(Create-Demand\)[\s\S]*?(?=\n### |\n## |$)/g, '');
    out = out.replace(/### Story-Struktur[\s\S]*?(?=\n### |\n## |$)/g, '');
  }
  if (method !== 'liste') {
    out = out.replace(/### Liste \(Create-Demand\)[\s\S]*?(?=\n### |\n## |$)/g, '');
    out = out.replace(/### Liste-Struktur[\s\S]*?(?=\n### |\n## |$)/g, '');
  }
  if (method !== 'vorher-nachher') {
    out = out.replace(/### Vorher\/Nachher \(Create-Demand\)[\s\S]*?(?=\n### |\n## |$)/g, '');
    out = out.replace(/### Vorher\/Nachher-Struktur[\s\S]*?(?=\n### |\n## |$)/g, '');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function assembleSystemPrompt(
  method: MethodSlug,
  slideCount: number,
  mode: Mode,
): string {
  const isConvert = mode === 'convert-demand';
  const isCreate = mode === 'create-demand';
  const blocks: string[] = [];

  // Layer 1: output format
  let outputFormat = readPrompt('output-format.md');
  if (isConvert) {
    // Drop the create-demand-specific char limits (none defined yet — pattern preserved
    // for parity with v2 logic).
  }
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

  // Layer 4: method (zitat is shortcircuited upstream and never reaches here)
  const tc = closestTemplateCount(method, slideCount);
  let methodContent = readPrompt('methods', `${method}-${tc}.md`);
  if (isConvert) methodContent = stripMethodStructureForConvertDemand(methodContent);
  blocks.push(methodContent.trim());

  // Layer 5: mode (filtered to the selected method)
  const modeFile = mode === 'create-demand' ? 'create-demand.md' : 'convert-demand.md';
  let modeContent = readPrompt('modes', modeFile);
  modeContent = filterModeByMethod(modeContent, method);
  blocks.push(modeContent.trim());

  return blocks.join('\n\n---\n\n');
}
