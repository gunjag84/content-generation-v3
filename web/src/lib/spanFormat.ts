// DOM ↔ TextSpan[] conversion + per-selection formatting for the inline editor.
// All functions are pure browser DOM ops — no React, no Firestore.
//
// Storage model: a TextSpan is `{text, color?, fontFamily?, fontSize?, fontWeight?, italic?}`.
// In the editing DOM each span maps to a <span style="..."> child; runs with no
// overrides emit a bare text node.

import type { TextSpan } from '../../../shared/types/slide';

// ---------------------------------------------------------------------------
// Serialize: TextSpan[] → HTML string (used to seed contentEditable on mount)
// ---------------------------------------------------------------------------
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function styleForSpan(s: TextSpan): string {
  const parts: string[] = [];
  if (s.color) parts.push(`color:${s.color}`);
  if (s.fontFamily) parts.push(`font-family:${s.fontFamily}`);
  if (s.fontSize !== undefined) parts.push(`font-size:${s.fontSize}px`);
  if (s.fontWeight !== undefined) parts.push(`font-weight:${s.fontWeight}`);
  if (s.italic === true) parts.push('font-style:italic');
  if (s.italic === false) parts.push('font-style:normal');
  return parts.join(';');
}

export function spansToInlineHtml(spans: TextSpan[]): string {
  if (spans.length === 0) return '';
  return spans
    .map((s) => {
      const style = styleForSpan(s);
      if (!style) return escapeHtml(s.text);
      return `<span style="${style}">${escapeHtml(s.text)}</span>`;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Parse: contentEditable DOM → TextSpan[]
// Walks child nodes; <span> with style maps to a span with overrides,
// other text-bearing nodes (text nodes, <br>, nested) flatten to no-override
// spans. Adjacent spans with identical style are merged so the storage
// representation stays compact.
// ---------------------------------------------------------------------------
function pxToNumber(raw: string): number | undefined {
  const m = /^([\d.]+)px$/.exec(raw.trim());
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function readSpanFromElement(el: HTMLElement, accumText: string): TextSpan {
  const span: TextSpan = { text: accumText };
  const style = el.style;
  // color: browsers normalize to rgb(...) — accept anything truthy and pass through.
  // Editor canvas color rendering is style: color (string), so rgb() works fine.
  if (style.color) span.color = style.color;
  if (style.fontFamily) span.fontFamily = stripFontFamilyQuotes(style.fontFamily);
  const fs = pxToNumber(style.fontSize);
  if (fs !== undefined) span.fontSize = fs;
  if (style.fontWeight) {
    const w = parseInt(style.fontWeight, 10);
    if (Number.isFinite(w)) span.fontWeight = w;
  }
  if (style.fontStyle === 'italic') span.italic = true;
  else if (style.fontStyle === 'normal') span.italic = false;
  return span;
}

function stripFontFamilyQuotes(raw: string): string {
  // CSSOM may return `'Inter'` or `"Inter", sans-serif` etc. Take the first
  // family and strip wrapping quotes.
  const first = raw.split(',')[0].trim();
  return first.replace(/^['"]/, '').replace(/['"]$/, '');
}

function gatherText(node: Node): string {
  // Plain textContent, with <br> -> '\n' so multi-line edits survive.
  // ContentEditable inserts <br> on Shift+Enter / wraps lines in <div> on Enter.
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (el.tagName === 'BR') return '\n';
    if (el.tagName === 'DIV' || el.tagName === 'P') {
      // ContentEditable wraps lines in <div> after Enter. Prepend newline unless
      // it's the very first child (already at the start of the content).
      const prefix = el.previousSibling ? '\n' : '';
      return prefix + Array.from(el.childNodes).map(gatherText).join('');
    }
    return Array.from(el.childNodes).map(gatherText).join('');
  }
  return '';
}

function spansEqualStyle(a: TextSpan, b: TextSpan): boolean {
  return (
    a.color === b.color &&
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontWeight === b.fontWeight &&
    a.italic === b.italic
  );
}

export function domToSpans(root: HTMLElement): TextSpan[] {
  const spans: TextSpan[] = [];

  function visit(node: Node, inheritedStyle: Partial<TextSpan>) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text.length === 0) return;
      spans.push({ ...inheritedStyle, text });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (el.tagName === 'BR') {
      spans.push({ ...inheritedStyle, text: '\n' });
      return;
    }

    // DIV/P from contentEditable line-break — insert newline before content
    // (unless we're at the very start).
    if ((el.tagName === 'DIV' || el.tagName === 'P') && el.previousSibling) {
      spans.push({ ...inheritedStyle, text: '\n' });
    }

    // Merge own style into inherited
    const own = readSpanFromElement(el, '');
    const merged: Partial<TextSpan> = { ...inheritedStyle };
    if (own.color !== undefined) merged.color = own.color;
    if (own.fontFamily !== undefined) merged.fontFamily = own.fontFamily;
    if (own.fontSize !== undefined) merged.fontSize = own.fontSize;
    if (own.fontWeight !== undefined) merged.fontWeight = own.fontWeight;
    if (own.italic !== undefined) merged.italic = own.italic;

    for (const child of Array.from(el.childNodes)) visit(child, merged);
  }

  for (const child of Array.from(root.childNodes)) visit(child, {});

  // Drop spans with empty text, merge adjacent spans with identical style.
  const cleaned: TextSpan[] = [];
  for (const s of spans) {
    if (s.text.length === 0) continue;
    const last = cleaned[cleaned.length - 1];
    if (last && spansEqualStyle(last, s)) {
      last.text += s.text;
    } else {
      cleaned.push({ ...s });
    }
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Selection helpers — apply a per-span override to the active text selection.
// Returns true when a non-collapsed selection inside a contentEditable was
// found and modified; false otherwise (caller should fall back to whole-zone
// formatting).
// ---------------------------------------------------------------------------
function findContentEditableAncestor(node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      if (el.isContentEditable) return el;
    }
    n = n.parentNode;
  }
  return null;
}

export type SpanFormatKey =
  | 'color'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'italic';

function applyStyleToElement(el: HTMLElement, prop: SpanFormatKey, value: unknown) {
  switch (prop) {
    case 'color':
      el.style.color = String(value);
      break;
    case 'fontFamily':
      el.style.fontFamily = String(value);
      break;
    case 'fontSize':
      el.style.fontSize = `${Number(value)}px`;
      break;
    case 'fontWeight':
      el.style.fontWeight = String(value);
      break;
    case 'italic':
      el.style.fontStyle = value ? 'italic' : 'normal';
      break;
  }
}

// Last-known editable selection. Captured on mousedown of format controls
// (which moves focus away from the contentEditable and would otherwise lose
// the selection). When the format finally commits — e.g. user picks a color
// from a popover that requires several clicks — we restore from this.
let savedRange: Range | null = null;

/** Capture the current selection if it's a non-collapsed range inside a
 *  contentEditable. Call from `onMouseDown` of format controls so the
 *  selection survives focus-stealing children (popovers, color picker, etc.).
 *
 *  NON-DESTRUCTIVE: this only ever *updates* savedRange when there is a valid
 *  non-collapsed contentEditable selection. It never wipes savedRange to null.
 *  This is essential for multi-step controls like the color popover: the first
 *  mousedown (opening the popover) captures the word selection, and the later
 *  mousedowns inside the popover (hex input, recent swatches) — by which point
 *  focus has left the contentEditable and the live selection is collapsed —
 *  must NOT clobber it, or the color falls back to whole-zone formatting.
 *  savedRange is reset explicitly via clearSavedSelection() on editor unmount. */
export function captureSelection(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const r = sel.getRangeAt(0);
  if (r.collapsed) return;
  if (!findContentEditableAncestor(r.commonAncestorContainer)) return;
  savedRange = r.cloneRange();
}

/** Clear the saved selection. Call when the inline editor unmounts so we
 *  don't apply formats to dangling DOM nodes after the user exited edit
 *  mode. */
export function clearSavedSelection(): void {
  savedRange = null;
}

/** Effective rendered font-size (px) of the current — or last-saved —
 *  contentEditable selection, or null when there is no editable selection.
 *  Used by the size stepper so +/- increments from the SELECTION's actual
 *  size (cumulative), not from the zone default. */
export function getActiveSelectionFontSizePx(): number | null {
  const sel = window.getSelection();
  let range: Range | null = null;
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if (findContentEditableAncestor(r.commonAncestorContainer)) range = r;
  }
  if (!range && savedRange && document.contains(savedRange.commonAncestorContainer)) {
    range = savedRange;
  }
  if (!range) return null;
  const node = range.startContainer;
  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node) as HTMLElement | null;
  if (!el) return null;
  const px = parseFloat(getComputedStyle(el).fontSize);
  return Number.isFinite(px) ? Math.round(px) : null;
}

/** Apply a per-span format to the current selection inside any contentEditable.
 *  Returns true if applied; false if no active editable selection. */
export function applyFormatToSelection(
  prop: SpanFormatKey,
  value: unknown,
): boolean {
  const sel = window.getSelection();
  let range: Range | null = null;
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if (!r.collapsed && findContentEditableAncestor(r.commonAncestorContainer)) {
      range = r;
    }
  }
  // Fall back to saved selection (popover/color-picker workflow).
  if (!range && savedRange) {
    if (!document.contains(savedRange.commonAncestorContainer)) {
      savedRange = null;
      return false;
    }
    range = savedRange.cloneRange();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  if (!range) return false;

  // extractContents pulls the selected DocumentFragment out; wrap in a single
  // <span> with the new style and re-insert. Nested style spans inside the
  // fragment survive as-is; domToSpans on commit will merge runs with
  // identical effective style. (Per-prop conflicts are resolved by the outer
  // wrapper "winning" because inline style on the outer overrides inner only
  // for that one prop. To make outer truly win we'd need to walk + strip the
  // same prop from inner spans — but contentEditable users overwhelmingly
  // want "this prop applied to the selection", which is what the outer
  // wrapper achieves visually because the outer span's inline style is
  // evaluated by the browser per-property. For mixed selections users get
  // exactly the new value across the whole selection.)
  const wrapper = document.createElement('span');
  applyStyleToElement(wrapper, prop, value);
  wrapper.appendChild(range.extractContents());

  // Strip the same property from descendants so the outer truly wins for
  // mixed selections (e.g. user had red+blue, picks green → all green).
  stripPropFromDescendants(wrapper, prop);

  range.insertNode(wrapper);

  // Reselect the inserted content so further format clicks chain naturally.
  const sel2 = window.getSelection();
  if (sel2) {
    sel2.removeAllRanges();
    const nr = document.createRange();
    nr.selectNodeContents(wrapper);
    sel2.addRange(nr);
  }
  return true;
}

function stripPropFromDescendants(root: HTMLElement, prop: SpanFormatKey) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  let node: Node | null = walker.nextNode();
  while (node) {
    const el = node as HTMLElement;
    if (el !== root) {
      switch (prop) {
        case 'color': el.style.removeProperty('color'); break;
        case 'fontFamily': el.style.removeProperty('font-family'); break;
        case 'fontSize': el.style.removeProperty('font-size'); break;
        case 'fontWeight': el.style.removeProperty('font-weight'); break;
        case 'italic': el.style.removeProperty('font-style'); break;
      }
    }
    node = walker.nextNode();
  }
}
