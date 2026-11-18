// Cloudflare Pages Function handling all /api/* routes for HAAN HOSTING Instagram Agent

let memoryQueue = null;
let memoryHistory = null;
let runtimeApiKey = null;
let runtimeUser = null;

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function getNextDayKarachi() {
  const now = new Date();
  const karachiMs = now.getTime() + (5 * 60 + now.getTimezoneOffset()) * 60000 + 86400000;
  const d = new Date(karachiMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchAssetJson(context, assetPath, fallback = []) {
  try {
    const url = new URL(assetPath, context.request.url);
    const res = await context.env.ASSETS.fetch(url.toString());
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

async function loadGithubQueueIfConfigured(env) {
  const pat = env.GH_PAT;
  const repo = env.GITHUB_REPOSITORY || 'haanhosting/haan_agent';
  if (!pat) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/state/queue.json`, {
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'haan-insta-agent-cloudflare'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const bin = atob(data.content.replace(/\n/g, ''));
    const decoded = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    return { queue: JSON.parse(decoded), sha: data.sha };
  } catch {
    return null;
  }
}

async function saveGithubQueueIfConfigured(env, queue) {
  const pat = env.GH_PAT;
  const repo = env.GITHUB_REPOSITORY || 'haanhosting/haan_agent';
  if (!pat) return;
  try {
    const existing = await loadGithubQueueIfConfigured(env);
    const contentBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(queue, null, 2))));
    await fetch(`https://api.github.com/repos/${repo}/contents/state/queue.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'haan-insta-agent-cloudflare',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'chore(cloudflare): update state/queue.json [skip ci]',
        content: contentBase64,
        ...(existing?.sha ? { sha: existing.sha } : {})
      })
    });
  } catch {
    // Ignore GitHub sync errors if PAT lacks write permissions
  }
}

async function getQueueState(context) {
  const ghData = await loadGithubQueueIfConfigured(context.env);
  if (ghData && Array.isArray(ghData.queue)) {
    memoryQueue = ghData.queue;
    return memoryQueue;
  }
  if (!memoryQueue) {
    memoryQueue = await fetchAssetJson(context, '/state/queue.json', []);
  }
  return memoryQueue;
}

async function checkUploadPostHealth(apiKey, configuredUser) {
  if (!apiKey) {
    return {
      ok: false,
      configuredUser: configuredUser || null,
      resolvedUser: configuredUser || null,
      profiles: [],
      error: 'UPLOADPOST_API_KEY is not set (add in Cloudflare Environment Variables or paste below)'
    };
  }
  try {
    const res = await fetch('https://api.upload-post.com/api/uploadposts/users', {
      headers: {
        'Authorization': `Apikey ${apiKey}`,
        'X-Upload-Post-Source': 'haan-insta-agent-cf'
      }
    });
    if (!res.ok) {
      return {
        ok: false,
        configuredUser,
        resolvedUser: configuredUser,
        profiles: [],
        error: `HTTP ${res.status}: ${await res.text()}`
      };
    }
    const json = await res.json();
    const rawProfiles = Array.isArray(json.profiles) ? json.profiles : [];
    const profiles = rawProfiles.map(p => {
      const social = p.social_accounts || {};
      return {
        username: p.username,
        hasInstagram: Boolean(social.instagram),
        platforms: Object.keys(social).filter(k => Boolean(social[k]))
      };
    });
    let resolvedUser = configuredUser || null;
    if (profiles.length > 0) {
      const exact = configuredUser ? profiles.find(p => p.username === configuredUser) : undefined;
      const withIg = profiles.find(p => p.hasInstagram);
      resolvedUser = (exact && exact.username) || (withIg && withIg.username) || profiles[0].username;
    }
    return {
      ok: true,
      configuredUser: configuredUser || null,
      resolvedUser,
      profiles
    };
  } catch (err) {
    return {
      ok: false,
      configuredUser: configuredUser || null,
      resolvedUser: configuredUser || null,
      profiles: [],
      error: err.message
    };
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  const apiKey = runtimeApiKey || env.UPLOADPOST_API_KEY || '';
  const upUser = runtimeUser || env.UPLOADPOST_USER || '';

  try {
    if (request.method === 'GET' && pathname === '/api/state') {
      const [brand, schedule, pillars, queue, history, bank, samples, token, uploadPostHealth] = await Promise.all([
        fetchAssetJson(context, '/config/brand.json', {}),
        fetchAssetJson(context, '/config/schedule.json', {}),
        fetchAssetJson(context, '/content/pillars.json', {}),
        getQueueState(context),
        memoryHistory ? Promise.resolve(memoryHistory) : fetchAssetJson(context, '/state/history.json', []),
        fetchAssetJson(context, '/content/bank/posts.json', []),
        fetchAssetJson(context, '/state/samples.json', []),
        fetchAssetJson(context, '/state/token.json', { status: 'uninitialized', lastRefreshed: null, daysLeft: null }),
        checkUploadPostHealth(apiKey, upUser)
      ]);

      return jsonResponse(200, {
        nextDay: getNextDayKarachi(),
        brand,
        schedule,
        pillars,
        queue,
        history,
        bank,
        token,
        uploadPostHealth,
        samples,
        doctor: {
          activePublisher: 'uploadpost',
          nodeVersion: 'Cloudflare Pages Edge Runtime',
          hasGemini: Boolean(env.GEMINI_API_KEY),
          hasIgToken: Boolean(env.IG_ACCESS_TOKEN),
          hasUploadPost: Boolean(apiKey)
        }
      });
    }

    if (request.method === 'POST' && pathname === '/api/save-uploadpost-config') {
      const body = await request.json();
      if (body.apiKey && body.apiKey.trim()) {
        runtimeApiKey = body.apiKey.trim();
      }
      if (typeof body.user === 'string') {
        runtimeUser = body.user.trim();
      }
      const health = await checkUploadPostHealth(runtimeApiKey || env.UPLOADPOST_API_KEY, runtimeUser || env.UPLOADPOST_USER);
      if (health.ok && health.resolvedUser && !runtimeUser) {
        runtimeUser = health.resolvedUser;
      }
      return jsonResponse(200, { ok: true, health });
    }

    if (request.method === 'POST' && pathname === '/api/toggle-approve') {
      const body = await request.json();
      const queue = await getQueueState(context);
      const post = queue.find(p => p.id === body.postId);
      if (!post) return jsonResponse(404, { error: 'Post not found' });
      post.approved = !post.approved;
      memoryQueue = queue;
      await saveGithubQueueIfConfigured(env, queue);
      return jsonResponse(200, { ok: true, approved: post.approved });
    }

    if (request.method === 'POST' && pathname === '/api/set-status') {
      const body = await request.json();
      const queue = await getQueueState(context);
      const post = queue.find(p => p.id === body.postId);
      if (!post) return jsonResponse(404, { error: 'Post not found' });
      post.status = body.status;
      if (body.status === 'posted') {
        post.postedAt = new Date().toISOString();
        post.approved = true;
      } else if (body.status === 'rejected') {
        post.rejectedAt = new Date().toISOString();
        post.approved = false;
      }
      memoryQueue = queue;
      await saveGithubQueueIfConfigured(env, queue);
      return jsonResponse(200, { ok: true, post });
    }

    if (request.method === 'POST' && pathname === '/api/delete-post') {
      const body = await request.json();
      const queue = await getQueueState(context);
      const idx = queue.findIndex(p => p.id === body.postId);
      if (idx === -1) return jsonResponse(404, { error: 'Post not found' });
      queue.splice(idx, 1);
      memoryQueue = queue;
      await saveGithubQueueIfConfigured(env, queue);
      return jsonResponse(200, { ok: true });
    }

    if (request.method === 'POST' && pathname === '/api/publish-dry-run') {
      const body = await request.json();
      const queue = await getQueueState(context);
      const post = queue.find(p => p.id === body.postId);
      if (!post) return jsonResponse(404, { error: 'Post not found' });

      const user = upUser || 'haanhosting';
      const lines = [
        `=== UPLOAD-POST API DRY-RUN (${(post.format || 'single').toUpperCase()}) ===`,
        `POST https://api.upload-post.com/api/upload_photos`,
        `Headers:`,
        `  Authorization: Apikey ${apiKey ? '[CONFIGURED]' : '[MISSING - set UPLOADPOST_API_KEY]'}`,
        `  Idempotency-Key: ${post.id}`,
        `  Content-Type: multipart/form-data\n`,
        `Form Fields:`,
        `  user: "${user}"`,
        `  platform[]: "instagram"`
      ];
      if (post.altText) lines.push(`  instagram_alt_text: "${post.altText}"`);
      for (const imgPath of post.images || []) {
        lines.push(`  photos[]: @${imgPath} (1080×1350 JPEG binary)`);
      }
      lines.push(`\n  title (Instagram Caption):\n----------------------------------------\n${post.caption}\n----------------------------------------`);
      return jsonResponse(200, { ok: true, log: lines.join('\n') });
    }

    if (request.method === 'POST' && pathname === '/api/publish-live') {
      const body = await request.json();
      const queue = await getQueueState(context);
      const post = queue.find(p => p.id === body.postId);
      if (!post) return jsonResponse(404, { error: 'Post not found in queue' });
      if (post.status !== 'queued') {
        return jsonResponse(409, { error: `Post is '${post.status}', only queued posts can be published` });
      }
      if (!post.images?.length) {
        return jsonResponse(409, { error: 'Post has no rendered images yet; wait for the render workflow' });
      }

      if (!apiKey) {
        return jsonResponse(400, {
          error: 'UPLOADPOST_API_KEY is missing. Add UPLOADPOST_API_KEY in Cloudflare Pages Settings -> Environment Variables (or in the Doctor tab).'
        });
      }

      const health = await checkUploadPostHealth(apiKey, upUser);
      const targetUser = (health.ok && health.resolvedUser) ? health.resolvedUser : (upUser || 'haanhosting');

      const formData = new FormData();
      formData.append('user', targetUser);
      formData.append('platform[]', 'instagram');
      formData.append('title', post.caption);
      if (post.altText) {
        formData.append('instagram_alt_text', post.altText);
      }

      for (const imgRelPath of post.images || []) {
        const assetUrl = new URL('/' + imgRelPath.replace(/^\/+/, ''), request.url);
        const imgRes = await env.ASSETS.fetch(assetUrl.toString());
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          const filename = imgRelPath.split('/').pop() || 'slide.jpg';
          formData.append('photos[]', new Blob([await blob.arrayBuffer()], { type: 'image/jpeg' }), filename);
        } else {
          formData.append('photos[]', assetUrl.toString());
        }
      }

      const upRes = await fetch('https://api.upload-post.com/api/upload_photos', {
        method: 'POST',
        headers: {
          'Authorization': `Apikey ${apiKey}`,
          'Idempotency-Key': post.id,
          'X-Upload-Post-Source': 'haan-insta-agent-cf'
        },
        body: formData
      });

      if (!upRes.ok) {
        const errText = await upRes.text();
        return jsonResponse(400, { error: `Upload-Post HTTP ${upRes.status}: ${errText}` });
      }

      const upJson = await upRes.json();
      if (upJson.success === false) {
        return jsonResponse(400, { error: upJson.message || upJson.error || JSON.stringify(upJson) });
      }

      const resultId = upJson.request_id || upJson.job_id || upJson.id || `up-${Date.now()}`;
      post.status = 'posted';
      post.igMediaId = resultId;
      post.postedAt = new Date().toISOString();
      post.approved = true;
      memoryQueue = queue;
      await saveGithubQueueIfConfigured(env, queue);

      return jsonResponse(200, {
        ok: true,
        postId: post.id,
        result: {
          igMediaId: resultId,
          creationId: resultId,
          publishedAt: post.postedAt
        }
      });
    }

    if (request.method === 'POST' && pathname === '/api/generate') {
      const body = await request.json().catch(() => ({}));
      const targetDate = body.date || getNextDayKarachi();
      const [queue, bank, schedule] = await Promise.all([
        getQueueState(context),
        fetchAssetJson(context, '/content/bank/posts.json', []),
        fetchAssetJson(context, '/config/schedule.json', { slots: [] })
      ]);

      const existingIds = new Set(queue.map(p => p.id));
      const usedHeadlines = new Set(queue.map(p => (p.slides?.[0]?.headline || '').toLowerCase().trim()));
      const slots = (schedule.slots || []).slice(0, 5);

      let batchNum = 1;
      while (slots.some(s => existingIds.has(batchNum === 1 ? `${targetDate}-slot${s.id}` : `${targetDate}-slot${s.id}-b${batchNum}`))) {
        batchNum++;
      }

      const palettes = ['deep-violet', 'mint-fresh', 'coral-pop', 'navy-sky', 'ocean-blue', 'electric-indigo', 'berry-cream', 'sand-terracotta', 'slate-cyan', 'midnight-gold'];
      const newPosts = [];

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const postId = batchNum === 1 ? `${targetDate}-slot${slot.id}` : `${targetDate}-slot${slot.id}-b${batchNum}`;
        let candidates = bank.filter(b => b.format === slot.format && !usedHeadlines.has((b.slides?.[0]?.headline || '').toLowerCase().trim()));
        if (!candidates.length) candidates = bank.filter(b => b.format === slot.format);
        if (!candidates.length) candidates = bank;

        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        const headline = (chosen.slides?.[0]?.headline || '').toLowerCase().trim();
        usedHeadlines.add(headline);

        const templateId = chosen.template || (slot.format === 'carousel' ? 'T11-carousel' : 'T01-bold-statement');

        newPosts.push({
          id: postId,
          date: targetDate,
          slot: slot.id,
          scheduledAt: `${targetDate}T${slot.timePkt}:00+05:00`,
          status: 'queued',
          approved: true,
          pillar: chosen.pillar || slot.suggestedPillar,
          format: chosen.format || slot.format,
          template: templateId,
          design: {
            palette: palettes[(i + batchNum) % palettes.length],
            seed: Date.now() + i,
            decoration: 'none',
            layoutVariant: i % 3
          },
          slides: chosen.slides,
          caption: chosen.caption,
          hashtags: chosen.hashtags || ['#HaanHosting'],
          altText: chosen.altText || chosen.slides?.[0]?.headline || 'Haan Hosting post',
          // Left empty so the dispatched generate workflow renders this post's real images.
          images: [],
          imageUrls: [],
          igMediaId: null,
          attempts: 0,
          error: null
        });
      }

      queue.unshift(...newPosts);
      memoryQueue = queue;
      await saveGithubQueueIfConfigured(env, queue);

      // Also trigger GitHub Actions workflow if GH_PAT is configured for full Playwright rendering
      const pat = env.GH_PAT;
      const repo = env.GITHUB_REPOSITORY || 'haanhosting/haan_agent';
      if (pat) {
        // waitUntil keeps the worker alive until the dispatch request completes.
        context.waitUntil(fetch(`https://api.github.com/repos/${repo}/actions/workflows/generate.yml/dispatches`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pat}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'haan-insta-agent-cloudflare',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ref: 'main' })
        }).catch(() => {}));
      }

      return jsonResponse(200, { ok: true, count: newPosts.length, posts: newPosts.map(p => p.id) });
    }

    return jsonResponse(404, { error: `Unknown API route: ${pathname}` });
  } catch (err) {
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
}
