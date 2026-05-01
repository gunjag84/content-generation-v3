// Ported verbatim from v2 client/src/lib/font-loader.ts.
// Lazily injects Google/Fontshare stylesheets the first time a font is requested,
// so the editor's font dropdown can preview real typefaces without bundling them.

export const FONT_FAMILIES = [
  // Clean / modern
  'Satoshi',
  'Geist',
  'Geist Mono',
  'Inter',
  'Josefin Sans',
  'Roboto',
  'Roboto Condensed',
  'Montserrat',
  'Raleway',
  'Poppins',
  // Serif / editorial
  'Palatino',
  'Playfair Display',
  'Lora',
  'Cormorant Garamond',
  'DM Serif Display',
  // Display / impact
  'Bebas Neue',
  'Oswald',
  'Anton',
  // Handwriting / script
  'Daniel',
  'Caveat',
  'Dancing Script',
  'Shadows Into Light',
  'Indie Flower',
  'Patrick Hand',
  'Sacramento',
];

const loaded = new Set<string>();

const SPECIAL_FONTS: Record<string, string> = {
  satoshi: 'https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700,900&display=swap',
  geist: 'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap',
  'geist mono': 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap',
  daniel: 'https://fonts.cdnfonts.com/css/daniel',
};

// System fonts that don't need loading
const SYSTEM_FONTS = new Set(['palatino', 'georgia', 'times new roman', 'arial', 'helvetica']);

/**
 * Ensure a font is loaded in the browser. Idempotent - only adds the link tag once.
 */
export function ensureFontLoaded(fontFamily: string): void {
  const key = fontFamily.toLowerCase();
  if (loaded.has(key) || SYSTEM_FONTS.has(key)) return;

  loaded.add(key);

  const href =
    SPECIAL_FONTS[key] ||
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@300;400;500;600;700;900&display=swap`;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
