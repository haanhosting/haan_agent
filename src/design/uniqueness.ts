import fs from 'fs';
import path from 'path';
import { loadPalettes, Palette } from '../render/palette.js';

export interface HistoryItem {
  date: string; // YYYY-MM-DD
  slot: number;
  template: string;
  palette: string;
  decoration: string;
  layoutVariant: number;
  headline: string;
  pillar: string;
  captionHash?: string;
}

export interface DesignSelection {
  template: string;
  palette: string;
  decoration: string;
  layoutVariant: number;
  seed: number;
  reason: string;
}

export const ALL_DECORATIONS = [
  'mesh-gradient',
  'dots-grid',
  'circuit-lines',
  'glow-orb',
  'isometric-cube',
  'corner-brackets',
  'diagonal-stripes',
  'wave-curves',
  'none'
];

/**
 * Deterministic 32-bit hash function (cyrb53 / FNV style)
 */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Seeded PRNG (Mulberry32)
 */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tokenizes text and removes common punctuation & stop words.
 */
export function tokenize(text: string): Set<string> {
  const stopWords = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'your', 'with', 'you', 'how'
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));
  return new Set(words);
}

/**
 * Computes Jaccard similarity between two strings: |A ∩ B| / |A ∪ B|
 */
export function jaccardSimilarity(text1: string, text2: string): number {
  const setA = tokenize(text1);
  const setB = tokenize(text2);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Checks if a headline is too similar to any headline in history (> 0.6 similarity).
 */
export function isHeadlineSimilarToHistory(
  headline: string,
  history: HistoryItem[],
  daysThreshold = 30
): { similar: boolean; matchedHeadline?: string; score?: number } {
  for (const item of history) {
    const score = jaccardSimilarity(headline, item.headline);
    if (score > 0.6) {
      return { similar: true, matchedHeadline: item.headline, score };
    }
  }
  return { similar: false };
}

/**
 * Helper to compute days difference between two YYYY-MM-DD strings.
 */
export function getDaysDiff(date1: string, date2: string): number {
  const d1 = new Date(date1).getTime();
  const d2 = new Date(date2).getTime();
  return Math.abs(Math.round((d1 - d2) / (1000 * 60 * 60 * 24)));
}

/**
 * Picks an optimal, unique design for a post respecting all TEMPLATES.md §4 rules:
 * 1. No same template twice in one day, no template reused within 3 days.
 * 2. No palette reuse within the same day, no palette reused within 4 days.
 * 3. Decoration differs from previous 5 posts.
 * 4. Layout variant 0-2.
 * 5. Seeded randomness based on date + slot.
 * 6. Brand color accent in >= 2 of 5 daily posts.
 */
export function pickDesign(params: {
  date: string;
  slot: number;
  totalSlotsToday?: number;
  pillar: string;
  format: 'single' | 'carousel';
  allowedTemplates: string[];
  history: HistoryItem[];
  todayDesigns: DesignSelection[];
}): DesignSelection {
  const {
    date,
    slot,
    totalSlotsToday = 5,
    format,
    allowedTemplates,
    history,
    todayDesigns
  } = params;

  const seed = hashString(`${date}-slot${slot}`);
  const rand = mulberry32(seed);

  // 1. Template Selection
  const templatesUsedToday = new Set(todayDesigns.map(d => d.template));
  const templatesUsedLast3Days = new Set<string>();

  for (const item of history) {
    if (getDaysDiff(date, item.date) <= 3) {
      templatesUsedLast3Days.add(item.template);
    }
  }

  // Filter candidates: must match format (e.g. carousel requires T11-carousel)
  let candidates = allowedTemplates.filter(t => {
    if (format === 'carousel') return t === 'T11-carousel';
    return t !== 'T11-carousel';
  });

  // Strict check: not used today and not in last 3 days
  let validTemplates = candidates.filter(
    t => !templatesUsedToday.has(t) && !templatesUsedLast3Days.has(t)
  );

  // Fallback 1: Not used today
  if (validTemplates.length === 0) {
    validTemplates = candidates.filter(t => !templatesUsedToday.has(t));
  }

  // Fallback 2: Any candidate
  if (validTemplates.length === 0) {
    validTemplates = candidates;
  }

  const chosenTemplate = validTemplates[Math.floor(rand() * validTemplates.length)] || candidates[0] || 'T01-bold-statement';

  // 2. Palette Selection
  const allPalettes = loadPalettes();
  const palettesUsedToday = new Set(todayDesigns.map(d => d.palette));
  const palettesUsedLast4Days = new Set<string>();

  for (const item of history) {
    if (getDaysDiff(date, item.date) <= 4) {
      palettesUsedLast4Days.add(item.palette);
    }
  }

  // Brand accent rule: at least 2 of 5 posts must have isBrandAccent: true
  const brandAccentsUsedToday = todayDesigns.filter(d => {
    const pal = allPalettes.find(p => p.id === d.palette);
    return pal?.isBrandAccent;
  }).length;

  const remainingSlotsToday = totalSlotsToday - todayDesigns.length;
  const brandAccentsNeeded = 2 - brandAccentsUsedToday;
  const forceBrandAccent = brandAccentsNeeded >= remainingSlotsToday && brandAccentsNeeded > 0;

  let paletteCandidates = allPalettes.filter(p => {
    if (forceBrandAccent && !p.isBrandAccent) return false;
    return true;
  });

  let validPalettes = paletteCandidates.filter(
    p => !palettesUsedToday.has(p.id) && !palettesUsedLast4Days.has(p.id)
  );

  if (validPalettes.length === 0) {
    validPalettes = paletteCandidates.filter(p => !palettesUsedToday.has(p.id));
  }
  if (validPalettes.length === 0) {
    validPalettes = paletteCandidates;
  }

  const chosenPalette = validPalettes[Math.floor(rand() * validPalettes.length)] || allPalettes[0];

  // 3. Decoration Selection (differ from previous 5 posts)
  const recentDecorations: string[] = [];
  // Today's recent first
  for (let i = todayDesigns.length - 1; i >= 0 && recentDecorations.length < 5; i--) {
    recentDecorations.push(todayDesigns[i].decoration);
  }
  // Then history
  for (let i = history.length - 1; i >= 0 && recentDecorations.length < 5; i--) {
    recentDecorations.push(history[i].decoration);
  }

  const recentDecoSet = new Set(recentDecorations);
  let decoCandidates = ALL_DECORATIONS.filter(d => !recentDecoSet.has(d));
  if (decoCandidates.length === 0) decoCandidates = ALL_DECORATIONS;

  const chosenDecoration = decoCandidates[Math.floor(rand() * decoCandidates.length)] || 'none';

  // 4. Layout Variant (0 to 2)
  const layoutVariant = Math.floor(rand() * 3);

  const reason = `Selected ${chosenTemplate} (${chosenPalette.id}, deco: ${chosenDecoration}, var: ${layoutVariant}) with seed ${seed}. (BrandAccentsToday: ${brandAccentsUsedToday + (chosenPalette.isBrandAccent ? 1 : 0)}/2)`;

  return {
    template: chosenTemplate,
    palette: chosenPalette.id,
    decoration: chosenDecoration,
    layoutVariant,
    seed,
    reason
  };
}
