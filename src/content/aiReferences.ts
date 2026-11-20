/**
 * AI Studio — reference posts.
 *
 * The user gives us their best-performing posts (upload or import from Instagram).
 * We "watch" them with a vision model to build a style profile, then generate new
 * full-image posts in that style with gpt-image's images/edits endpoint, passing the
 * reference images (+ logo) so the new image matches their look.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { GeneratedPostSchema } from './schema.js';
import { validatePost, loadBrandConfig } from './validator.js';
import { buildSystemPrompt } from './prompt.js';
import { extractJsonString } from './llmClient.js';
import { QuotaError, getOpenAiKey, openaiFetch, openaiFetchForm } from './openaiApi.js';
import { extraChecks, type AiConfig } from './aiStudio.js';
import { loadPublisherConfig, resolveGraphBaseUrl } from '../publish/instagramGraph.js';

export const REF_DIR_REL = 'content/ai-references';
const REF_DIR = () => path.resolve(process.cwd(), REF_DIR_REL);
const REFS_FILE = () => path.join(REF_DIR(), 'refs.json');
const PROFILE_FILE = () => path.join(REF_DIR(), 'style-profile.json');
const MAX_REFS = 24;

export interface ReferencePost {
  id: string;
  file: string; // repo-relative path
  caption: string;
  source: 'upload' | 'instagram';
  igMediaId?: string;
  permalink?: string;
  likes?: number;
  comments?: number;
  width: number;
  height: number;
  addedAt: string;
}

export interface StyleProfile {
  visualStyle: string;
  layout: string;
  colors: string;
  typography: string;
  textOnImage: string;
  tone: string;
  captionPattern: string;
  hashtagStyle: string;
  imagePrompt: string;
  refsHash: string;
  analyzedAt: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function loadReferences(): ReferencePost[] {
  try {
    const list = JSON.parse(fs.readFileSync(REFS_FILE(), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveReferences(list: ReferencePost[]): void {
  fs.mkdirSync(REF_DIR(), { recursive: true });
  fs.writeFileSync(REFS_FILE(), JSON.stringify(list, null, 2) + '\n');
}

export function refsHash(list = loadReferences()): string {
  const key = list.map(r => `${r.id}:${r.caption.length}`).sort().join('|');
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

export async function addReferenceImage(
  buffer: Buffer,
  meta: { caption?: string; source?: 'upload' | 'instagram'; igMediaId?: string; permalink?: string; likes?: number; comments?: number }
): Promise<ReferencePost> {
  const list = loadReferences();
  if (meta.igMediaId) {
    const existing = list.find(r => r.igMediaId === meta.igMediaId);
    if (existing) return existing;
  }
  if (list.length >= MAX_REFS) throw new Error(`Max ${MAX_REFS} reference posts — delete some first.`);

  const id = `ref-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  const rel = `${REF_DIR_REL}/${id}.jpg`;
  const out = await sharp(buffer)
    .rotate()
    .resize({ width: 1080, withoutEnlargement: true })
    .flatten({ background: '#000000' })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  fs.mkdirSync(REF_DIR(), { recursive: true });
  fs.writeFileSync(path.resolve(process.cwd(), rel), out.data);

  const ref: ReferencePost = {
    id,
    file: rel,
    caption: (meta.caption || '').slice(0, 2200),
    source: meta.source || 'upload',
    igMediaId: meta.igMediaId,
    permalink: meta.permalink,
    likes: meta.likes,
    comments: meta.comments,
    width: out.info.width,
    height: out.info.height,
    addedAt: new Date().toISOString()
  };
  list.push(ref);
  saveReferences(list);
  return ref;
}

export function updateReferenceCaption(id: string, caption: string): boolean {
  const list = loadReferences();
  const ref = list.find(r => r.id === id);
  if (!ref) return false;
  ref.caption = caption.slice(0, 2200);
  saveReferences(list);
  return true;
}

export function deleteReference(id: string): boolean {
  const list = loadReferences();
  const ref = list.find(r => r.id === id);
  if (!ref) return false;
  try { fs.unlinkSync(path.resolve(process.cwd(), ref.file)); } catch { /* already gone */ }
  saveReferences(list.filter(r => r.id !== id));
  return true;
}

/** Best performers first (likes + 3×comments), then newest. */
function rankRefs(list: ReferencePost[]): ReferencePost[] {
  const score = (r: ReferencePost) => (r.likes || 0) + 3 * (r.comments || 0);
  return [...list].sort((a, b) => score(b) - score(a) || b.addedAt.localeCompare(a.addedAt));
}

function readRefImage(ref: ReferencePost): Buffer | null {
  try { return fs.readFileSync(path.resolve(process.cwd(), ref.file)); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Instagram import
// ---------------------------------------------------------------------------

export interface IgMediaItem {
  id: string;
  caption: string;
  mediaType: string;
  imageUrl: string;
  permalink: string;
  likes: number;
  comments: number;
  timestamp: string;
}

function igCreds(): { token: string; userId: string; base: string; version: string } {
  const token = process.env.IG_ACCESS_TOKEN || '';
  const userId = process.env.IG_USER_ID || '';
  if (!token || !userId) throw new Error('IG_ACCESS_TOKEN / IG_USER_ID not set');
  let cfg: any = {};
  try { cfg = loadPublisherConfig(); } catch { /* defaults */ }
  return { token, userId, base: resolveGraphBaseUrl(token, cfg.baseUrl), version: cfg.apiVersion || 'v22.0' };
}

export async function fetchInstagramMedia(limit = 50): Promise<IgMediaItem[]> {
  const { token, userId, base, version } = igCreds();
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp';
  const url = `${base}/${version}/${userId}/media?fields=${fields}&limit=${Math.min(limit, 100)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Instagram media list failed: ${json?.error?.message || res.status}`);
  const items: IgMediaItem[] = (json.data || [])
    .map((m: any) => ({
      id: m.id,
      caption: m.caption || '',
      mediaType: m.media_type,
      imageUrl: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
      permalink: m.permalink,
      likes: m.like_count ?? 0,
      comments: m.comments_count ?? 0,
      timestamp: m.timestamp
    }))
    .filter((m: IgMediaItem) => !!m.imageUrl);
  return items.sort((a, b) => (b.likes + 3 * b.comments) - (a.likes + 3 * a.comments));
}

export async function importInstagramMedia(ids: string[]): Promise<{ added: ReferencePost[]; errors: string[] }> {
  const all = await fetchInstagramMedia(100);
  const added: ReferencePost[] = [];
  const errors: string[] = [];
  for (const id of ids) {
    const item = all.find(m => m.id === id);
    if (!item) { errors.push(`${id}: not found in recent media`); continue; }
    try {
      const res = await fetch(item.imageUrl);
      if (!res.ok) throw new Error(`download HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      added.push(await addReferenceImage(buf, {
        caption: item.caption,
        source: 'instagram',
        igMediaId: item.id,
        permalink: item.permalink,
        likes: item.likes,
        comments: item.comments
      }));
    } catch (err: any) {
      errors.push(`${id}: ${err.message}`);
    }
  }
  return { added, errors };
}

// ---------------------------------------------------------------------------
// Vision analysis → style profile
// ---------------------------------------------------------------------------

export function loadStyleProfile(): StyleProfile | null {
  try { return JSON.parse(fs.readFileSync(PROFILE_FILE(), 'utf8')); } catch { return null; }
}

function dataUrl(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

export async function analyzeReferences(model = 'gpt-4o-mini'): Promise<StyleProfile> {
  const refs = rankRefs(loadReferences()).slice(0, 8);
  if (!refs.length) throw new Error('No reference posts yet — add some first.');
  const images = refs
    .map(r => ({ r, buf: readRefImage(r) }))
    .filter(x => x.buf) as { r: ReferencePost; buf: Buffer }[];

  // Downscale for the vision call to keep tokens low
  const content: any[] = [{
    type: 'text',
    text: [
      `These are ${images.length} of our best-performing Instagram posts (ranked best first).`,
      `Study them carefully and describe the shared design system so a designer could make NEW posts that look like they belong in the same feed.`,
      `Captions:`,
      ...images.map((x, i) => `#${i + 1} (${x.r.likes ?? '?'} likes): ${x.r.caption.slice(0, 600) || '(no caption)'}`),
      ``,
      `Reply ONLY with JSON having these string keys:`,
      `visualStyle (overall look, imagery, mood, photographic vs illustrated vs 3D),`,
      `layout (where headline/body/CTA/logo sit, grid, margins, recurring elements),`,
      `colors (dominant palette with hex guesses),`,
      `typography (font feel, weights, sizes, case, effects),`,
      `textOnImage (how much text, what kind: headline, price, bullets, CTA),`,
      `tone (writing voice of on-image text and captions),`,
      `captionPattern (structure of captions: hook, body, emojis, CTA, length),`,
      `hashtagStyle (count and kind of hashtags),`,
      `imagePrompt (a single detailed paragraph prompt that would make an image model reproduce this style for a new post — describe style only, not any specific post's wording).`
    ].join('\n')
  }];
  for (const x of images) {
    const small = await sharp(x.buf).resize({ width: 512, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
    content.push({ type: 'image_url', image_url: { url: dataUrl(small), detail: 'low' } });
  }

  const json = await openaiFetch('chat/completions', {
    model,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content }]
  });
  const obj = JSON.parse(extractJsonString(json?.choices?.[0]?.message?.content || '{}'));
  const str = (v: any) => (typeof v === 'string' ? v : v ? JSON.stringify(v) : '');
  const profile: StyleProfile = {
    visualStyle: str(obj.visualStyle),
    layout: str(obj.layout),
    colors: str(obj.colors),
    typography: str(obj.typography),
    textOnImage: str(obj.textOnImage),
    tone: str(obj.tone),
    captionPattern: str(obj.captionPattern),
    hashtagStyle: str(obj.hashtagStyle),
    imagePrompt: str(obj.imagePrompt),
    refsHash: refsHash(),
    analyzedAt: new Date().toISOString(),
    model
  };
  fs.mkdirSync(REF_DIR(), { recursive: true });
  fs.writeFileSync(PROFILE_FILE(), JSON.stringify(profile, null, 2) + '\n');
  return profile;
}

/** Returns a profile matching the current reference set, re-analyzing if refs changed. */
export async function ensureStyleProfile(model?: string): Promise<StyleProfile | null> {
  const existing = loadStyleProfile();
  if (existing && existing.refsHash === refsHash()) return existing;
  try {
    return await analyzeReferences(model);
  } catch (err: any) {
    console.warn(`[AI Studio] Style analysis failed: ${err.message}`);
    if (err instanceof QuotaError) throw err;
    return existing; // stale profile is better than none
  }
}

// ---------------------------------------------------------------------------
// Reference-style generation
// ---------------------------------------------------------------------------

function isMostlySquare(refs: ReferencePost[]): boolean {
  if (!refs.length) return false;
  const square = refs.filter(r => Math.abs(r.width / r.height - 1) < 0.08).length;
  return square >= refs.length / 2;
}

async function generateRefText(params: {
  date: string;
  pillar: string;
  profile: StyleProfile;
  refs: ReferencePost[];
  recentHeadlines: string[];
  config: AiConfig;
}): Promise<any | null> {
  const brand = loadBrandConfig();
  const systemPrompt = buildSystemPrompt(brand);
  const examples = rankRefs(params.refs).filter(r => r.caption.trim()).slice(0, 5);
  let feedback: string[] | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const userPrompt = [
      `You write Instagram posts for Haan Hosting. Our best-performing posts follow this style profile:`,
      `- On-image text: ${params.profile.textOnImage}`,
      `- Tone: ${params.profile.tone}`,
      `- Caption pattern: ${params.profile.captionPattern}`,
      `- Hashtag style: ${params.profile.hashtagStyle}`,
      examples.length ? `\nCaptions of our top posts (learn the voice — do NOT copy them):` : '',
      ...examples.map((r, i) => `--- Example ${i + 1}${r.likes != null ? ` (${r.likes} likes)` : ''} ---\n${r.caption.slice(0, 1200)}`),
      ``,
      `Write ONE brand-new post for ${params.date}, content pillar "${params.pillar}".`,
      `- slides: exactly one object {"headline": 5-60 chars, "body": short supporting line under 140 chars (can be empty-ish but at least a few words), "badge": optional short label under 25 chars, "cta": short call to action e.g. "haanhosting.store"}.`,
      `  This text will be rendered ON the image, so keep it short and punchy like the reference posts.`,
      `- Fresh angle. Do NOT reuse or paraphrase these recent headlines:`,
      ...params.recentHeadlines.slice(-25).map(h => `  • ${h}`),
      `- Only use prices/plans from the verified offers in the system prompt. Never invent numbers, customers, reviews or testimonials.`,
      `- caption 150-900 chars following the caption pattern, with CTA to haanhosting.store; 6-12 hashtags including #HaanHosting.`,
      `- altText: describe the image for screen readers.`,
      feedback?.length ? `\nYour previous attempt was rejected for: ${feedback.join('; ')}. Fix these.` : '',
      ``,
      `Reply with ONLY JSON: {"slides":[{"headline":"...","body":"...","badge":"...","cta":"..."}],"caption":"...","hashtags":["#..."],"altText":"...","offerId":"<offer id if pillar is offers>"}`
    ].join('\n');

    try {
      const json = await openaiFetch('chat/completions', {
        model: params.config.textModel,
        temperature: 0.85,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
      const obj = JSON.parse(extractJsonString(json?.choices?.[0]?.message?.content || ''));
      obj.format = 'single';
      obj.pillar = params.pillar;
      obj.template = 'AI-reference';
      if (Array.isArray(obj.slides)) obj.slides = obj.slides.slice(0, 1);

      const parsed = GeneratedPostSchema.safeParse(obj);
      if (!parsed.success) {
        feedback = parsed.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`);
        console.warn(`[AI Studio] Ref text schema failed (attempt ${attempt}): ${feedback.join('; ')}`);
        continue;
      }
      const errors = [...validatePost(parsed.data).errors, ...extraChecks(obj, brand)];
      if (errors.length) {
        feedback = errors;
        console.warn(`[AI Studio] Ref text validation failed (attempt ${attempt}): ${errors.join('; ')}`);
        continue;
      }
      return { ...parsed.data, slides: obj.slides };
    } catch (err: any) {
      console.warn(`[AI Studio] Ref text failed: ${err.message}`);
      if (err instanceof QuotaError) throw err;
    }
  }
  return null;
}

function buildRefImagePrompt(slide: any, profile: StyleProfile, portrait: boolean): string {
  const lines = [
    `Create a brand-new Instagram post graphic for "Haan Hosting" (web hosting company, website haanhosting.store).`,
    `The attached images are our previous best-performing posts: match their visual style, layout, colors, typography and overall feel exactly, so this new post looks like part of the same feed.`,
    `The last attached image is our logo — place it the same way the reference posts place branding.`,
    ``,
    `Style guide: ${profile.imagePrompt}`,
    `Layout: ${profile.layout}`,
    `Colors: ${profile.colors}`,
    `Typography: ${profile.typography}`,
    ``,
    `Render EXACTLY this text on the image, spelled correctly, and no other words:`,
    slide.badge ? `- Badge/label: "${slide.badge}"` : '',
    `- Headline: "${slide.headline}"`,
    slide.body ? `- Supporting text: "${slide.body}"` : '',
    `- Call to action: "${slide.cta || 'haanhosting.store'}"`,
    ``,
    `Do NOT copy any wording, prices or numbers from the reference images. Do not add fake prices, ratings or reviews.`,
    portrait
      ? `Keep all text and the logo inside the central area — the top and bottom 9% of the canvas will be cropped.`
      : `Keep comfortable margins around all text.`
  ];
  return lines.filter(l => l !== '').join('\n');
}

/**
 * Generates a full post image in the style of the reference posts.
 * Writes media/<date>/<slug>.jpg (1080 wide) and returns the repo-relative path.
 */
async function generateRefImage(params: {
  postId: string;
  date: string;
  slide: any;
  profile: StyleProfile;
  refs: ReferencePost[];
  rotation: number;
  config: AiConfig;
}): Promise<string | null> {
  const ranked = rankRefs(params.refs);
  // Top performers, rotated so consecutive posts don't all lean on the same 4 images
  const pool = ranked.slice(0, Math.min(ranked.length, 8));
  const chosen: ReferencePost[] = [];
  for (let i = 0; i < Math.min(4, pool.length); i++) chosen.push(pool[(params.rotation + i) % pool.length]);

  const square = isMostlySquare(params.refs);
  const size = square ? '1024x1024' : '1024x1536';
  const prompt = buildRefImagePrompt(params.slide, params.profile, !square);

  const logoPath = path.resolve(process.cwd(), 'logo/logo.png');
  const models = params.config.imageModels.filter(m => m.startsWith('gpt-image'));
  if (!models.length) models.push('gpt-image-1');

  for (const model of models) {
    try {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('size', size);
      form.append('quality', params.config.referenceQuality || 'medium');
      form.append('n', '1');
      for (const ref of chosen) {
        const buf = readRefImage(ref);
        if (buf) form.append('image[]', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), `${ref.id}.jpg`);
      }
      if (fs.existsSync(logoPath)) {
        form.append('image[]', new Blob([new Uint8Array(fs.readFileSync(logoPath))], { type: 'image/png' }), 'logo.png');
      }

      const json = await openaiFetchForm('images/edits', form);
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error('No image data returned');

      const slug = params.postId.replace(`${params.date}-`, '');
      const rel = `media/${params.date}/${slug}.jpg`;
      fs.mkdirSync(path.resolve(process.cwd(), 'media', params.date), { recursive: true });
      const target = square ? { width: 1080, height: 1080 } : { width: 1080, height: 1350 };
      await sharp(Buffer.from(b64, 'base64'))
        .resize({ ...target, fit: 'cover', position: 'centre' })
        .jpeg({ quality: 90 })
        .toFile(path.resolve(process.cwd(), rel));
      console.log(`[AI Studio] Reference-style image via ${model} (${size}) -> ${rel}`);
      return rel;
    } catch (err: any) {
      console.warn(`[AI Studio] Reference image with ${model} failed: ${err.message}`);
      if (err instanceof QuotaError) throw err;
    }
  }
  return null;
}

export interface ReferenceStyleResult {
  content: any;
  image: string;
  refIds: string[];
  via: string;
}

/**
 * Full reference-style post (text + image). Returns null on any failure so the
 * caller can fall back to the template flow.
 */
export async function generateReferenceStylePost(params: {
  postId: string;
  date: string;
  pillar: string;
  recentHeadlines: string[];
  rotation: number;
  config: AiConfig;
}): Promise<ReferenceStyleResult | null> {
  const refs = loadReferences();
  if (!refs.length || !getOpenAiKey()) return null;
  try {
    const profile = await ensureStyleProfile();
    if (!profile) return null;
    const content = await generateRefText({ ...params, profile, refs });
    if (!content) return null;
    const image = await generateRefImage({
      postId: params.postId,
      date: params.date,
      slide: content.slides[0],
      profile,
      refs,
      rotation: params.rotation,
      config: params.config
    });
    if (!image) return null;
    return { content, image, refIds: refs.map(r => r.id), via: `openai:${params.config.textModel}+refs` };
  } catch (err: any) {
    console.warn(`[AI Studio] Reference-style generation failed: ${err.message} — using template flow.`);
    return null;
  }
}
