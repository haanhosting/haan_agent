import fs from 'fs';
import path from 'path';

export interface UploadPostResult {
  id: string;
  platform: string;
  publishedAt: string;
  requestId?: string;
  postUrl?: string;
}

export interface UploadPostProfile {
  username: string;
  hasInstagram: boolean;
  platforms: string[];
}

export interface UploadPostHealth {
  ok: boolean;
  configuredUser: string | null;
  resolvedUser: string | null;
  profiles: UploadPostProfile[];
  error?: string;
}

export function loadUploadPostConfig(): any {
  const p = path.resolve(process.cwd(), 'config/providers.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).publisher.uploadPost;
}

/**
 * Queries GET https://api.upload-post.com/api/uploadposts/users to verify the API key
 * and discover connected Upload-Post user profiles (and whether Instagram is linked).
 */
export async function checkUploadPostConnection(apiKeyOverride?: string): Promise<UploadPostHealth> {
  const apiKey = apiKeyOverride || process.env.UPLOADPOST_API_KEY;
  const configuredUser = process.env.UPLOADPOST_USER || null;
  const config = loadUploadPostConfig();
  const usersEndpoint = config.usersEndpoint || 'https://api.upload-post.com/api/uploadposts/users';

  if (!apiKey) {
    return {
      ok: false,
      configuredUser,
      resolvedUser: configuredUser,
      profiles: [],
      error: 'UPLOADPOST_API_KEY is not set'
    };
  }

  try {
    const res = await fetch(usersEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Apikey ${apiKey}`,
        'X-Upload-Post-Source': 'haan-insta-agent'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        configuredUser,
        resolvedUser: configuredUser,
        profiles: [],
        error: `HTTP ${res.status}: ${errText}`
      };
    }

    const json = (await res.json()) as any;
    const rawProfiles: any[] = Array.isArray(json.profiles) ? json.profiles : [];
    const profiles: UploadPostProfile[] = rawProfiles.map(p => {
      const social = p.social_accounts || {};
      const platforms = Object.keys(social).filter(k => Boolean(social[k]));
      return {
        username: p.username,
        hasInstagram: Boolean(social.instagram),
        platforms
      };
    });

    // Resolve best user profile:
    // 1. Exact match on UPLOADPOST_USER if set
    // 2. First profile that has Instagram connected
    // 3. First profile in account
    let resolvedUser = configuredUser;
    if (profiles.length > 0) {
      const exact = configuredUser ? profiles.find(p => p.username === configuredUser) : undefined;
      const withIg = profiles.find(p => p.hasInstagram);
      resolvedUser = exact?.username || withIg?.username || profiles[0].username;
    }

    return {
      ok: true,
      configuredUser,
      resolvedUser,
      profiles
    };
  } catch (err: any) {
    return {
      ok: false,
      configuredUser,
      resolvedUser: configuredUser,
      profiles: [],
      error: err.message
    };
  }
}

export async function publishViaUploadPost(params: {
  imageUrls: string[];
  imagePaths?: string[];
  caption: string;
  altText?: string;
  postId?: string;
  dryRun?: boolean;
}): Promise<UploadPostResult> {
  const { imageUrls, imagePaths = [], caption, altText, postId, dryRun = false } = params;
  const config = loadUploadPostConfig();

  if (!config.enabled && !dryRun) {
    throw new Error('Upload-Post adapter is disabled in config/providers.json');
  }

  const apiKey = process.env.UPLOADPOST_API_KEY;
  let user = process.env.UPLOADPOST_USER || '';

  // Resolve local files if they exist on disk (preferred over GitHub Pages URLs)
  const resolvedLocalFiles: string[] = [];
  for (const relOrAbs of imagePaths) {
    const abs = path.resolve(process.cwd(), relOrAbs);
    if (fs.existsSync(abs)) {
      resolvedLocalFiles.push(abs);
    }
  }

  const useLocalFiles = resolvedLocalFiles.length > 0;

  if (dryRun) {
    const dryUser = user || 'haanhosting';
    console.log(`\n================== [UPLOAD-POST DRY-RUN] ==================`);
    console.log(`POST ${config.endpoint}`);
    console.log(`Headers:`);
    console.log(`  Authorization: Apikey [REDACTED]`);
    if (postId) console.log(`  Idempotency-Key: ${postId}`);
    console.log(`Form Data (multipart/form-data):`);
    console.log(`  user: ${dryUser}`);
    console.log(`  platform[]: instagram`);
    console.log(`  title: ${caption}`);
    if (altText) console.log(`  instagram_alt_text: ${altText}`);
    if (useLocalFiles) {
      resolvedLocalFiles.forEach(f => console.log(`  photos[]: @${path.relative(process.cwd(), f)} (binary image/jpeg)`));
    } else {
      imageUrls.forEach(url => console.log(`  photos[]: ${url}`));
    }
    console.log(`===========================================================\n`);

    return {
      id: 'mock-uploadpost-98765',
      platform: 'instagram',
      publishedAt: new Date().toISOString()
    };
  }

  if (!apiKey) {
    throw new Error(
      'UPLOADPOST_API_KEY environment variable is missing. Get your API key from https://app.upload-post.com/dashboard and set UPLOADPOST_API_KEY in .env'
    );
  }

  // If UPLOADPOST_USER is not set (or to verify it matches the dashboard profile), auto-resolve from API
  const health = await checkUploadPostConnection(apiKey);
  if (health.ok && health.resolvedUser) {
    if (user && user !== health.resolvedUser) {
      console.log(
        `[Upload-Post] Note: UPLOADPOST_USER="${user}" not found in dashboard profiles; using "${health.resolvedUser}" instead.`
      );
    }
    user = health.resolvedUser;
  } else if (!user) {
    user = 'haanhosting';
  }

  const mediaCount = useLocalFiles ? resolvedLocalFiles.length : imageUrls.length;
  console.log(
    `[Upload-Post] Publishing ${mediaCount} ${useLocalFiles ? 'local JPEG file(s)' : 'image URL(s)'} to Instagram (profile: "${user}") via Upload-Post API...`
  );

  const formData = new FormData();
  formData.append('user', user);
  formData.append('platform[]', 'instagram');
  formData.append('title', caption);

  if (altText) {
    formData.append('instagram_alt_text', altText);
  }

  if (useLocalFiles) {
    for (const filePath of resolvedLocalFiles) {
      const buffer = fs.readFileSync(filePath);
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      formData.append('photos[]', blob, path.basename(filePath));
    }
  } else {
    for (const url of imageUrls) {
      formData.append('photos[]', url);
    }
  }

  const headers: Record<string, string> = {
    'Authorization': `Apikey ${apiKey}`,
    'X-Upload-Post-Source': 'haan-insta-agent'
  };
  if (postId) {
    headers['Idempotency-Key'] = postId;
  }

  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: formData
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Upload-Post HTTP ${res.status} error: ${errorText}`);
  }

  const json = (await res.json()) as any;
  if (json.success === false) {
    throw new Error(`Upload-Post API error: ${json.message || json.error || JSON.stringify(json)}`);
  }

  console.log('[Upload-Post] Successfully published via Upload-Post:', json);

  const igPlatformEntry = Array.isArray(json.data?.platforms)
    ? json.data.platforms.find((p: any) => p.name === 'instagram')
    : undefined;

  const resultId = json.request_id || json.job_id || json.id || `up-${Date.now()}`;

  return {
    id: resultId,
    requestId: json.request_id,
    postUrl: igPlatformEntry?.url,
    platform: 'instagram',
    publishedAt: new Date().toISOString()
  };
}
