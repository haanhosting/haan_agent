import fs from 'fs';
import path from 'path';

export interface PublishResult {
  igMediaId: string;
  creationId: string;
  publishedAt: string;
  isDuplicateRecovery?: boolean;
}

export function loadPublisherConfig(): any {
  const p = path.resolve(process.cwd(), 'config/providers.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).publisher.instagramGraph;
}

/**
 * Picks the Graph API host for the token type:
 * - Instagram-Login user tokens start with "IG"  -> graph.instagram.com
 * - Facebook / system-user tokens start with "EAA" -> graph.facebook.com
 * IG_GRAPH_BASE_URL overrides detection; config.baseUrl is used if it is not "auto".
 */
export function resolveGraphBaseUrl(token: string, configured?: string): string {
  if (process.env.IG_GRAPH_BASE_URL) return process.env.IG_GRAPH_BASE_URL;
  if (configured && configured !== 'auto') return configured;
  if (token.startsWith('EAA')) return 'https://graph.facebook.com';
  return 'https://graph.instagram.com';
}

function redactToken(urlOrStr: string): string {
  return urlOrStr.replace(/access_token=([^&]+)/gi, 'access_token=[REDACTED]');
}

export class InstagramGraphClient {
  private apiVersion: string;
  private baseUrl: string;
  private token: string;
  private userId: string;
  private pollTimeoutMs: number;
  private pollIntervalMs: number;

  constructor(options?: {
    apiVersion?: string;
    baseUrl?: string;
    token?: string;
    userId?: string;
  }) {
    const config = loadPublisherConfig();
    this.apiVersion = options?.apiVersion || config.apiVersion || 'v22.0';
    this.token = options?.token || process.env.IG_ACCESS_TOKEN || '';
    this.baseUrl = options?.baseUrl || resolveGraphBaseUrl(this.token, config.baseUrl);
    this.userId = options?.userId || process.env.IG_USER_ID || '';
    this.pollTimeoutMs = config.statusPollTimeoutMs || 90000;
    this.pollIntervalMs = config.statusPollIntervalMs || 3000;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Checks remaining daily publishing quota via content_publishing_limit
   */
  async checkPublishingLimit(dryRun = false): Promise<{ quotaUsage: number; configTotal: number }> {
    if (dryRun) {
      console.log(`[IG Graph DRY-RUN] GET ${this.baseUrl}/${this.apiVersion}/${this.userId}/content_publishing_limit?fields=config,quota_usage`);
      return { quotaUsage: 0, configTotal: 50 };
    }

    if (!this.token || !this.userId) {
      throw new Error('IG_ACCESS_TOKEN or IG_USER_ID is missing from environment');
    }

    const url = `${this.baseUrl}/${this.apiVersion}/${this.userId}/content_publishing_limit?fields=config,quota_usage`;
    const res = await fetch(url, { headers: this.getHeaders() });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      this.handleGraphError(err, res.status);
    }

    const data = await res.json() as any;
    const quotaUsage = data.data?.[0]?.quota_usage ?? 0;
    const configTotal = data.data?.[0]?.config?.quota_total ?? 50;

    console.log(`[IG Graph] Quota check: ${quotaUsage}/${configTotal} posts published in rolling 24h`);
    return { quotaUsage, configTotal };
  }

  /**
   * Verifies the token and user ID by reading the account's username.
   */
  async verifyAccount(): Promise<{ id: string; username: string; baseUrl: string }> {
    if (!this.token || !this.userId) {
      throw new Error('IG_ACCESS_TOKEN or IG_USER_ID is missing from environment');
    }
    const url = `${this.baseUrl}/${this.apiVersion}/${this.userId}?fields=id,username`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      this.handleGraphError(err, res.status);
    }
    const data = await res.json() as any;
    return { id: data.id, username: data.username, baseUrl: this.baseUrl };
  }

  /**
   * Idempotency Guard: Checks recent posts on the account to prevent duplicate publishing
   */
  async checkRecentDuplicate(caption: string, dryRun = false): Promise<string | null> {
    if (dryRun) return null;
    if (!this.token || !this.userId) return null;

    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${this.userId}/media?fields=id,caption&limit=10`;
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) return null;

      const data = await res.json() as any;
      const recentMedia = data.data || [];

      const cleanTarget = caption.trim().slice(0, 100);
      for (const item of recentMedia) {
        if (item.caption && item.caption.trim().slice(0, 100) === cleanTarget) {
          console.log(`[IG Graph] Duplicate post detected in recent media! Reusing existing ID: ${item.id}`);
          return item.id;
        }
      }
    } catch {
      // Non-fatal duplicate check
    }

    return null;
  }

  /**
   * Polls container status until FINISHED
   */
  private async pollContainerStatus(creationId: string, dryRun = false): Promise<void> {
    if (dryRun) {
      console.log(`[IG Graph DRY-RUN] Polling GET ${this.baseUrl}/${this.apiVersion}/${creationId}?fields=status_code,status (Simulating FINISHED)`);
      return;
    }

    const startTime = Date.now();
    const url = `${this.baseUrl}/${this.apiVersion}/${creationId}?fields=status_code,status`;

    while (Date.now() - startTime < this.pollTimeoutMs) {
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        this.handleGraphError(err, res.status);
      }

      const data = await res.json() as any;
      const status = data.status_code;

      if (status === 'FINISHED') {
        console.log(`[IG Graph] Container ${creationId} status: FINISHED`);
        return;
      }

      if (status === 'ERROR' || status === 'EXPIRED') {
        throw new Error(`Media container ${creationId} processing failed with status: ${status}`);
      }

      console.log(`[IG Graph] Container ${creationId} status: ${status} (waiting ${this.pollIntervalMs}ms)...`);
      await new Promise(r => setTimeout(r, this.pollIntervalMs));
    }

    throw new Error(`Media container ${creationId} timed out after ${this.pollTimeoutMs / 1000}s`);
  }

  /**
   * Publishes a single image post
   */
  async publishSingle(params: {
    imageUrl: string;
    caption: string;
    altText?: string;
    dryRun?: boolean;
  }): Promise<PublishResult> {
    const { imageUrl, caption, altText, dryRun = false } = params;

    // 1. Quota check
    const quota = await this.checkPublishingLimit(dryRun);
    if (quota.quotaUsage >= quota.configTotal) {
      throw new Error(`Daily publishing quota reached: ${quota.quotaUsage}/${quota.configTotal}`);
    }

    // 2. Duplicate check
    const existingId = await this.checkRecentDuplicate(caption, dryRun);
    if (existingId) {
      return {
        igMediaId: existingId,
        creationId: 'duplicate-recovered',
        publishedAt: new Date().toISOString(),
        isDuplicateRecovery: true
      };
    }

    if (dryRun) {
      console.log(`\n================== [IG GRAPH DRY-RUN: SINGLE POST] ==================`);
      console.log(`POST ${this.baseUrl}/${this.apiVersion}/${this.userId || 'USER_ID'}/media`);
      console.log(`Headers: Authorization: Bearer [REDACTED], Content-Type: application/json`);
      console.log(`Payload:`, JSON.stringify({ image_url: imageUrl, caption, alt_text: altText }, null, 2));
      console.log(`\nPOST ${this.baseUrl}/${this.apiVersion}/${this.userId || 'USER_ID'}/media_publish`);
      console.log(`Payload:`, JSON.stringify({ creation_id: 'mock-creation-id-12345' }, null, 2));
      console.log(`====================================================================\n`);

      return {
        igMediaId: 'mock-ig-media-single-12345',
        creationId: 'mock-creation-id-12345',
        publishedAt: new Date().toISOString()
      };
    }

    // Step 1: Create Container
    const createUrl = `${this.baseUrl}/${this.apiVersion}/${this.userId}/media`;
    const body: Record<string, any> = {
      image_url: imageUrl,
      caption
    };
    if (altText) body.alt_text = altText;

    console.log(`[IG Graph] Step 1: Creating media container for ${imageUrl}`);
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      this.handleGraphError(err, createRes.status);
    }

    const { id: creationId } = (await createRes.json()) as any;
    console.log(`[IG Graph] Container created: ${creationId}`);

    // Step 2: Poll status
    await this.pollContainerStatus(creationId);

    // Step 3: Publish Container
    const publishUrl = `${this.baseUrl}/${this.apiVersion}/${this.userId}/media_publish`;
    console.log(`[IG Graph] Step 2: Publishing container ${creationId}`);
    const pubRes = await fetch(publishUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ creation_id: creationId })
    });

    if (!pubRes.ok) {
      const err = await pubRes.json().catch(() => ({}));
      this.handleGraphError(err, pubRes.status);
    }

    const { id: igMediaId } = (await pubRes.json()) as any;
    console.log(`[IG Graph] Successfully published! Media ID: ${igMediaId}`);

    return {
      igMediaId,
      creationId,
      publishedAt: new Date().toISOString()
    };
  }

  /**
   * Publishes a carousel post (up to 10 slides)
   */
  async publishCarousel(params: {
    imageUrls: string[];
    caption: string;
    altText?: string;
    dryRun?: boolean;
  }): Promise<PublishResult> {
    const { imageUrls, caption, dryRun = false } = params;

    if (imageUrls.length < 2 || imageUrls.length > 10) {
      throw new Error(`Carousel requires between 2 and 10 images (provided: ${imageUrls.length})`);
    }

    // 1. Quota check
    const quota = await this.checkPublishingLimit(dryRun);
    if (quota.quotaUsage >= quota.configTotal) {
      throw new Error(`Daily publishing quota reached: ${quota.quotaUsage}/${quota.configTotal}`);
    }

    // 2. Duplicate check
    const existingId = await this.checkRecentDuplicate(caption, dryRun);
    if (existingId) {
      return {
        igMediaId: existingId,
        creationId: 'duplicate-recovered',
        publishedAt: new Date().toISOString(),
        isDuplicateRecovery: true
      };
    }

    if (dryRun) {
      console.log(`\n================== [IG GRAPH DRY-RUN: CAROUSEL POST] ==================`);
      console.log(`Creating ${imageUrls.length} child items:`);
      imageUrls.forEach((url, idx) => {
        console.log(`  Slide ${idx + 1}: POST ${this.baseUrl}/${this.apiVersion}/${this.userId || 'USER_ID'}/media?image_url=${url}&is_carousel_item=true`);
      });
      console.log(`\nCreating Carousel Container:`);
      console.log(`POST ${this.baseUrl}/${this.apiVersion}/${this.userId || 'USER_ID'}/media`);
      console.log(`Payload:`, JSON.stringify({
        media_type: 'CAROUSEL',
        children: imageUrls.map((_, i) => `mock-child-${i + 1}`).join(','),
        caption
      }, null, 2));
      console.log(`\nPublishing Carousel Container:`);
      console.log(`POST ${this.baseUrl}/${this.apiVersion}/${this.userId || 'USER_ID'}/media_publish`);
      console.log(`Payload:`, JSON.stringify({ creation_id: 'mock-carousel-container-999' }, null, 2));
      console.log(`======================================================================\n`);

      return {
        igMediaId: 'mock-ig-media-carousel-999',
        creationId: 'mock-carousel-container-999',
        publishedAt: new Date().toISOString()
      };
    }

    // Step 1: Create child container for each slide
    const childIds: string[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      console.log(`[IG Graph Carousel] Creating item ${i + 1}/${imageUrls.length}`);
      const itemUrl = `${this.baseUrl}/${this.apiVersion}/${this.userId}/media`;
      const res = await fetch(itemUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          image_url: url,
          is_carousel_item: true
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        this.handleGraphError(err, res.status);
      }

      const { id: childId } = (await res.json()) as any;
      // Instagram must finish fetching each slide before the parent carousel can reference it.
      await this.pollContainerStatus(childId);
      childIds.push(childId);
    }

    // Step 2: Create Carousel Container
    const carouselUrl = `${this.baseUrl}/${this.apiVersion}/${this.userId}/media`;
    console.log(`[IG Graph Carousel] Creating carousel container with ${childIds.length} items`);
    const carouselRes = await fetch(carouselUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption
      })
    });

    if (!carouselRes.ok) {
      const err = await carouselRes.json().catch(() => ({}));
      this.handleGraphError(err, carouselRes.status);
    }

    const { id: carouselContainerId } = (await carouselRes.json()) as any;

    // Step 3: Poll status
    await this.pollContainerStatus(carouselContainerId);

    // Step 4: Publish
    const publishUrl = `${this.baseUrl}/${this.apiVersion}/${this.userId}/media_publish`;
    console.log(`[IG Graph Carousel] Publishing carousel ${carouselContainerId}`);
    const pubRes = await fetch(publishUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ creation_id: carouselContainerId })
    });

    if (!pubRes.ok) {
      const err = await pubRes.json().catch(() => ({}));
      this.handleGraphError(err, pubRes.status);
    }

    const { id: igMediaId } = (await pubRes.json()) as any;
    console.log(`[IG Graph Carousel] Published successfully! Media ID: ${igMediaId}`);

    return {
      igMediaId,
      creationId: carouselContainerId,
      publishedAt: new Date().toISOString()
    };
  }

  /**
   * Maps Instagram API error responses to actionable exceptions per error matrix
   */
  private handleGraphError(errJson: any, status: number): never {
    const error = errJson?.error || {};
    const code = error.code;
    const subcode = error.error_subcode;
    const message = error.message || 'Unknown Graph API Error';

    if (code === 190) {
      throw new Error(`[IG Graph Error 190] Access token expired or invalid: ${message}. Re-run refresh-token or generate new token.`);
    }

    if (code === 4 || code === 32 || code === 17) {
      throw new Error(`[IG Graph Rate Limit] Quota exceeded (code ${code}): ${message}`);
    }

    throw new Error(`[IG Graph HTTP ${status}] Code ${code} (subcode ${subcode}): ${message}`);
  }
}
