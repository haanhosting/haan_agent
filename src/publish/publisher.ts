import fs from 'fs';
import path from 'path';
import { InstagramGraphClient, PublishResult } from './instagramGraph.js';
import { publishViaUploadPost } from './uploadPost.js';
import { waitForMediaUrl, getPublicMediaUrl } from './mediaHost.js';
import { PreparedPost } from '../content/slotMapper.js';

export function getActivePublisherType(): string {
  const p = path.resolve(process.cwd(), 'config/providers.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).publisher.active || 'uploadpost';
}

export async function publishPost(
  post: PreparedPost,
  options: { dryRun?: boolean; skipMediaWait?: boolean } = {}
): Promise<PublishResult> {
  const { dryRun = false, skipMediaWait = false } = options;
  const activePublisher = getActivePublisherType();

  console.log(`[Publisher] Dispatching post ${post.id} (Pillar: ${post.pillar}, Format: ${post.format}) via ${activePublisher}`);

  // Ensure image URLs are set
  const imageUrls = post.imageUrls && post.imageUrls.length > 0
    ? post.imageUrls
    : post.images.map(img => getPublicMediaUrl(img));

  if (imageUrls.length === 0 && (!post.images || post.images.length === 0)) {
    throw new Error(`Post ${post.id} has no images associated with it`);
  }

  if (activePublisher === 'uploadpost') {
    const hasLocalFiles = (post.images || []).some(img => fs.existsSync(path.resolve(process.cwd(), img)));

    // Only verify public URL reachability if we do NOT have local image files on disk
    if (!hasLocalFiles && !skipMediaWait) {
      for (const url of imageUrls) {
        const waitResult = await waitForMediaUrl(url, { dryRun });
        if (!waitResult.ok) {
          throw new Error(`Media host validation failed for ${url}: ${waitResult.error}`);
        }
      }
    }

    const res = await publishViaUploadPost({
      imageUrls,
      imagePaths: post.images || [],
      caption: post.caption,
      altText: post.altText,
      postId: post.id,
      dryRun
    });
    return {
      igMediaId: res.id,
      creationId: res.requestId || res.id,
      publishedAt: res.publishedAt
    };
  }

  // Verify public reachability via GitHub Pages before notifying Instagram Graph API
  if (!skipMediaWait) {
    for (const url of imageUrls) {
      const waitResult = await waitForMediaUrl(url, { dryRun });
      if (!waitResult.ok) {
        throw new Error(`Media host validation failed for ${url}: ${waitResult.error}`);
      }
    }
  }

  // Fallback/Alternative: official Instagram Graph API
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
