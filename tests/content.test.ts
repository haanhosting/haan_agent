import { describe, it, expect } from 'vitest';
import { validatePost } from '../src/content/validator.js';
import { GeneratedPost } from '../src/content/schema.js';
import { pickBankPost, loadContentBank } from '../src/content/bank.js';
import { generateDailyPosts, getActiveSlotsForDay } from '../src/content/slotMapper.js';

describe('Content Validator - Truthfulness & Rules', () => {
  const validSample: GeneratedPost = {
    pillar: 'tips',
    format: 'single',
    template: 'T02-split-card',
    slides: [
      {
        headline: 'Why Your WordPress Site Is Dragging Today',
        body: 'Most slow sites suffer from uncompressed images. Upgrading to an isolated NVMe VPS gives dedicated resources.',
        cta: 'haanhosting.store'
      }
    ],
    caption: 'Is your website taking too long to load? Upgrade to fast NVMe storage today. Visit haanhosting.store (link in bio).',
    hashtags: ['#HaanHosting', '#WebHosting', '#VPS', '#WordPress', '#PakistanTech', '#SpeedUp'],
    altText: 'Graphic explaining WordPress speed optimization and NVMe cloud hosting.'
  };

  it('passes for a valid, truthful post', () => {
    const res = validatePost(validSample);
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects post containing banned claim "100% uptime"', () => {
    const invalid = {
      ...validSample,
      caption: 'Get guaranteed 100% uptime with our brand new servers!'
    };
    const res = validatePost(invalid);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.includes('100% uptime'))).toBe(true);
  });

  it('rejects post missing #HaanHosting hashtag', () => {
    const invalid = {
      ...validSample,
      hashtags: ['#webhosting', '#cloudvps', '#tech', '#pakistan', '#speed']
    };
    const res = validatePost(invalid);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.includes('#HaanHosting'))).toBe(true);
  });

  it('rejects post with too few hashtags (< 5)', () => {
    const invalid = {
      ...validSample,
      hashtags: ['#HaanHosting', '#webhosting']
    };
    const res = validatePost(invalid);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.includes('between 5 and 15'))).toBe(true);
  });

  it('rejects offer post with unverified offerId or plan', () => {
    const fakeOffer: GeneratedPost = {
      ...validSample,
      pillar: 'offers',
      offerId: 'fake-super-discount-99c',
      slides: [
        {
          headline: 'Secret 90% Off Hosting Sale',
          planName: 'Invented Mega Plan',
          price: '$0.99/mo',
          cta: 'haanhosting.store'
        }
      ]
    };
    const res = validatePost(fakeOffer);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.includes('does not match any verified offer'))).toBe(true);
  });

  it('accepts offer post with verified offerId', () => {
    const realOffer: GeneratedPost = {
      ...validSample,
      pillar: 'offers',
      offerId: 'starter-vps-1199',
      slides: [
        {
          headline: 'High-Performance NVMe Cloud VPS',
          planName: 'Starter Cloud VPS',
          price: '$11.99/mo',
          cta: 'haanhosting.store'
        }
      ]
    };
    const res = validatePost(realOffer);
    expect(res.ok).toBe(true);
  });
});

describe('Offline Content Bank', () => {
  it('contains at least 60 high-quality posts', () => {
    const bank = loadContentBank();
    expect(bank.length).toBeGreaterThanOrEqual(60);
  });

  it('picks an appropriate post for single format', () => {
    const post = pickBankPost({
      pillar: 'tips',
      format: 'single',
      usedIds: new Set()
    });
    expect(post).toBeDefined();
    expect(post.pillar).toBe('tips');
    expect(post.format).toBe('single');
  });

  it('picks an appropriate post for carousel format', () => {
    const post = pickBankPost({
      pillar: 'tips',
      format: 'carousel',
      usedIds: new Set()
    });
    expect(post).toBeDefined();
    expect(post.format).toBe('carousel');
    expect(post.slides.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Daily Slot Orchestration', () => {
  it('loads 5 active slots by default', () => {
    const slots = getActiveSlotsForDay(5);
    expect(slots).toHaveLength(5);
    expect(slots[0].timePkt).toBe('09:30');
    expect(slots[4].timePkt).toBe('21:30');
  });

  it('drops slot 2 when postsPerDay is 4', () => {
    const slots = getActiveSlotsForDay(4);
    expect(slots).toHaveLength(4);
    expect(slots.some(s => s.id === 2)).toBe(false);
  });

  it('generates 5 fully prepared posts for a day (using fallback bank if LLM keys not set)', async () => {
    const posts = await generateDailyPosts({
      date: '2026-11-18',
      history: [],
      postsPerDay: 5
    });

    expect(posts).toHaveLength(5);
    expect(posts[0].scheduledAt).toContain('+05:00');
    expect(posts[0].id).toBe('2026-11-18-slot1');
    expect(posts[4].id).toBe('2026-11-18-slot5');
    expect(posts[4].format).toBe('carousel');

    // Check anti-repeat rules across generated posts
    const templates = posts.map(p => p.template);
    const uniqueTemplates = new Set(templates);
    expect(uniqueTemplates.size).toBe(5); // All 5 templates different

    const palettes = posts.map(p => p.design.palette);
    const uniquePalettes = new Set(palettes);
    expect(uniquePalettes.size).toBe(5); // All 5 palettes different
  });
});
