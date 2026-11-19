import fs from 'fs';
import path from 'path';
import { InstagramGraphClient, PublishResult } from './instagramGraph.js';
import { waitForMediaUrl, getPublicMediaUrl } from './mediaHost.js';
import { PreparedPost } from '../content/slotMapper.js';

export function getActivePublisherType(): string {
  const p = path.resolve(process.cwd(), 'config/providers.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).publisher.active || 'instagramGraph';
}

export async function publishPost(
  post: PreparedPost,
  options: { dryRun?: boolean; skipMediaWait?: boolean } = {}
): Promise<PublishResult> {
  const { dryRun = false, skipMediaWait = false } = options;
  const activePublisher = getActivePublisherType();

  console.log(`[Publisher] Dispatching post ${post.id} (Pillar: ${post.pillar}, Format: ${post.format}) via ${activePublisher}`);

  // Ensure image URLs are set
  // Always derive URLs from the current PAGES_BASE_URL; stored imageUrls may hold a stale host.
  const imageUrls = post.images && post.images.length > 0
    ? post.images.map(img => getPublicMediaUrl(img))
    : (post.imageUrls || []);

  if (imageUrls.length === 0 && (!post.images || post.images.length === 0)) {
    throw new Error(`Post ${post.id} has no images associated with it`);
  }

  // Verify the images are publicly reachable before Instagram tries to fetch them
  if (!skipMediaWait) {
    for (const url of imageUrls) {
      const waitResult = await waitForMediaUrl(url, { dryRun });
      if (!waitResult.ok) {
        throw new Error(`Media host validation failed for ${url}: ${waitResult.error}`);
      }
    }
  }

  // Official Instagram Graph API
  const client = new InstagramGraphClient();
  if (post.format === 'carousel' || imageUrls.length > 1) {
    return client.publishCarousel({
      imageUrls,
      caption: post.caption,
      altText: post.altText,
      dryRun
    });
  } else {
    return client.publishSingle({
      imageUrl: imageUrls[0],
      caption: post.caption,
      altText: post.altText,
      dryRun
    });
  }
}

/**
 * Posts a queued post's image(s) as Instagram Stories. A carousel becomes
 * one story frame per slide, in order. The feed post is untouched.
 */
export async function publishPostAsStory(
  post: PreparedPost,
  options: { dryRun?: boolean } = {}
): Promise<{ igMediaIds: string[]; publishedAt: string }> {
  const { dryRun = false } = options;
  const imageUrls = post.images && post.images.length > 0
    ? post.images.map(img => getPublicMediaUrl(img))
    : (post.imageUrls || []);
  if (imageUrls.length === 0) throw new Error(`Post ${post.id} has no images associated with it`);

  console.log(`[Publisher] Posting ${post.id} as ${imageUrls.length} story frame(s)`);
  const client = new InstagramGraphClient();
  const igMediaIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const r = await client.publishStory({ imageUrl, dryRun });
    igMediaIds.push(r.igMediaId);
  }
  return { igMediaIds, publishedAt: new Date().toISOString() };
}
