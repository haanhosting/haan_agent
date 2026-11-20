/**
 * AI Studio — OpenAI-powered post generation (separate from the nightly pipeline).
 *
 * - Text: OpenAI chat model, "trained" few-shot on our own content bank posts.
 * - Image: OpenAI image model generates a text-free background, used as the
 *   low-opacity photo layer behind the HAAN neon template.
 * - Everything degrades gracefully: no key / no credits / any error →
 *   text falls back to the existing LLM chain, image falls back to built-in backgrounds.
 */
import fs from 'fs';
import path from 'path';
import { GeneratedPostSchema } from './schema.js';
import { validatePost, loadBrandConfig } from './validator.js';
import { buildSystemPrompt } from './prompt.js';
import { loadContentBank } from './bank.js';
import { generatePost, loadProvidersConfig, extractJsonString } from './llmClient.js';
import { loadPillarsConfig, loadScheduleConfig, pickHashtagsForPost, PreparedPost } from './slotMapper.js';
import { pickDesign, HistoryItem } from '../design/uniqueness.js';

export interface AiConfig {
  enabled: boolean;
  postsPerDay: number;
  times: string[]; // PKT HH:MM, one per AI post
  textModel: string;
  imageModels: string[]; // tried in order
  imageQuality: 'low' | 'medium' | 'high';
  generateImages: boolean;
  templates: string[];
}

const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: true,
  postsPerDay: 1,
  times: ['11:00', '18:00'],
  textModel: 'gpt-4o-mini',
  imageModels: ['gpt-image-1-mini', 'gpt-image-1', 'dall-e-3'],
  imageQuality: 'low',
  generateImages: true,
  templates: [
    'T13-cyber-hero-bg', 'T14-datacenter-spotlight', 'T15-vs-comparison', 'T16-bento-grid',
    'T17-forex-telemetry', 'T18-vip-promo-poster', 'T19-photo-diagonal-hero', 'T20-stat-dashboard',
    'T21-steps-timeline', 'T22-guarantee-seal', 'T23-pricing-tier', 'T24-global-locations'
  ]
};

/** Slot numbers for AI posts start here so they never collide with schedule slots 1-5. */
export const AI_SLOT_BASE = 100;

export function loadAiConfig(): AiConfig {
  const providers: any = loadProvidersConfig();
  return { ...DEFAULT_AI_CONFIG, ...(providers.ai || {}) };
}

export function isAiPost(post: PreparedPost): boolean {
  return post.source === 'ai';
}

class QuotaError extends Error {}

function getKey(): string | null {
  const k = process.env.OPENAI_API_KEY;
  return k && k.trim() ? k.trim() : null;
}

async function openaiFetch(endpoint: string, body: any): Promise<any> {
  const key = getKey();
  if (!key) throw new QuotaError('OPENAI_API_KEY is not set');
  const res = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const code = json?.error?.code || json?.error?.type || '';
    const msg = json?.error?.message || text.slice(0, 300);
    if (res.status === 429 && /quota|billing/i.test(`${code} ${msg}`)) {
      throw new QuotaError(`OpenAI quota/billing: ${msg}`);
    }
    if (res.status === 401) throw new QuotaError(`OpenAI key rejected: ${msg}`);
    const err: any = new Error(`OpenAI HTTP ${res.status} (${code}): ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ---------------------------------------------------------------------------
// Guardrails beyond validatePost
// ---------------------------------------------------------------------------

/** Every "$xx.xx" price that legitimately appears in brand.json. */
function getVerifiedPrices(brand: any): Set<string> {
  const src = JSON.stringify({ products: brand.products, offers: brand.offers });
  return new Set((src.match(/\$\d+(?:\.\d{1,2})?/g) || []));
}

function extraChecks(post: any, brand: any): string[] {
  const errors: string[] = [];
  const allText = `${JSON.stringify(post.slides)} ${post.caption}`;
  const lower = allText.toLowerCase();

  for (const phrase of (brand.voice?.bannedPhrases || []) as string[]) {
    if (lower.includes(phrase.toLowerCase())) errors.push(`Contains banned phrase "${phrase}"`);
  }

  const verified = getVerifiedPrices(brand);
  for (const price of allText.match(/\$\d+(?:\.\d{1,2})?/g) || []) {
    if (!verified.has(price)) errors.push(`Price ${price} is not a real Haan Hosting price`);
  }

  if (/testimonial|\bsaid\b.*["“]|review from/i.test(allText) && post.slides.some((s: any) => s.author)) {
    errors.push('Do not invent testimonials or named customers');
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Text generation
// ---------------------------------------------------------------------------

function pickExamples(template: string, pillar: string): any[] {
  const bank = loadContentBank().filter(p => p.format === 'single');
  const sameTemplate = bank.filter(p => p.template === template);
  const samePillar = bank.filter(p => p.pillar === pillar && p.template !== template);
  const shuffled = [...samePillar].sort(() => Math.random() - 0.5);
  return [...sameTemplate.slice(0, 2), ...shuffled.slice(0, 2)];
}

function buildAiUserPrompt(params: {
  date: string;
  pillar: string;
  template: string;
  examples: any[];
  recentHeadlines: string[];
  feedback?: string[];
}): string {
  const { date, pillar, template, examples, recentHeadlines, feedback } = params;
  const exampleText = examples
    .map(e => JSON.stringify({
      template: e.template,
      pillar: e.pillar,
      slides: e.slides,
      caption: e.caption,
      hashtags: e.hashtags,
      altText: e.altText
    }, null, 1))
    .join('\n\n');
  const shape = examples.find(e => e.template === template)?.slides?.[0];

  return [
    `You are the in-house social media writer for Haan Hosting. Below are REAL approved posts from our feed.`,
    `Learn their voice, structure, caption style, emoji use and hashtag style, then write ONE brand-new post.`,
    ``,
    `=== APPROVED EXAMPLE POSTS ===`,
    exampleText,
    `=== END EXAMPLES ===`,
    ``,
    `Write a NEW post for date ${date}.`,
    `- Pillar: ${pillar}`,
    `- Template: ${template} (single image)`,
    shape
      ? `- The slide object MUST use exactly these keys (same types): ${Object.keys(shape).join(', ')}`
      : `- Slide object needs at least headline, body, badge, category, cta.`,
    `- headline 5-80 chars, punchy; body under 220 chars.`,
    `- Pick a fresh angle. Do NOT reuse or closely paraphrase any of these recent headlines:`,
    ...recentHeadlines.slice(-25).map(h => `  • ${h}`),
    `- Only use prices/plans that appear in the verified offers. Never invent numbers, customers, reviews or testimonials.`,
    `- caption 150-900 chars with a clear CTA to haanhosting.store; 6-12 hashtags including #HaanHosting.`,
    feedback?.length ? `\nYour previous attempt was rejected for: ${feedback.join('; ')}. Fix these.` : '',
    ``,
    `Reply with ONLY JSON: {"slides":[{...}],"caption":"...","hashtags":["#..."],"altText":"...","offerId":"<offer id if pillar is offers>"}`
  ].join('\n');
}

async function generateAiText(params: {
  date: string;
  pillar: string;
  template: string;
  recentHeadlines: string[];
  config: AiConfig;
}): Promise<{ post: any; via: string }> {
  const brand = loadBrandConfig();
  const systemPrompt = buildSystemPrompt(brand);
  const examples = pickExamples(params.template, params.pillar);
  let feedback: string[] | undefined;

  if (getKey()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const userPrompt = buildAiUserPrompt({ ...params, examples, feedback });
        const json = await openaiFetch('chat/completions', {
          model: params.config.textModel,
          temperature: 0.85,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        });
        const raw = json?.choices?.[0]?.message?.content || '';
        const obj = JSON.parse(extractJsonString(raw));
        obj.format = 'single';
        obj.pillar = params.pillar;
        obj.template = params.template;
        if (Array.isArray(obj.slides)) obj.slides = obj.slides.slice(0, 1);

        const parsed = GeneratedPostSchema.safeParse(obj);
        if (!parsed.success) {
          feedback = parsed.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`);
          console.warn(`[AI Studio] Schema check failed (attempt ${attempt}): ${feedback.join('; ')}`);
          continue;
        }
        const v = validatePost(parsed.data);
        const extra = extraChecks(obj, brand);
        const errors = [...v.errors, ...extra];
        if (errors.length) {
          feedback = errors;
          console.warn(`[AI Studio] Validation failed (attempt ${attempt}): ${errors.join('; ')}`);
          continue;
        }
        // Keep the raw slides: zod strips template-specific keys (subline, highlight, ...).
        return { post: { ...parsed.data, slides: obj.slides }, via: `openai:${params.config.textModel}` };
      } catch (err: any) {
        console.warn(`[AI Studio] OpenAI text failed: ${err.message}`);
        if (err instanceof QuotaError) break;
      }
    }
  } else {
    console.warn('[AI Studio] OPENAI_API_KEY not set — using existing LLM chain for text.');
  }

  // Fallback: existing gemini → groq → openrouter → bank chain
  const post = await generatePost({
    date: params.date,
    slot: AI_SLOT_BASE,
    pillar: params.pillar,
    format: 'single',
    template: params.template,
    recentHeadlines: params.recentHeadlines
  });
  return { post, via: 'fallback-chain' };
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

const IMAGE_SCENES: Record<string, string> = {
  tips: 'glowing server rack with fiber optic light trails',
  educational: 'isometric cloud infrastructure with connected nodes',
  growth: 'upward neon data streams over a futuristic city skyline at night',
  offers: 'premium dark datacenter corridor with purple and cyan lighting',
  engagement: 'abstract holographic interface panels floating in dark space',
  trust: 'glowing digital shield over a secure network grid',
  quotes: 'calm abstract gradient of violet light waves and particles'
};

function buildImagePrompt(pillar: string, headline: string): string {
  const scene = IMAGE_SCENES[pillar] || IMAGE_SCENES.tips;
  return [
    `Cinematic, high-detail background photo for a web hosting brand Instagram post about "${headline}".`,
    `Scene: ${scene}.`,
    `Style: dark moody tech aesthetic, deep navy/black base with neon violet (#7C3AED) and cyan accents, soft bokeh, depth of field.`,
    `Composition: plenty of empty dark space, no focal subject in the center.`,
    `Absolutely NO text, letters, numbers, logos, watermarks or UI labels anywhere in the image.`
  ].join(' ');
}

/**
 * Generates a background image and saves it. Returns the repo-relative path, or null.
 */
export async function generateAiBackground(params: {
  postId: string;
  date: string;
  pillar: string;
  headline: string;
  config: AiConfig;
}): Promise<string | null> {
  if (!params.config.generateImages) return null;
  if (!getKey()) {
    console.warn('[AI Studio] OPENAI_API_KEY not set — using built-in background image.');
    return null;
  }

  const prompt = buildImagePrompt(params.pillar, params.headline);
  const dir = path.resolve(process.cwd(), 'media', 'ai-bg', params.date);

  for (const model of params.config.imageModels) {
    try {
      const isDalle = model.startsWith('dall-e');
      const body: any = isDalle
        ? { model, prompt, n: 1, size: '1024x1024', quality: 'standard', response_format: 'b64_json' }
        : { model, prompt, n: 1, size: '1024x1536', quality: params.config.imageQuality, output_format: 'jpeg', output_compression: 80 };
      const json = await openaiFetch('images/generations', body);
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error('No image data returned');
      fs.mkdirSync(dir, { recursive: true });
      const ext = isDalle ? 'png' : 'jpg';
      const slug = params.postId.replace(`${params.date}-`, '');
      const rel = `media/ai-bg/${params.date}/${slug}.${ext}`;
      fs.writeFileSync(path.resolve(process.cwd(), rel), Buffer.from(b64, 'base64'));
      console.log(`[AI Studio] Background generated with ${model} -> ${rel}`);
      return rel;
    } catch (err: any) {
      console.warn(`[AI Studio] Image model ${model} failed: ${err.message}`);
      if (err instanceof QuotaError) break; // no credits — don't try other models
    }
  }
  console.warn('[AI Studio] Falling back to built-in background image.');
  return null;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function pickPillarForTemplate(template: string, index: number): string {
  const { pillars } = loadPillarsConfig();
  const matches = pillars.filter(p => p.allowedTemplates.includes(template));
  return (matches[index % Math.max(matches.length, 1)] || pillars[0]).id;
}

export async function generateAiPosts(params: {
  date: string;
  count?: number;
  history: HistoryItem[];
  existingQueue: PreparedPost[];
}): Promise<PreparedPost[]> {
  const config = loadAiConfig();
  const schedule = loadScheduleConfig();
  const count = Math.max(1, Math.min(params.count ?? config.postsPerDay, 4));

  const recentHeadlines = [
    ...params.history.map(h => h.headline || ''),
    ...params.existingQueue.map(p => p.slides?.[0]?.headline || '')
  ].filter(Boolean);

  // Unique id per run: date-ai1, date-ai2, ... continuing after existing AI posts for that date
  const existingAiIds = new Set(params.existingQueue.filter(p => p.date === params.date && isAiPost(p)).map(p => p.id));
  let nextN = 1;

  const usedTemplatesToday = new Set(
    params.existingQueue.filter(p => p.date === params.date).map(p => p.template)
  );
  const todayDesigns: any[] = [];
  const posts: PreparedPost[] = [];

  for (let i = 0; i < count; i++) {
    while (existingAiIds.has(`${params.date}-ai${nextN}`)) nextN++;
    const n = nextN++;
    const postId = `${params.date}-ai${n}`;
    const slot = AI_SLOT_BASE + n;

    const design = pickDesign({
      date: `${params.date}-ai`,
      slot,
      totalSlotsToday: count,
      pillar: 'ai',
      format: 'single',
      allowedTemplates: config.templates.filter(t => !usedTemplatesToday.has(t)).length
        ? config.templates.filter(t => !usedTemplatesToday.has(t))
        : config.templates,
      history: params.history,
      todayDesigns
    });
    todayDesigns.push(design);
    usedTemplatesToday.add(design.template);

    const pillar = pickPillarForTemplate(design.template, n + params.date.charCodeAt(9));
    console.log(`\n[AI Studio] ${postId}: template ${design.template}, pillar ${pillar}`);

    const { post: content, via } = await generateAiText({
      date: params.date,
      pillar,
      template: design.template,
      recentHeadlines,
      config
    });
    const template = content.template || design.template;
    const headline = content.slides?.[0]?.headline || '';
    recentHeadlines.push(headline);
    console.log(`[AI Studio] Text via ${via}: "${headline}"`);

    const aiBgImage = await generateAiBackground({ postId, date: params.date, pillar, headline, config });

    const time = config.times[(n - 1) % config.times.length] || '11:00';
    const hashtags = Array.isArray(content.hashtags) && content.hashtags.length >= 5
      ? content.hashtags
      : pickHashtagsForPost(pillar, []);

    posts.push({
      id: postId,
      date: params.date,
      slot,
      scheduledAt: `${params.date}T${time}:00+05:00`,
      status: 'queued',
      approved: !schedule.requireApproval,
      pillar,
      format: 'single',
      template,
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
      images: [],
      imageUrls: [],
      igMediaId: null,
      attempts: 0,
      error: null,
      source: 'ai',
      aiTextVia: via,
      aiBgImage: aiBgImage || null
    });
  }
  return posts;
}
