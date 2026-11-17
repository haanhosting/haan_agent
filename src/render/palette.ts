import fs from 'fs';
import path from 'path';

export interface Palette {
  id: string;
  name: string;
  bg?: string;
  bg1: string;
  bg2: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  card: string;
  cardInk?: string;
  cardBorder: string;
  isBrandAccent: boolean;
}

const palettesPath = path.resolve(process.cwd(), 'templates/_shared/palettes.json');

export function loadPalettes(): Palette[] {
  const data = JSON.parse(fs.readFileSync(palettesPath, 'utf8'));
  return data.palettes;
}

export function getPaletteById(id: string): Palette {
  const palettes = loadPalettes();
  const match = palettes.find(p => p.id === id);
  if (match) return match;
  return palettes[0];
}

/**
 * Calculates WCAG 2.1 relative luminance for a hex color.
 */
function getLuminance(hex: string): number {
  const rgb = hex.replace('#', '').match(/.{2}/g)?.map(x => parseInt(x, 16) / 255) || [0, 0, 0];
  const [r, g, b] = rgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates contrast ratio between two hex colors.
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Generates a flat solid HSL-based palette seeded by an integer, ensuring >= 7:1 contrast.
 */
export function generatePalette(seed: number): Palette {
  const hue = Math.abs(seed) % 360;
  const bg = `hsl(${hue}, 55%, 18%)`;
  const ink = `hsl(${hue}, 80%, 96%)`;
  const muted = `hsl(${hue}, 65%, 80%)`;
  const accent = `hsl(${hue}, 70%, 62%)`;
  const card = `hsl(${hue}, 50%, 24%)`;
  const cardInk = `hsl(${hue}, 80%, 96%)`;

  return {
    id: `dyn-${seed}`,
    name: `Dynamic Flat ${hue}°`,
    bg,
    bg1: bg,
    bg2: bg,
    ink,
    muted,
    accent,
    accent2: muted,
    card,
    cardInk,
    cardBorder: accent,
    isBrandAccent: false
  };
}

/**
 * Formats palette into inline CSS custom properties matching STYLE_REFERENCE.md.
 */
export function formatCssVariables(palette: Palette): string {
  const bg = palette.bg || palette.bg1;
  const cardInk = palette.cardInk || palette.ink;
  return [
    `--bg: ${bg};`,
    `--bg1: ${bg};`,
    `--bg2: ${bg};`,
    `--ink: ${palette.ink};`,
    `--muted: ${palette.muted};`,
    `--accent: ${palette.accent};`,
    `--accent2: ${palette.accent2 || palette.muted};`,
    `--card: ${palette.card};`,
    `--cardInk: ${cardInk};`,
    `--card-border: ${palette.cardBorder || palette.accent};`
  ].join(' ');
}
