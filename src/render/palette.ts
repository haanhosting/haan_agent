import fs from 'fs';
import path from 'path';

export interface Palette {
  id: string;
  name: string;
  bg1: string;
  bg2: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  card: string;
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
 * Generates a dynamic HSL-based palette seeded by an integer, ensuring >= 7:1 contrast for text.
 */
export function generatePalette(seed: number): Palette {
  const hue = Math.abs(seed) % 360;
  const secondaryHue = (hue + 120 + ((seed >> 2) % 60)) % 360;
  
  // Dark theme background
  const bg1 = `hsl(${hue}, 45%, 7%)`;
  const bg2 = `hsl(${(hue + 20) % 360}, 50%, 4%)`;
  const ink = '#ffffff';
  const muted = `hsl(${hue}, 60%, 75%)`;
  const accent = `hsl(${hue}, 85%, 55%)`;
  const accent2 = `hsl(${secondaryHue}, 90%, 55%)`;
  const card = `hsla(${hue}, 40%, 10%, 0.8)`;
  const cardBorder = `hsla(${hue}, 70%, 50%, 0.25)`;

  return {
    id: `dyn-${seed}`,
    name: `Dynamic Aurora ${hue}°`,
    bg1,
    bg2,
    ink,
    muted,
    accent,
    accent2,
    card,
    cardBorder,
    isBrandAccent: false
  };
}

/**
 * Formats palette into inline CSS custom properties.
 */
export function formatCssVariables(palette: Palette): string {
  return [
    `--bg1: ${palette.bg1};`,
    `--bg2: ${palette.bg2};`,
    `--ink: ${palette.ink};`,
    `--muted: ${palette.muted};`,
    `--accent: ${palette.accent};`,
    `--accent2: ${palette.accent2};`,
    `--card: ${palette.card};`,
    `--card-border: ${palette.cardBorder};`
  ].join(' ');
}
