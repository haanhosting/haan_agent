import fs from 'fs';
import path from 'path';
import { GeneratedPost } from './schema.js';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function loadBrandConfig(): any {
  const brandPath = path.resolve(process.cwd(), 'config/brand.json');
  return JSON.parse(fs.readFileSync(brandPath, 'utf8'));
}

export function validatePost(post: GeneratedPost): ValidationResult {
  const errors: string[] = [];
  const brand = loadBrandConfig();

  // 1. Caption length
  if (!post.caption || post.caption.trim().length === 0) {
    errors.push('Caption cannot be empty');
  } else if (post.caption.length > 2200) {
    errors.push(`Caption exceeds 2200 characters (actual: ${post.caption.length})`);
  }

  // 2. Hashtags count
  if (!post.hashtags || post.hashtags.length < 5 || post.hashtags.length > 15) {
    errors.push(`Hashtags count must be between 5 and 15 (actual: ${post.hashtags?.length || 0})`);
  }

  // Brand hashtag check
  const hasBrandTag = post.hashtags.some(tag =>
    tag.toLowerCase() === '#haanhosting' || tag.toLowerCase() === '#haanhostingpk'
  );
  if (!hasBrandTag) {
    errors.push('Hashtags must include #HaanHosting');
  }

  // 3. Banned phrases (truthfulness guardrail)
  const bannedPhrases: string[] = brand.voice?.bannedPhrases || [
    '100% uptime',
    'guaranteed sales',
    'best in the world',
    'instant riches',
    'free forever'
  ];

  const fullText = `${post.caption} ${post.slides.map(s => `${s.headline} ${s.body || ''}`).join(' ')}`.toLowerCase();

  for (const phrase of bannedPhrases) {
    if (fullText.includes(phrase.toLowerCase())) {
      errors.push(`Post contains banned claim/phrase: "${phrase}"`);
    }
  }

  // 4. Placeholders check
  const placeholderRegex = /\[todo\]|\[insert\]|\{\{|\bTODO\b|lorem ipsum/i;
  if (placeholderRegex.test(fullText)) {
    errors.push('Post contains unpopulated placeholder text');
  }

  // 5. Offer pillar validation (Must reference real offers)
  if (post.pillar === 'offers') {
    const verifiedOfferIds: string[] = (brand.offers || []).map((o: any) => o.id);
    if (!post.offerId || !verifiedOfferIds.includes(post.offerId)) {
      // Check if planName matches any verified offer
      const slidePlan = post.slides[0]?.planName;
      const matched = brand.offers.some((o: any) =>
        o.plan.toLowerCase() === slidePlan?.toLowerCase() ||
        o.id === post.offerId
      );
      if (!matched) {
        errors.push(`Offer post does not match any verified offer in brand.json (offerId: ${post.offerId})`);
      }
    }
  }

  // 6. Slides count & structure
  if (!post.slides || post.slides.length === 0) {
    errors.push('Post must have at least one slide');
  } else if (post.format === 'carousel' && (post.slides.length < 2 || post.slides.length > 10)) {
    errors.push(`Carousel post must have between 2 and 10 slides (actual: ${post.slides.length})`);
  }

  // 7. Alt text
  if (!post.altText || post.altText.trim().length < 10) {
    errors.push('Alt text must be at least 10 characters long');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
