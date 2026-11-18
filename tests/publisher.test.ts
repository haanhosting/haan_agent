import { describe, it, expect } from 'vitest';
import { getPublicMediaUrl, waitForMediaUrl } from '../src/publish/mediaHost.js';
import { InstagramGraphClient } from '../src/publish/instagramGraph.js';
import { refreshInstagramToken, loadTokenState } from '../src/publish/tokenRefresh.js';
import { publishPost } from '../src/publish/publisher.js';
import { PreparedPost } from '../src/content/slotMapper.js';

describe('Media Host Helper', () => {
  it('constructs correct GitHub Pages URL', () => {
    const url = getPublicMediaUrl('media/2026-11-18/slot1.jpg', 'https://haanhosting.github.io/haan-insta-agent');
    expect(url).toBe('https://haanhosting.github.io/haan-insta-agent/media/2026-11-18/slot1.jpg');
  });

  it('handles leading and trailing slashes cleanly', () => {
    const url = getPublicMediaUrl('/media/2026-11-18/slot2.jpg', 'https://example.com/repo/');
    expect(url).toBe('https://example.com/repo/media/2026-11-18/slot2.jpg');
  });

  it('simulates reachability in dry-run mode immediately', async () => {
    const res = await waitForMediaUrl('https://example.com/test.jpg', { dryRun: true });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
  });
});

describe('Instagram Graph API Client (Dry Run)', () => {
  const client = new InstagramGraphClient({
    token: 'test-token-xyz',
    userId: '17841400000000000'
  });

  it('performs single image dry-run correctly without sending HTTP requests', async () => {
    const res = await client.publishSingle({
      imageUrl: 'https://username.github.io/haan-insta-agent/media/test.jpg',
      caption: 'Test caption #HaanHosting',
      dryRun: true
    });

    expect(res.igMediaId).toBeDefined();
    expect(res.creationId).toBeDefined();
  });

  it('performs carousel dry-run correctly for multiple slides', async () => {
    const res = await client.publishCarousel({
      imageUrls: [
        'https://username.github.io/haan-insta-agent/media/slide1.jpg',
        'https://username.github.io/haan-insta-agent/media/slide2.jpg',
        'https://username.github.io/haan-insta-agent/media/slide3.jpg'
      ],
      caption: 'Carousel caption #HaanHosting',
      dryRun: true
    });

    expect(res.igMediaId).toBeDefined();
    expect(res.creationId).toBeDefined();
  });

  it('rejects carousel with less than 2 slides', async () => {
    await expect(
      client.publishCarousel({
        imageUrls: ['https://username.github.io/test.jpg'],
        caption: 'Only 1 slide',
        dryRun: true
      })
    ).rejects.toThrow('between 2 and 10 images');
  });
});

describe('Token Refresh & Publisher (Dry Run)', () => {
  it('simulates token refresh in dry run mode', async () => {
    const res = await refreshInstagramToken({ token: 'mock-token', dryRun: true });
    expect(res.daysLeft).toBe(60);
    expect(res.newToken).toBeDefined();
  });

  it('dispatches prepared post via master publishPost in dry run', async () => {
    const post: PreparedPost = {
      id: '2026-11-18-slot1',
      date: '2026-11-18',
      slot: 1,
      scheduledAt: '2026-11-18T09:30:00+05:00',
      status: 'queued',
      approved: true,
      pillar: 'tips',
      format: 'single',
      template: 'T01-bold-statement',
      design: {
        palette: 'ocean-blue',
        seed: 1234,
        decoration: 'mesh-gradient',
        layoutVariant: 0
      },
      slides: [{ headline: 'Test', cta: 'haanhosting.store' }],
      caption: 'Full caption #HaanHosting',
      hashtags: ['#HaanHosting'],
      altText: 'Alt text',
      images: ['media/2026-11-18/slot1.jpg'],
      imageUrls: ['https://username.github.io/haan-insta-agent/media/2026-11-18/slot1.jpg'],
      igMediaId: null,
      attempts: 0,
      error: null
    };

    const res = await publishPost(post, { dryRun: true });
    expect(res.igMediaId).toBeDefined();
  });
});
