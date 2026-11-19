import fs from 'fs';
import path from 'path';
import { generatePost } from './llmClient.js';
import { pickDesign, HistoryItem, DesignSelection } from '../design/uniqueness.js';
import { GeneratedPost } from './schema.js';

export interface ScheduleSlot {
  id: number;
  timePkt: string;
  cronUtc: string;
  suggestedPillar: string;
  format: 'single' | 'carousel';
  label: string;
}

export function loadScheduleConfig(): {
  timezone: string;
  utcOffsetHours: number;
  postsPerDay: number;
  requireApproval: boolean;
  slots: ScheduleSlot[];
} {
  const p = path.resolve(process.cwd(), 'config/schedule.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function loadPillarsConfig(): {
  pillars: Array<{
    id: string;
    name: string;
    weight: number;
    description: string;
    allowedTemplates: string[];
    requiresRealOffer: boolean;
  }>;
} {
  const p = path.resolve(process.cwd(), 'content/pillars.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function loadHashtagsConfig(): {
  brand: string[];
  common: string[];
  poolsByPillar: Record<string, string[]>;
} {
  const p = path.resolve(process.cwd(), 'content/hashtags.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Returns slots for today (dropping slot 2 if postsPerDay is 4).
 */
export function getActiveSlotsForDay(postsPerDay = 5): ScheduleSlot[] {
  const schedule = loadScheduleConfig();
  if (postsPerDay === 4) {
    return schedule.slots.filter(s => s.id !== 2);
  }
  return schedule.slots.slice(0, postsPerDay);
}

/**
 * Rotates hashtags so consecutive posts differ by >= 40%
 */
export function pickHashtagsForPost(pillar: string, prevTags: string[] = []): string[] {
  const config = loadHashtagsConfig();
  const pool = config.poolsByPillar[pillar] || config.common;
  const brand = config.brand;

  const prevSet = new Set(prevTags.map(t => t.toLowerCase()));
  const available = pool.filter(t => !prevSet.has(t.toLowerCase()));

  // Shuffle available
  const shuffled = [...available].sort(() => 0.5 - Math.random());
  const selectedNiche = shuffled.slice(0, 6);

  // Pick common tags
  const commonShuffled = [...config.common].filter(t => !prevSet.has(t.toLowerCase())).sort(() => 0.5 - Math.random());
  const selectedCommon = commonShuffled.slice(0, 3);

  const tags = Array.from(new Set([brand[0], ...selectedNiche, ...selectedCommon]));
  return tags.slice(0, 12);
}

export interface PreparedPost {
  id: string; // e.g. 2026-11-18-slot1
  date: string;
  slot: number;
  scheduledAt: string; // ISO 8601 with +05:00
  status: 'queued' | 'publishing' | 'posted' | 'failed' | 'skipped' | 'rejected';
  approved: boolean;
  pillar: string;
  format: 'single' | 'carousel';
  template: string;
  design: {
    palette: string;
    seed: number;
    decoration: string;
    layoutVariant: number;
  };
  slides: any[];
  caption: string;
  hashtags: string[];
  altText: string;
  images: string[];
  imageUrls: string[];
  igMediaId: string | null;
  postedAt?: string | null;
  storyPostedAt?: string | null;
  storyMediaIds?: string[];
  rejectedAt?: string | null;
  attempts: number;
  error: string | null;
}

/**
 * Main coordinator that generates all posts for a given date.
 */
export async function generateDailyPosts(params: {
  date: string; // YYYY-MM-DD
  history: HistoryItem[];
  postsPerDay?: number;
  existingQueue?: PreparedPost[];
  allowNewBatch?: boolean;
}): Promise<PreparedPost[]> {
  const { date, history, postsPerDay = 5, existingQueue = [], allowNewBatch = false } = params;
  const schedule = loadScheduleConfig();
  const pillarsConfig = loadPillarsConfig();
  const slots = getActiveSlotsForDay(postsPerDay);

  const preparedPosts: PreparedPost[] = [];
  const todayDesigns: DesignSelection[] = [];
  const usedBankIds = new Set<string>();
  let lastHashtags: string[] = [];

  const existingIds = new Set(existingQueue.map(p => p.id));
  const queueHeadlines = existingQueue.map(p => p.slides?.[0]?.headline || '').filter(Boolean);
  const recentHeadlines = [...history.slice(-30).map(h => h.headline), ...queueHeadlines];

  // Determine batch number if generating additional posts for a date that already exists
  let batchNum = 1;
  if (allowNewBatch) {
    while (slots.some(s => existingIds.has(batchNum === 1 ? `${date}-slot${s.id}` : `${date}-slot${s.id}-b${batchNum}`))) {
      batchNum++;
    }
  }

  console.log(`Generating ${slots.length} daily posts for ${date} (Batch #${batchNum}, Asia/Karachi)...`);

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const pillarDef = pillarsConfig.pillars.find(p => p.id === slot.suggestedPillar) || pillarsConfig.pillars[0];

    const designDateKey = batchNum === 1 ? date : `${date}-b${batchNum}`;

    // Pick unique design per anti-repeat rules
    const design = pickDesign({
      date: designDateKey,
      slot: slot.id,
      totalSlotsToday: slots.length,
      pillar: pillarDef.id,
      format: slot.format,
      allowedTemplates: pillarDef.allowedTemplates,
      history,
      todayDesigns
    });
    todayDesigns.push(design);

    // Generate content via fallback chain
    const content = await generatePost({
      date,
      slot: slot.id,
      pillar: pillarDef.id,
      format: slot.format,
      template: design.template,
      recentHeadlines,
      angleIndex: i,
      usedBankIds
    });

    if (content.offerId) {
      usedBankIds.add(content.offerId);
    }
    if ((content as any).id) {
      usedBankIds.add((content as any).id);
    }

    // Refresh hashtags for >= 40% rotation
    const hashtags = pickHashtagsForPost(pillarDef.id, lastHashtags);
    lastHashtags = hashtags;

    // ISO-8601 with Asia/Karachi +05:00 offset
    const scheduledAt = `${date}T${slot.timePkt}:00+05:00`;
    const postId = batchNum === 1 ? `${date}-slot${slot.id}` : `${date}-slot${slot.id}-b${batchNum}`;

    // Use bank post's native template if present so slide fields match template HTML
    const effectiveTemplate = (content as any).template || design.template;

    // Images will be populated during rendering phase
    const images: string[] = [];
    const imageUrls: string[] = [];

    const post: PreparedPost = {
      id: postId,
      date,
      slot: slot.id,
      scheduledAt,
      status: 'queued',
      approved: !schedule.requireApproval,
      pillar: pillarDef.id,
      format: slot.format,
      template: effectiveTemplate,
      design: {
        palette: design.palette,
        seed: design.seed,
        decoration: design.decoration,
        layoutVariant: design.layoutVariant
      },
      slides: content.slides,
      caption: content.caption,
      hashtags,
      altText: content.altText,
      images,
      imageUrls,
      igMediaId: null,
      attempts: 0,
      error: null
    };

    preparedPosts.push(post);
    recentHeadlines.push(content.slides[0]?.headline || '');
  }

  return preparedPosts;
}
