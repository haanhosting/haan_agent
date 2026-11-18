import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  loadQueue,
  saveQueue,
  loadHistory,
  saveHistory,
  enqueuePosts,
  getDuePosts,
  updatePostStatus
} from '../src/state/stateManager.js';
import { pruneOldMedia } from '../src/schedule/pruneMedia.js';
import { PreparedPost } from '../src/content/slotMapper.js';

describe('State Management & Queue Lifecycle', () => {
  const originalQueue = loadQueue();
  const originalHistory = loadHistory();

  beforeEach(() => {
    saveQueue([]);
    saveHistory([]);
  });

  afterEach(() => {
    saveQueue(originalQueue);
    saveHistory(originalHistory);
  });

  const samplePost: PreparedPost = {
    id: 'test-2026-11-18-slot1',
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
      seed: 999,
      decoration: 'dots-grid',
      layoutVariant: 0
    },
    slides: [{ headline: 'Test Headline', cta: 'haanhosting.store' }],
    caption: 'Test caption for state testing #HaanHosting',
    hashtags: ['#HaanHosting'],
    altText: 'Alt text',
    images: ['media/2026-11-18/slot1.jpg'],
    imageUrls: ['https://username.github.io/haan-insta-agent/media/2026-11-18/slot1.jpg'],
    igMediaId: null,
    attempts: 0,
    error: null
  };

  it('enqueues posts idempotently without duplicating IDs', () => {
    const res1 = enqueuePosts([samplePost]);
    expect(res1.added).toBe(1);
    expect(res1.existing).toBe(0);

    const res2 = enqueuePosts([samplePost]);
    expect(res2.added).toBe(0);
    expect(res2.existing).toBe(1);

    expect(loadQueue()).toHaveLength(1);
  });

  it('filters due posts based on scheduled time and approval', () => {
    enqueuePosts([samplePost]);

    // Before scheduled time
    const earlyTime = new Date('2026-11-18T04:00:00Z');
    expect(getDuePosts(earlyTime)).toHaveLength(0);

    // After scheduled time
    const dueTime = new Date('2026-11-18T04:35:00Z');
    const due = getDuePosts(dueTime);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe(samplePost.id);
  });

  it('skips stale posts and returns at most one (oldest) due post per run', () => {
    const later = { ...samplePost, id: 'test-2026-11-18-slot2', slot: 2, scheduledAt: '2026-11-18T10:00:00+05:00' };
    const batchDupe = { ...samplePost, id: 'test-2026-11-18-slot1-b2' };
    enqueuePosts([later, samplePost, batchDupe]);

    // 05:10Z: slot1 (04:30Z) and slot2 (05:00Z) are both due -> only the oldest is returned
    const due = getDuePosts(new Date('2026-11-18T05:10:00Z'));
    expect(due).toHaveLength(1);
    expect(due[0].scheduledAt).toBe(samplePost.scheduledAt);

    // Next day: everything is far overdue -> nothing is auto-published
    expect(getDuePosts(new Date('2026-11-19T05:00:00Z'))).toHaveLength(0);
  });

  it('transitions status from queued to publishing to posted, writing to history', () => {
    enqueuePosts([samplePost]);

    // Transition to publishing
    updatePostStatus(samplePost.id, 'publishing');
    expect(loadQueue()[0].status).toBe('publishing');

    // Transition to posted with IG Media ID
    updatePostStatus(samplePost.id, 'posted', { igMediaId: '17900123456789' });
    const updated = loadQueue()[0];
    expect(updated.status).toBe('posted');
    expect(updated.igMediaId).toBe('17900123456789');

    // Check history updated
    const history = loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].headline).toBe('Test Headline');
    expect(history[0].date).toBe('2026-11-18');
  });

  it('increments attempts on error and marks failed after 3 attempts', () => {
    enqueuePosts([samplePost]);

    // Attempt 1 fails
    updatePostStatus(samplePost.id, 'queued', { error: 'Network timeout 1' });
    expect(loadQueue()[0].attempts).toBe(1);
    expect(loadQueue()[0].status).toBe('queued');

    // Attempt 2 fails
    updatePostStatus(samplePost.id, 'queued', { error: 'Network timeout 2' });
    expect(loadQueue()[0].attempts).toBe(2);
    expect(loadQueue()[0].status).toBe('queued');

    // Attempt 3 fails -> marked failed
    updatePostStatus(samplePost.id, 'queued', { error: 'Permanent 400 Bad Request' });
    const finalQueue = loadQueue();
    expect(finalQueue[0].attempts).toBe(3);
    expect(finalQueue[0].status).toBe('failed');
  });
});

describe('Media Pruning (> 60 days)', () => {
  const testOldDir = path.resolve(process.cwd(), 'media/2026-01-01');
  const testRecentDir = path.resolve(process.cwd(), 'media/2026-11-10');

  beforeEach(() => {
    if (!fs.existsSync(testOldDir)) fs.mkdirSync(testOldDir, { recursive: true });
    if (!fs.existsSync(testRecentDir)) fs.mkdirSync(testRecentDir, { recursive: true });
    fs.writeFileSync(path.join(testOldDir, 'old.jpg'), 'fake-image-bytes');
    fs.writeFileSync(path.join(testRecentDir, 'recent.jpg'), 'fake-recent-image-bytes');
  });

  afterEach(() => {
    if (fs.existsSync(testOldDir)) fs.rmSync(testOldDir, { recursive: true, force: true });
    if (fs.existsSync(testRecentDir)) fs.rmSync(testRecentDir, { recursive: true, force: true });
  });

  it('prunes directories older than 60 days while preserving recent ones', () => {
    const baseDate = new Date('2026-11-18T00:00:00Z');
    const res = pruneOldMedia(60, baseDate);

    expect(res.deletedDirs).toContain('2026-01-01');
    expect(res.deletedDirs).not.toContain('2026-11-10');
    expect(fs.existsSync(testOldDir)).toBe(false);
    expect(fs.existsSync(testRecentDir)).toBe(true);
  });
});
