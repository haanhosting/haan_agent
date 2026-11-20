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

const AI_DEFAULTS = { enabled: true, postsPerDay: 1, times: ['11:00', '18:00'] };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function githubHeaders(pat) {
  return {
    'Authorization': `Bearer ${pat}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'haan-insta-agent-cloudflare',
    'Content-Type': 'application/json'
  };
}

async function githubGetJson(env, filePath) {
  const pat = env.GH_PAT;
  const repo = env.GITHUB_REPOSITORY || 'haanhosting/haan_agent';
  if (!pat) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, { headers: githubHeaders(pat) });
    if (!res.ok) return null;
    const data = await res.json();
    const bin = atob(data.content.replace(/\n/g, ''));
    const decoded = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    return { json: JSON.parse(decoded), sha: data.sha };
  } catch {
    return null;
  }
}

async function githubPutJson(env, filePath, obj, sha, message) {
  const pat = env.GH_PAT;
  const repo = env.GITHUB_REPOSITORY || 'haanhosting/haan_agent';
  if (!pat) return { ok: false, error: 'GH_PAT is not configured on Cloudflare' };
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2) + '\n')));
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: githubHeaders(pat),
    body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) })
  });
  if (!res.ok) return { ok: false, error: `GitHub write failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}` };
  return { ok: true };
}

async function loadAiConfigCf(context) {
  const fromGithub = await githubGetJson(context.env, 'config/providers.json');
  const providers = fromGithub ? fromGithub.json : await fetchAssetJson(context, '/config/providers.json', {});
  return { ...AI_DEFAULTS, ...((providers && providers.ai) || {}) };
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

// ---------------------------------------------------------------------------
// AI Studio reference posts (stored in the repo under content/ai-references/)
const REF_DIR = 'content/ai-references';
const REF_MAX = 24;

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Reads width/height from a JPEG's SOF marker (no image library on Workers). */
function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

async function githubContents(env, filePath, init = {}) {
  const repo = env.GITHUB_REPOSITORY || 'haanhosting/haan_agent';
  return fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, { ...init, headers: githubHeaders(env.GH_PAT) });
}

async function githubPutBinary(env, filePath, base64, message) {
  if (!env.GH_PAT) return { ok: false, error: 'GH_PAT is not configured on Cloudflare' };
  const res = await githubContents(env, filePath, { method: 'PUT', body: JSON.stringify({ message, content: base64 }) });
  if (!res.ok) return { ok: false, error: `GitHub upload failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}` };
  return { ok: true };
}

async function githubDeleteFile(env, filePath, message) {
  const meta = await githubContents(env, filePath);
  if (meta.status === 404) return { ok: true };
  if (!meta.ok) return { ok: false, error: `GitHub read failed (HTTP ${meta.status})` };
  const { sha } = await meta.json();
  const res = await githubContents(env, filePath, { method: 'DELETE', body: JSON.stringify({ message, sha }) });
  if (!res.ok) return { ok: false, error: `GitHub delete failed (HTTP ${res.status})` };
  return { ok: true };
}

async function loadRefsCf(context) {
  const fromGithub = await githubGetJson(context.env, `${REF_DIR}/refs.json`);
  if (fromGithub) return { refs: Array.isArray(fromGithub.json) ? fromGithub.json : [], sha: fromGithub.sha };
  return { refs: await fetchAssetJson(context, `/${REF_DIR}/refs.json`, []), sha: null };
}

async function refsHashCf(refs) {
  const key = refs.map(r => `${r.id}:${(r.caption || '').length}`).sort().join('|');
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

function newRefId() {
  return 'ref-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Adds one JPEG (bytes) to the repo and returns the new ref record (refs.json is written by the caller). */
async function addRefCf(env, bytes, meta) {
  const id = newRefId();
  const file = `${REF_DIR}/${id}.jpg`;
  const size = jpegSize(bytes) || { width: 1080, height: 1350 };
  const put = await githubPutBinary(env, file, bytesToBase64(bytes), `chore(ai-studio): add reference post ${id} [skip ci]`);
  if (!put.ok) throw new Error(put.error);
  return {
    id, file,
    caption: String(meta.caption || '').slice(0, 2200),
    source: meta.source || 'upload',
    ...(meta.igMediaId ? { igMediaId: meta.igMediaId, permalink: meta.permalink, likes: meta.likes, comments: meta.comments } : {}),
    width: size.width, height: size.height,
    addedAt: new Date().toISOString()
  };
}

function withImageUrl(r) {
  return { ...r, url: `/api/ai-reference-image?id=${encodeURIComponent(r.id)}` };
}

async function fetchIgMediaCf(env, limit = 50) {
  const token = env.IG_ACCESS_TOKEN;
  const userId = env.IG_USER_ID;
  if (!token || !userId) throw new Error('IG_ACCESS_TOKEN / IG_USER_ID are not set in Cloudflare. Use "Upload images", or import from the local dashboard.');
  const base = token.startsWith('EAA') ? 'https://graph.facebook.com' : 'https://graph.instagram.com';
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp';
  const res = await fetch(`${base}/v22.0/${userId}/media?fields=${fields}&limit=${Math.min(limit, 100)}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Instagram media list failed: ${json?.error?.message || res.status}`);
  return (json.data || [])
    .map(m => ({
      id: m.id, caption: m.caption || '', mediaType: m.media_type,
      imageUrl: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
      permalink: m.permalink, likes: m.like_count ?? 0, comments: m.comments_count ?? 0, timestamp: m.timestamp
    }))
    .filter(m => !!m.imageUrl)
    .sort((a, b) => (b.likes + 3 * b.comments) - (a.likes + 3 * a.comments));
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    if (request.method === 'GET' && pathname === '/api/state') {
      const [brand, schedule, pillars, queue, history, bank, samples, token, instagramHealth, ai] = await Promise.all([
        fetchAssetJson(context, '/config/brand.json', {}),
        fetchAssetJson(context, '/config/schedule.json', {}),
        fetchAssetJson(context, '/content/pillars.json', {}),
        getQueueState(context),
        memoryHistory ? Promise.resolve(memoryHistory) : fetchAssetJson(context, '/state/history.json', []),
        fetchAssetJson(context, '/content/bank/posts.json', []),
        fetchAssetJson(context, '/state/samples.json', []),
        fetchAssetJson(context, '/state/token.json', { status: 'uninitialized', lastRefreshed: null, daysLeft: null }),
        checkInstagramHealth(env),
        loadAiConfigCf(context)
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
        ai,
        doctor: {
          activePublisher: 'instagramGraph (GitHub Actions)',
          nodeVersion: 'Cloudflare Pages Edge Runtime',
          hasGemini: Boolean(env.GEMINI_API_KEY),
          // The OpenAI key lives in GitHub Actions secrets, not Cloudflare, so it can't be checked here.
          hasOpenAI: env.OPENAI_API_KEY ? true : null,
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

    if (request.method === 'POST' && pathname === '/api/publish-story') {
      const body = await request.json();
      const queue = await getQueueState(context);
      const post = queue.find(p => p.id === body.postId);
      if (!post) return jsonResponse(404, { error: 'Post not found in queue' });
      if (!post.images?.length) {
        return jsonResponse(409, { error: 'Post has no rendered images yet; wait for the render workflow' });
      }
      const dispatched = await dispatchWorkflow(env, 'publish.yml', { post_id: post.id, as_story: 'true' });
      if (!dispatched.ok) return jsonResponse(502, { error: dispatched.error });
      return jsonResponse(202, {
        ok: true,
        queued: true,
        postId: post.id,
        message: 'Story workflow started on GitHub Actions. It should appear in your Instagram Story within ~2 minutes.'
      });
    }

    if (request.method === 'GET' && pathname === '/api/ai-references') {
      const [{ refs }, profileGh] = await Promise.all([loadRefsCf(context), githubGetJson(env, `${REF_DIR}/style-profile.json`)]);
      const profile = profileGh ? profileGh.json : await fetchAssetJson(context, `/${REF_DIR}/style-profile.json`, null);
      const hash = await refsHashCf(refs);
      return jsonResponse(200, { refs: refs.map(withImageUrl), profile, profileFresh: Boolean(profile && profile.refsHash === hash) });
    }

    if (request.method === 'GET' && pathname === '/api/ai-reference-image') {
      const id = url.searchParams.get('id') || '';
      if (!/^ref-[a-z0-9]+$/.test(id)) return jsonResponse(400, { error: 'bad id' });
      if (env.GH_PAT) {
        const repo = env.GITHUB_REPOSITORY || 'haanhosting/haan_agent';
        const res = await fetch(`https://api.github.com/repos/${repo}/contents/${REF_DIR}/${id}.jpg`, {
          headers: { ...githubHeaders(env.GH_PAT), Accept: 'application/vnd.github.raw' }
        });
        if (res.ok) return new Response(res.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
      }
      return env.ASSETS.fetch(new URL(`/${REF_DIR}/${id}.jpg`, request.url).toString());
    }

    if (request.method === 'POST' && pathname === '/api/ai-references') {
      const body = await request.json().catch(() => ({}));
      const m = /^data:image\/jpe?g;base64,(.+)$/.exec(String(body.dataUrl || ''));
      if (!m) return jsonResponse(400, { error: 'Expected a JPEG data URL' });
      const { refs, sha } = await loadRefsCf(context);
      if (refs.length >= REF_MAX) return jsonResponse(400, { error: `Maximum ${REF_MAX} reference posts. Remove some first.` });
      const ref = await addRefCf(env, base64ToBytes(m[1]), { caption: body.caption, source: 'upload' });
      const saved = await githubPutJson(env, `${REF_DIR}/refs.json`, [...refs, ref], sha, 'chore(ai-studio): update reference posts [skip ci]');
      if (!saved.ok) return jsonResponse(502, { error: saved.error });
      return jsonResponse(200, { ok: true, ref: withImageUrl(ref) });
    }

    if (request.method === 'POST' && pathname === '/api/ai-references/delete') {
      const body = await request.json().catch(() => ({}));
      const { refs, sha } = await loadRefsCf(context);
      const ref = refs.find(r => r.id === body.id);
      if (!ref) return jsonResponse(404, { error: 'Reference not found' });
      const saved = await githubPutJson(env, `${REF_DIR}/refs.json`, refs.filter(r => r.id !== body.id), sha, 'chore(ai-studio): remove reference post [skip ci]');
      if (!saved.ok) return jsonResponse(502, { error: saved.error });
      await githubDeleteFile(env, ref.file, `chore(ai-studio): delete ${ref.id} [skip ci]`);
      return jsonResponse(200, { ok: true });
    }

    if (request.method === 'POST' && pathname === '/api/ai-references/caption') {
      const body = await request.json().catch(() => ({}));
      const { refs, sha } = await loadRefsCf(context);
      const ref = refs.find(r => r.id === body.id);
      if (!ref) return jsonResponse(404, { error: 'Reference not found' });
      ref.caption = String(body.caption || '').slice(0, 2200);
      const saved = await githubPutJson(env, `${REF_DIR}/refs.json`, refs, sha, 'chore(ai-studio): update reference caption [skip ci]');
      if (!saved.ok) return jsonResponse(502, { error: saved.error });
      return jsonResponse(200, { ok: true });
    }

    if (request.method === 'GET' && pathname === '/api/ig-media') {
      try {
        return jsonResponse(200, { items: await fetchIgMediaCf(env, 50) });
      } catch (err) {
        return jsonResponse(400, { error: err.message });
      }
    }

    if (request.method === 'POST' && pathname === '/api/ai-references/import') {
      const body = await request.json().catch(() => ({}));
      const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, REF_MAX) : [];
      if (!ids.length) return jsonResponse(400, { error: 'No posts selected' });
      let all;
      try { all = await fetchIgMediaCf(env, 100); } catch (err) { return jsonResponse(400, { error: err.message }); }
      const { refs, sha } = await loadRefsCf(context);
      const added = [];
      const errors = [];
      for (const id of ids) {
        if (refs.length + added.length >= REF_MAX) { errors.push(`${id}: reference limit (${REF_MAX}) reached`); continue; }
        if (refs.some(r => r.igMediaId === id)) { errors.push(`${id}: already added`); continue; }
        const item = all.find(x => x.id === id);
        if (!item) { errors.push(`${id}: not found in recent media`); continue; }
        try {
          const res = await fetch(item.imageUrl);
          if (!res.ok) throw new Error(`download HTTP ${res.status}`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          added.push(await addRefCf(env, bytes, {
            caption: item.caption, source: 'instagram', igMediaId: item.id,
            permalink: item.permalink, likes: item.likes, comments: item.comments
          }));
        } catch (err) {
          errors.push(`${id}: ${err.message}`);
        }
      }
      if (added.length) {
        const saved = await githubPutJson(env, `${REF_DIR}/refs.json`, [...refs, ...added], sha, 'chore(ai-studio): import reference posts from Instagram [skip ci]');
        if (!saved.ok) return jsonResponse(502, { error: saved.error });
      }
      return jsonResponse(200, { ok: true, added: added.length, errors });
    }

    if (request.method === 'POST' && pathname === '/api/ai-references/analyze') {
      return jsonResponse(400, {
        error: 'Style analysis runs automatically in the daily GitHub Actions job (your OpenAI key lives there, not in Cloudflare). Click "Generate now" and it will study your reference posts first.'
      });
    }

    if (request.method === 'POST' && pathname === '/api/ai-config') {
      const body = await request.json().catch(() => ({}));
      const postsPerDay = parseInt(body.postsPerDay, 10);
      const times = Array.isArray(body.times) ? body.times.map(t => String(t).trim()) : [];
      if (!(postsPerDay >= 1 && postsPerDay <= 4)) return jsonResponse(400, { error: 'postsPerDay must be 1-4' });
      if (times.length < postsPerDay || !times.every(t => TIME_RE.test(t))) {
        return jsonResponse(400, { error: `Provide ${postsPerDay} valid HH:MM time(s)` });
      }
      const current = await githubGetJson(env, 'config/providers.json');
      if (!current) return jsonResponse(502, { error: 'Could not read config/providers.json from GitHub (is GH_PAT set?)' });
      const providers = current.json;
      const extra = {};
      if (typeof body.useReferences === 'boolean') extra.useReferences = body.useReferences;
      if (['low', 'medium', 'high'].includes(body.referenceQuality)) extra.referenceQuality = body.referenceQuality;
      providers.ai = { ...AI_DEFAULTS, ...(providers.ai || {}), postsPerDay, times: times.slice(0, postsPerDay), ...extra };
      const saved = await githubPutJson(env, 'config/providers.json', providers, current.sha, 'chore(dashboard): update AI Studio schedule [skip ci]');
      if (!saved.ok) return jsonResponse(502, { error: saved.error });
      return jsonResponse(200, { ok: true, ai: providers.ai });
    }

    if (request.method === 'POST' && pathname === '/api/ai-generate') {
      const body = await request.json().catch(() => ({}));
      const count = String(Math.max(1, Math.min(parseInt(body.count, 10) || 1, 4)));
      const inputs = { count, date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : '' };
      const dispatched = await dispatchWorkflow(env, 'ai-generate.yml', inputs);
      if (!dispatched.ok) return jsonResponse(502, { error: dispatched.error });
      return jsonResponse(202, {
        ok: true,
        queued: true,
        message: `AI Studio workflow started on GitHub Actions (${count} post${count === '1' ? '' : 's'}). New posts appear in the queue in ~3-4 minutes; refresh to see them.`
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
