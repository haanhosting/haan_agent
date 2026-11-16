import fs from 'fs';
import path from 'path';

export interface UploadPostResult {
  id: string;
  platform: string;
  publishedAt: string;
}

export function loadUploadPostConfig(): any {
  const p = path.resolve(process.cwd(), 'config/providers.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).publisher.uploadPost;
}

export async function publishViaUploadPost(params: {
  imageUrls: string[];
  caption: string;
  dryRun?: boolean;
}): Promise<UploadPostResult> {
  const { imageUrls, caption, dryRun = false } = params;
  const config = loadUploadPostConfig();

  if (!config.enabled && !dryRun) {
    throw new Error('Upload-Post adapter is disabled in config/providers.json (Only 10 free uploads/month)');
  }

  const apiKey = process.env.UPLOADPOST_API_KEY;
  const user = process.env.UPLOADPOST_USER || 'haanhosting';

  if (dryRun) {
    console.log(`\n================== [UPLOAD-POST DRY-RUN] ==================`);
    console.log(`POST ${config.endpoint}`);
    console.log(`Headers: Authorization: Apikey [REDACTED]`);
    console.log(`Form Data:`);
    console.log(`  user: ${user}`);
    console.log(`  platform[]: instagram`);
    console.log(`  title: ${caption}`);
    imageUrls.forEach(url => console.log(`  photos[]: ${url}`));
    console.log(`===========================================================\n`);

    return {
      id: 'mock-uploadpost-98765',
      platform: 'instagram',
      publishedAt: new Date().toISOString()
    };
  }

  if (!apiKey) {
    throw new Error('UPLOADPOST_API_KEY environment variable is missing');
  }

  console.log(`[Upload-Post] Publishing ${imageUrls.length} image(s) to Instagram via Upload-Post API...`);

  const formData = new FormData();
  formData.append('user', user);
  formData.append('platform[]', 'instagram');
  formData.append('title', caption);

  for (const url of imageUrls) {
    formData.append('photos[]', url);
  }

  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Apikey ${apiKey}`
    },
    body: formData
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Upload-Post HTTP ${res.status} error: ${errorText}`);
  }

  const json = (await res.json()) as any;
  console.log('[Upload-Post] Successfully published via Upload-Post:', json);

  return {
    id: json.id || `up-${Date.now()}`,
    platform: 'instagram',
    publishedAt: new Date().toISOString()
  };
}
