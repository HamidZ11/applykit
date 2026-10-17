import monoData from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?inline';
import sansData from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?inline';

/**
 * Font families used by the panel. Namespaced so they cannot collide with,
 * or be mistaken for, fonts the page itself uses.
 */
export const PANEL_FONTS = {
  sans: 'ApplyKit Instrument Sans',
  mono: 'ApplyKit IBM Plex Mono',
} as const;

let loading: Promise<void> | undefined;

/**
 * Registers the panel fonts with the page's document.
 *
 * `@font-face` rules inside a shadow root are ignored, and loading font files
 * from the extension would require web-accessible resources (see ADR 0002).
 * The fonts are bundled as data and registered from memory with the FontFace
 * API instead, which also keeps them independent of the page's CSP.
 * Failure is harmless: the panel's font stacks fall back to system fonts.
 */
export function loadPanelFonts(): Promise<void> {
  loading ??= Promise.all([
    register(PANEL_FONTS.sans, sansData, { weight: '400 700' }),
    register(PANEL_FONTS.mono, monoData, { weight: '400' }),
  ])
    .then(() => undefined)
    .catch((error: unknown) => {
      console.warn('ApplyKit could not load its fonts.', error);
    });
  return loading;
}

async function register(
  family: string,
  dataUrl: string,
  descriptors: FontFaceDescriptors,
): Promise<void> {
  const face = new FontFace(family, decode(dataUrl), {
    display: 'block',
    ...descriptors,
  });
  await face.load();
  document.fonts.add(face);
}

function decode(dataUrl: string): ArrayBuffer {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
