import fs from 'fs';
import path from 'path';
import { PreparedPost, loadScheduleConfig } from '../content/slotMapper.js';
import { HistoryItem, hashString } from '../design/uniqueness.js';
import { isPostDue } from '../schedule/scheduler.js';

const queuePath = path.resolve(process.cwd(), 'state/queue.json');
const historyPath = path.resolve(process.cwd(), 'state/history.json');

export function loadQueue(): PreparedPost[] {
  if (!fs.existsSync(queuePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  } catch {
    return [];
  }
}

export function saveQueue(queue: PreparedPost[]): void {
  const dir = path.dirname(queuePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
}

export function loadHistory(): HistoryItem[] {
  if (!fs.existsSync(historyPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  } catch {
    return [];
  }
}

export function saveHistory(history: HistoryItem[]): void {
  const dir = path.dirname(historyPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

/**
 * Enqueues newly generated posts idempotently (ignoring duplicates by ID).
 */
export function enqueuePosts(
  newPosts: PreparedPost[],
  options: { prepend?: boolean } = {}
): { added: number; existing: number } {
  const queue = loadQueue();
  const existingIds = new Set(queue.map(p => p.id));
  let added = 0;
  let existing = 0;
  const toInsert: PreparedPost[] = [];

  for (const post of newPosts) {
    if (existingIds.has(post.id)) {
      existing++;
    } else {
      toInsert.push(post);
      existingIds.add(post.id);
      added++;
    }
  }

  if (options.prepend) {
    queue.unshift(...toInsert);
  } else {
    queue.push(...toInsert);
  }

  saveQueue(queue);
  console.log(`[Queue] Enqueued ${added} new posts (${existing} already existed)`);
  return { added, existing };
}

/** Posts more than this late are considered missed and are not auto-published. */
export const MAX_LATENESS_MS = 90 * 60 * 1000;

/**
 * Finds the next post due for publishing right now (at most one per run).
 */
export function getDuePosts(referenceTime: Date = new Date()): PreparedPost[] {
  const queue = loadQueue();
  const schedule = loadScheduleConfig();

  return queue.filter(post => {
    // 1. Must be queued
    if (post.status !== 'queued') return false;

    // 2. Must be approved (if approval required)
    if (schedule.requireApproval && !post.approved) return false;

    // 3. Must be due (scheduledAt <= now)
    if (!isPostDue(post.scheduledAt, referenceTime)) return false;

    // 4. Must not have exceeded max retries (3)
    if (post.attempts >= 3) return false;

    // 5. Must not be stale: a post that missed its slot by more than the cutoff
    // is skipped rather than dumped onto the feed alongside other backlog posts.
    const lateMs = referenceTime.getTime() - new Date(post.scheduledAt).getTime();
    if (lateMs > MAX_LATENESS_MS) return false;

    return true;
  })
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    // Publish at most one post per run so a backlog never floods the account.
    .slice(0, 1);
}

/**
 * Updates post status in queue and updates history on successful publish.
 */
export function updatePostStatus(
  postId: string,
  newStatus: 'queued' | 'publishing' | 'posted' | 'failed' | 'skipped' | 'rejected',
  meta: { igMediaId?: string; error?: string } = {}
): PreparedPost {
  const queue = loadQueue();
  const post = queue.find(p => p.id === postId);

  if (!post) {
    throw new Error(`Post ${postId} not found in queue`);
  }

  post.status = newStatus;
  if (newStatus === 'posted') {
    post.postedAt = new Date().toISOString();
    post.approved = true;
  } else if (newStatus === 'rejected') {
    post.rejectedAt = new Date().toISOString();
    post.approved = false;
  } else if (newStatus === 'queued') {
    post.rejectedAt = null;
  }

  if (meta.error) {
    post.error = meta.error;
    post.attempts = (post.attempts || 0) + 1;
    // If attempts >= 3, mark permanently failed
    if (post.attempts >= 3) {
      post.status = 'failed';
    }
  }

  if (meta.igMediaId) {
    post.igMediaId = meta.igMediaId;
    post.error = null;
  }

  saveQueue(queue);

  // If successfully posted, append to history
  if (newStatus === 'posted') {
    const history = loadHistory();
    const captionHash = String(hashString(post.caption));

    const historyItem: HistoryItem = {
      date: post.date,
      slot: post.slot,
      template: post.template,
      palette: post.design.palette,
      decoration: post.design.decoration,
      layoutVariant: post.design.layoutVariant,
      headline: post.slides[0]?.headline || '',
      pillar: post.pillar,
      captionHash
    };

    // Avoid duplicate history entries
    const exists = history.some(h => h.date === post.date && h.slot === post.slot);
    if (!exists) {
      history.push(historyItem);
      // Keep rolling 30 days
      if (history.length > 150) {
        history.splice(0, history.length - 150);
      }
      saveHistory(history);
      console.log(`[History] Recorded post ${postId} in state/history.json`);
    }
  }

  console.log(`[Queue] Post ${postId} updated to status: ${post.status} (attempts: ${post.attempts})`);
  return post;
}
