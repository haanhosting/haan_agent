import path from 'path';

export interface MediaHostOptions {
  pagesBaseUrl?: string;
  timeoutMs?: number;
  intervalMs?: number;
  dryRun?: boolean;
}

/**
 * Converts a local media path (e.g. "media/2026-11-18/slot1-1.jpg") to a public GitHub Pages URL.
 */
export function getPublicMediaUrl(mediaPath: string, baseUrl?: string): string {
  const base = baseUrl || process.env.PAGES_BASE_URL || 'https://haan-agent.pages.dev';
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = mediaPath.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}

/**
 * Polls the public media URL until HTTP 200 with image/jpeg is received.
 */
export async function waitForMediaUrl(
  url: string,
  options: MediaHostOptions = {}
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const {
    timeoutMs = 180000, // 3 minutes
    intervalMs = 4000,
    dryRun = false
  } = options;

  if (dryRun) {
    console.log(`[MediaHost DRY-RUN] Simulating public reachability check for: ${url} (OK 200)`);
    return { ok: true, status: 200 };
  }

  const startTime = Date.now();
  console.log(`[MediaHost] Verifying public availability of: ${url}`);

  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const contentType = res.headers.get('content-type') || '';

      if (res.status === 200 && (contentType.includes('image/jpeg') || contentType.includes('image/jpg') || contentType.includes('application/octet-stream'))) {
        console.log(`[MediaHost] URL is live and returning HTTP 200 (${contentType}): ${url}`);
        return { ok: true, status: 200 };
      }

      console.log(`[MediaHost] Waiting for propagation... status: ${res.status}, type: ${contentType}`);
    } catch (err: any) {
      console.log(`[MediaHost] Network check waiting (${err.message})...`);
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  return {
    ok: false,
    error: `Timed out after ${timeoutMs / 1000}s waiting for ${url} to become publicly reachable`
  };
}
