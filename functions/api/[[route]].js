// Cloudflare Pages Function handling all /api/* routes for HAAN HOSTING Instagram Agent

let memoryQueue = null;
let memoryHistory = null;

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

async function checkInstagramHealth(env) {
  // Publishing runs in GitHub Actions, where IG_ACCESS_TOKEN lives as a secret.
  // If the token is also set in Cloudflare, verify it live; otherwise report that.
  const token = env.IG_ACCESS_TOKEN;
  const userId = env.IG_USER_ID;
  if (!token || !userId) {
    return { ok: false, error: 'Publishing runs in GitHub Actions (IG token is a GitHub secret, not set in Cloudflare)' };
  }
  const base = token.startsWith('EAA') ? 'https://graph.facebook.com' : 'https://graph.instagram.com';
  try {
    const res = await fetch(`${base}/v22.0/${userId}?fields=id,username`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
    return { ok: true, username: json.username };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function dispatchWorkflow(env, workflowFile, inputs) {
  const pat = env.GH_PAT;
  const repo = env.GITHUB_REPOSITORY || 'haanhosting/haan_agent';
  if (!pat) return { ok: false, error: 'GH_PAT is not set in Cloudflare environment variables' };
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'haan-insta-agent-cloudflare',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ref: 'main', ...(inputs ? { inputs } : {}) })
  });
  if (res.status !== 204) {
    return { ok: false, error: `GitHub dispatch HTTP ${res.status}: ${await res.text()}` };
  }
  return { ok: true };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    if (request.method === 'GET' && pathname === '/api/state') {
      const [brand, schedule, pillars, queue, history, bank, samples, token, instagramHealth] = await Promise.all([
        fetchAssetJson(context, '/config/brand.json', {}),
        fetchAssetJson(context, '/config/schedule.json', {}),
        fetchAssetJson(context, '/content/pillars.json', {}),
        getQueueState(context),
        memoryHistory ? Promise.resolve(memoryHistory) : fetchAssetJson(context, '/state/history.json', []),
        fetchAssetJson(context, '/content/bank/posts.json', []),
        fetchAssetJson(context, '/state/samples.json', []),
        fetchAssetJson(context, '/state/token.json', { status: 'uninitialized', lastRefreshed: null, daysLeft: null }),
        checkInstagramHealth(env)
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
        instagramHealth,
        samples,
        doctor: {
          activePublisher: 'instagramGraph (GitHub Actions)',
          nodeVersion: 'Cloudflare Pages Edge Runtime',
          hasGemini: Boolean(env.GEMINI_API_KEY),
          hasIgToken: Boolean(env.IG_ACCESS_TOKEN)
        }
      });
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

      const base = (env.PAGES_BASE_URL || new URL(request.url).origin).replace(/\/+$/, '');
      const urls = (post.images || []).map(i => `${base}/${i.replace(/^\/+/, '')}`);
      const isCarousel = post.format === 'carousel' || urls.length > 1;
      const lines = [
        `=== INSTAGRAM GRAPH API DRY-RUN (${isCarousel ? 'CAROUSEL' : 'SINGLE'}) ===`,
        `Runs in GitHub Actions: publish.yml (post_id=${post.id})`,
        ''
      ];
      if (isCarousel) {
        urls.forEach((u, i) => lines.push(`POST /{IG_USER_ID}/media  image_url=${u}  is_carousel_item=true  (slide ${i + 1})`));
        lines.push(`POST /{IG_USER_ID}/media  media_type=CAROUSEL  children=<${urls.length} ids>`);
      } else {
        lines.push(`POST /{IG_USER_ID}/media  image_url=${urls[0] || '(no image rendered yet)'}`);
      }
      lines.push(`POST /{IG_USER_ID}/media_publish  creation_id=<container id>`);
      lines.push(`\nCaption:\n----------------------------------------\n${post.caption}\n----------------------------------------`);
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

      // Publishing happens in GitHub Actions so the Instagram token never leaves GitHub secrets.
      const dispatched = await dispatchWorkflow(env, 'publish.yml', { post_id: post.id });
      if (!dispatched.ok) return jsonResponse(502, { error: dispatched.error });

      return jsonResponse(202, {
        ok: true,
        queued: true,
        postId: post.id,
        message: 'Publish workflow started on GitHub Actions. The post should appear on Instagram within ~2 minutes; refresh to see its status.'
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

      // Rendering needs Playwright, which only runs in GitHub Actions; dispatch it and surface failures.
      const dispatched = await dispatchWorkflow(env, 'generate.yml');

      return jsonResponse(200, {
        ok: true,
        count: newPosts.length,
        posts: newPosts.map(p => p.id),
        renderDispatched: dispatched.ok,
        ...(dispatched.ok ? {} : { renderError: dispatched.error })
      });
    }

    return jsonResponse(404, { error: `Unknown API route: ${pathname}` });
  } catch (err) {
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
}
