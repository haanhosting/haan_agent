import http from 'http';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

import { loadQueue, saveQueue, loadHistory, enqueuePosts, updatePostStatus } from './state/stateManager.js';
import { generateDailyPosts, loadScheduleConfig, loadPillarsConfig } from './content/slotMapper.js';
import { loadContentBank } from './content/bank.js';
import { renderSlide, closeBrowser } from './render/renderer.js';
import { generatePreviews, SAMPLE_POSTS } from './render/preview.js';
import { getPublicMediaUrl } from './publish/mediaHost.js';
import { publishPost, getActivePublisherType } from './publish/publisher.js';
import { checkUploadPostConnection } from './publish/uploadPost.js';
import { loadTokenState } from './publish/tokenRefresh.js';
import { getNextDayKarachi } from './schedule/scheduler.js';

const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

function serveStaticFile(res: http.ServerResponse, filePath: string): void {
  const resolved = path.resolve(process.cwd(), filePath);
  const root = path.resolve(process.cwd());
  if (!resolved.startsWith(root) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
  fs.createReadStream(resolved).pipe(res);
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: any): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function upsertEnvFile(updates: Record<string, string>): void {
  const envPath = path.resolve(process.cwd(), '.env');
  const examplePath = path.resolve(process.cwd(), '.env.example');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  } else if (fs.existsSync(examplePath)) {
    content = fs.readFileSync(examplePath, 'utf8');
  }

  for (const [key, val] of Object.entries(updates)) {
    process.env[key] = val;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${val}`);
    } else {
      content = content.trimEnd() + `\n${key}=${val}\n`;
    }
  }
  fs.writeFileSync(envPath, content, 'utf8');
}

function buildDryRunLog(post: any): string {
  const activePublisher = getActivePublisherType();
  const urls = post.imageUrls?.length ? post.imageUrls : post.images.map((i: string) => getPublicMediaUrl(i));

  if (activePublisher === 'uploadpost') {
    const user = process.env.UPLOADPOST_USER || 'haanhosting';
    const lines: string[] = [];
    lines.push(`=== UPLOAD-POST API DRY-RUN (${post.format.toUpperCase()}) ===`);
    lines.push(`POST https://api.upload-post.com/api/upload_photos`);
    lines.push(`Headers:`);
    lines.push(`  Authorization: Apikey ${process.env.UPLOADPOST_API_KEY ? '[CONFIGURED]' : '[MISSING - set UPLOADPOST_API_KEY]'}`);
    lines.push(`  Idempotency-Key: ${post.id}`);
    lines.push(`  Content-Type: multipart/form-data\n`);
    lines.push(`Form Fields:`);
    lines.push(`  user: "${user}"`);
    lines.push(`  platform[]: "instagram"`);
    if (post.altText) {
      lines.push(`  instagram_alt_text: "${post.altText}"`);
    }
    for (const imgPath of post.images || []) {
      lines.push(`  photos[]: @${imgPath} (local 1080×1350 JPEG binary)`);
    }
    lines.push(`\n  title (Instagram Caption):`);
    lines.push(`----------------------------------------`);
    lines.push(post.caption);
    lines.push(`----------------------------------------`);
    return lines.join('\n');
  }

  const apiVersion = 'v22.0';
  const baseUrl = 'https://graph.instagram.com';
  const userId = process.env.IG_USER_ID || 'IG_USER_ID';

  const lines: string[] = [];
  lines.push(`GET ${baseUrl}/${apiVersion}/${userId}/content_publishing_limit?fields=config,quota_usage`);
  lines.push(`Authorization: Bearer [REDACTED]\n`);

  if (post.format === 'carousel' || urls.length > 1) {
    lines.push(`--- Step 1: Create ${urls.length} Carousel Item Containers ---`);
    urls.forEach((u: string, i: number) => {
      lines.push(`POST ${baseUrl}/${apiVersion}/${userId}/media`);
      lines.push(JSON.stringify({ image_url: u, is_carousel_item: true }, null, 2));
    });
    lines.push(`\n--- Step 2: Create Carousel Parent Container ---`);
    lines.push(`POST ${baseUrl}/${apiVersion}/${userId}/media`);
    lines.push(
      JSON.stringify(
        {
          media_type: 'CAROUSEL',
          children: urls.map((_: string, i: number) => `creation_child_${i + 1}`).join(','),
          caption: post.caption
        },
        null,
        2
      )
    );
    lines.push(`\n--- Step 3: Poll Container Status & Publish ---`);
    lines.push(`GET ${baseUrl}/${apiVersion}/creation_carousel_999?fields=status_code (→ FINISHED)`);
    lines.push(`POST ${baseUrl}/${apiVersion}/${userId}/media_publish`);
    lines.push(JSON.stringify({ creation_id: 'creation_carousel_999' }, null, 2));
  } else {
    lines.push(`--- Step 1: Create Single Image Container ---`);
    lines.push(`POST ${baseUrl}/${apiVersion}/${userId}/media`);
    lines.push(
      JSON.stringify(
        {
          image_url: urls[0],
          caption: post.caption,
          alt_text: post.altText
        },
        null,
        2
      )
    );
    lines.push(`\n--- Step 2: Poll Container Status & Publish ---`);
    lines.push(`GET ${baseUrl}/${apiVersion}/creation_single_123?fields=status_code (→ FINISHED)`);
    lines.push(`POST ${baseUrl}/${apiVersion}/${userId}/media_publish`);
    lines.push(JSON.stringify({ creation_id: 'creation_single_123' }, null, 2));
  }
  return lines.join('\n');
}

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HAAN HOSTING · Instagram Auto-Poster Dashboard</title>
  <link rel="icon" type="image/png" href="/logo/logo.png" />
  <style>
    :root {
      --bg: #070d1d;
      --surface: #0f172a;
      --surface-2: #1e293b;
      --border: rgba(255, 255, 255, 0.1);
      --primary: #2563eb;
      --emerald: #00bb7f;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
    }
    header {
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 20px 36px;
      position: sticky;
      top: 0;
      z-index: 50;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(56, 189, 248, 0.65);
      box-shadow: 0 0 22px rgba(56, 189, 248, 0.35);
    }
    .brand h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .brand h1 span { color: var(--primary); }
    .brand p {
      margin: 2px 0 0 0;
      font-size: 13px;
      color: var(--muted);
    }
    .nav-tabs {
      display: flex;
      gap: 8px;
      background: #050914;
      padding: 6px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    .tab-btn {
      background: transparent;
      color: var(--muted);
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .tab-btn.active {
      background: var(--primary);
      color: #fff;
    }
    .tab-btn:hover:not(.active) {
      color: #fff;
      background: rgba(255,255,255,0.05);
    }
    main {
      max-width: 1440px;
      margin: 0 auto;
      padding: 32px 36px 80px;
    }
    .stats-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px 22px;
    }
    .stat-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
    .stat-value { font-size: 28px; font-weight: 800; margin-top: 6px; color: #fff; }
    .stat-sub { font-size: 12px; color: var(--emerald); margin-top: 4px; }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
      background: var(--surface);
      padding: 16px 22px;
      border-radius: 14px;
      border: 1px solid var(--border);
    }
    .btn {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 10px 18px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.9; }
    .btn:disabled { opacity: 0.5; cursor: wait; }
    .btn-secondary {
      background: var(--surface-2);
      border: 1px solid var(--border);
    }
    .btn-emerald { background: var(--emerald); color: #041d14; }
    .btn-danger {
      background: rgba(239, 68, 68, 0.16);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.35);
    }
    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.28);
    }
    .badge-danger {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }
    .post-card.card-published {
      border-color: rgba(0, 187, 127, 0.45);
    }
    .post-card.card-rejected {
      border-color: rgba(239, 68, 68, 0.4);
      opacity: 0.92;
    }
    .section-divider {
      margin: 36px 0 18px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    input[type="date"], select, input[type="text"] {
      background: #050914;
      color: #fff;
      border: 1px solid var(--border);
      padding: 9px 14px;
      border-radius: 8px;
      font-size: 14px;
    }
    .grid-posts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 28px;
    }
    .post-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .post-top {
      padding: 14px 18px;
      background: rgba(0, 0, 0, 0.25);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }
    .badge {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      background: rgba(37, 99, 235, 0.2);
      color: #60a5fa;
    }
    .badge-emerald {
      background: rgba(0, 187, 127, 0.18);
      color: #34d399;
    }
    .slide-viewer {
      position: relative;
      background: #000;
      aspect-ratio: 4 / 5;
      width: 100%;
      overflow: hidden;
    }
    .slide-viewer img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .carousel-nav {
      position: absolute;
      bottom: 12px;
      right: 12px;
      display: flex;
      gap: 6px;
      background: rgba(0,0,0,0.75);
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .carousel-nav button {
      background: var(--primary);
      border: none;
      color: #fff;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      cursor: pointer;
      font-weight: 800;
    }
    .post-body {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
    }
    .meta-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 12px;
      color: var(--muted);
    }
    .caption-box {
      background: #050914;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      font-size: 13px;
      white-space: pre-wrap;
      max-height: 150px;
      overflow-y: auto;
      color: #cbd5e1;
    }
    .post-actions {
      padding: 14px 18px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }
    .section { display: none; }
    .section.active { display: block; }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 24px;
    }
    .modal-backdrop.open { display: flex; }
    .modal {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      max-width: 820px;
      width: 100%;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .modal-header {
      padding: 18px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-body {
      padding: 24px;
      overflow-y: auto;
      font-family: 'Space Grotesk', monospace;
      font-size: 13px;
      background: #050811;
      color: #a7f3d0;
      white-space: pre-wrap;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    th, td {
      padding: 14px 18px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    th { background: rgba(0,0,0,0.3); color: var(--muted); font-size: 12px; text-transform: uppercase; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <img src="/logo/logo.png" alt="HAAN HOSTING" class="brand-icon" />
      <div>
        <h1>HAAN <span>HOSTING</span> · Auto-Poster Agent</h1>
        <p>Official Brand Crest · 18 Templates with Low-Opacity BG &amp; Overlay · Upload-Post API</p>
      </div>
    </div>
    <div class="nav-tabs">
      <button class="tab-btn active" onclick="switchTab('queue')">📅 Pending Queue (<span id="tab-queue-count">0</span>)</button>
      <button class="tab-btn" onclick="switchTab('published')">✅ Published (<span id="tab-published-count">0</span>)</button>
      <button class="tab-btn" onclick="switchTab('rejected')">🚫 Rejected (<span id="tab-rejected-count">0</span>)</button>
      <button class="tab-btn" onclick="switchTab('templates')">🎨 18 Templates</button>
      <button class="tab-btn" onclick="switchTab('bank')">📚 Content Bank (<span id="tab-bank-count">72</span>)</button>
      <button class="tab-btn" onclick="switchTab('doctor')">🩺 Doctor & Brand</button>
    </div>
  </header>

  <main>
    <div class="stats-bar" id="stats-bar"></div>

    <!-- TAB 1: PENDING QUEUE -->
    <section id="sec-queue" class="section active">
      <div class="toolbar">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <strong>Generate & Render Posts for Date:</strong>
          <input type="date" id="gen-date" />
          <button class="btn" id="btn-generate" onclick="triggerGenerate()">⚡ Generate & Render 5 Posts</button>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <span style="font-size:13px; color:var(--muted);">Uploaded & rejected posts are automatically moved to their tabs.</span>
          <button class="btn btn-secondary" onclick="loadState()">↻ Refresh</button>
        </div>
      </div>
      <div class="grid-posts" id="queue-grid"></div>
    </section>

    <!-- TAB 2: PUBLISHED POSTS -->
    <section id="sec-published" class="section">
      <div class="toolbar">
        <div>
          <strong>✅ Uploaded Instagram Posts</strong>
          <span style="color:var(--muted); font-size:13px; margin-left:10px;">Posts successfully published via Upload-Post API</span>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary" onclick="switchTab('rejected')">🚫 View Rejected Posts</button>
          <button class="btn btn-secondary" onclick="loadState()">↻ Refresh</button>
        </div>
      </div>
      <div class="grid-posts" id="published-grid"></div>

      <div class="section-divider">
        <div>
          <strong style="font-size:18px;">🚫 Rejected & Failed Posts (<span id="sub-rejected-count">0</span>)</strong>
          <span style="color:var(--muted); font-size:13px; margin-left:10px;">Posts removed from the active queue</span>
        </div>
      </div>
      <div class="grid-posts" id="published-rejected-subgrid"></div>
    </section>

    <!-- TAB 3: REJECTED POSTS -->
    <section id="sec-rejected" class="section">
      <div class="toolbar">
        <div>
          <strong>🚫 Rejected & Failed Posts</strong>
          <span style="color:var(--muted); font-size:13px; margin-left:10px;">Removed from the main queue — restore anytime or delete permanently</span>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary" onclick="switchTab('published')">✅ View Published Posts</button>
          <button class="btn btn-secondary" onclick="loadState()">↻ Refresh</button>
        </div>
      </div>
      <div class="grid-posts" id="rejected-grid"></div>
    </section>

    <!-- TAB 4: TEMPLATES -->
    <section id="sec-templates" class="section">
      <div class="toolbar">
        <div>
          <strong>18 Branded HTML/CSS Launch Templates (T01–T18)</strong>
          <span style="color:var(--muted); font-size:13px; margin-left:10px;">Includes Official Logo Crest, Low-Opacity Tech Backgrounds &amp; Glass Overlays</span>
        </div>
        <div style="display:flex; gap:10px;">
          <a href="/preview/contact-sheet.jpg" target="_blank" class="btn btn-secondary">🖼️ Open Contact Sheet</a>
          <a href="/preview/index.html" target="_blank" class="btn">↗ Raw Preview Gallery</a>
        </div>
      </div>
      <div class="grid-posts" id="templates-grid"></div>
    </section>

    <!-- TAB 3: CONTENT BANK -->
    <section id="sec-bank" class="section">
      <div class="toolbar">
        <div>
          <strong>Offline Fallback Content Bank</strong>
          <span style="color:var(--muted); font-size:13px; margin-left:10px;">Guaranteed zero-downtime fallback when LLM free tiers rate-limit</span>
        </div>
        <div>
          <select id="bank-pillar-filter" onchange="renderBankTable()">
            <option value="all">All Pillars</option>
            <option value="tips">Tips & How-To</option>
            <option value="educational">Educational / Myth vs Fact</option>
            <option value="growth">Business Growth</option>
            <option value="offers">Verified Offers</option>
            <option value="engagement">Engagement / Polls</option>
            <option value="trust">Trust & Support</option>
            <option value="quotes">Motivation / Quotes</option>
          </select>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Pillar</th>
            <th>Format</th>
            <th>Template</th>
            <th>Headline</th>
            <th>Hashtags</th>
          </tr>
        </thead>
        <tbody id="bank-tbody"></tbody>
      </table>
    </section>

    <!-- TAB 4: DOCTOR & BRAND -->
    <section id="sec-doctor" class="section">
      <div class="grid-posts" id="doctor-grid"></div>
    </section>
  </main>

  <div class="modal-backdrop" id="dryrun-modal" onclick="if(event.target===this) closeModal()">
    <div class="modal">
      <div class="modal-header">
        <strong id="modal-title">Instagram Graph API Dry-Run Payload</strong>
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      </div>
      <div class="modal-body" id="modal-content"></div>
    </div>
  </div>

  <script>
    let appState = null;
    const slideIndices = {};

    function switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      const map = { queue: 0, published: 1, rejected: 2, templates: 3, bank: 4, doctor: 5 };
      if (map[tab] !== undefined) {
        document.querySelectorAll('.tab-btn')[map[tab]].classList.add('active');
      }
      document.getElementById('sec-' + tab).classList.add('active');
    }

    function getPendingPosts() {
      return (appState.queue || []).filter(p => p.status === 'queued' || p.status === 'publishing');
    }

    function getPublishedPosts() {
      return (appState.queue || []).filter(p => p.status === 'posted');
    }

    function getRejectedPosts() {
      return (appState.queue || []).filter(p => p.status === 'rejected' || p.status === 'failed' || p.status === 'skipped');
    }

    async function loadState() {
      const res = await fetch('/api/state');
      appState = await res.json();

      const pending = getPendingPosts();
      const published = getPublishedPosts();
      const rejected = getRejectedPosts();

      document.getElementById('gen-date').value = appState.nextDay;
      document.getElementById('tab-queue-count').textContent = pending.length;
      document.getElementById('tab-published-count').textContent = published.length;
      document.getElementById('tab-rejected-count').textContent = rejected.length;
      document.getElementById('sub-rejected-count').textContent = rejected.length;
      document.getElementById('tab-bank-count').textContent = appState.bank.length;

      // Render stats
      document.getElementById('stats-bar').innerHTML = \`
        <div class="stat-card" style="cursor:pointer;" onclick="switchTab('queue')">
          <div class="stat-label">Pending Queue</div>
          <div class="stat-value">\${pending.length}</div>
          <div class="stat-sub">Ready to review & upload</div>
        </div>
        <div class="stat-card" style="cursor:pointer;" onclick="switchTab('published')">
          <div class="stat-label">Uploaded to IG</div>
          <div class="stat-value" style="color:#34d399;">\${published.length}</div>
          <div class="stat-sub">✅ Published via Upload-Post</div>
        </div>
        <div class="stat-card" style="cursor:pointer;" onclick="switchTab('rejected')">
          <div class="stat-label">Rejected / Failed</div>
          <div class="stat-value" style="color:\${rejected.length ? '#f87171' : '#fff'};">\${rejected.length}</div>
          <div class="stat-sub">Hidden from active queue</div>
        </div>
        <div class="stat-card" style="cursor:pointer;" onclick="switchTab('doctor')">
          <div class="stat-label">Active Publisher</div>
          <div class="stat-value" style="font-size:22px;">Upload-Post API</div>
          <div class="stat-sub">\${appState.doctor.hasUploadPost ? '✅ API Key Connected' : '⚠️ Set UPLOADPOST_API_KEY in Doctor tab'}</div>
        </div>
      \`;

      renderQueue();
      renderPublished();
      renderRejected();
      renderTemplates();
      renderBankTable();
      renderDoctor();
    }

    function buildPostSlideViewer(post, idPrefix = '') {
      const imgs = post.images || [];
      const firstImg = imgs[0] ? '/' + imgs[0] : '';
      const isCarousel = imgs.length > 1;
      const domId = idPrefix + post.id;
      return \`
        <div class="slide-viewer">
          \${firstImg ? \`<a href="\${firstImg}" target="_blank"><img id="img-\${domId}" src="\${firstImg}" alt="\${post.altText}" /></a>\` : '<div style="padding:40px;text-align:center;">Not rendered</div>'}
          \${isCarousel ? \`
            <div class="carousel-nav">
              <button onclick="changeSlide('\${post.id}', -1, \${imgs.length}, '\${idPrefix}')">‹</button>
              <span id="cnt-\${domId}">1 / \${imgs.length}</span>
              <button onclick="changeSlide('\${post.id}', 1, \${imgs.length}, '\${idPrefix}')">›</button>
            </div>
          \` : ''}
        </div>
      \`;
    }

    function changeSlide(postId, delta, total, idPrefix = '') {
      const key = idPrefix + postId;
      const curr = slideIndices[key] || 0;
      const next = (curr + delta + total) % total;
      slideIndices[key] = next;
      const post = appState.queue.find(p => p.id === postId);
      if (!post) return;
      const imgEl = document.getElementById('img-' + key);
      const countEl = document.getElementById('cnt-' + key);
      if (imgEl) imgEl.src = '/' + post.images[next] + '?t=' + Date.now();
      if (countEl) countEl.textContent = (next + 1) + ' / ' + total;
    }

    function renderQueue() {
      const container = document.getElementById('queue-grid');
      const pending = getPendingPosts();
      if (!pending.length) {
        container.innerHTML = '<div class="post-card" style="padding:32px; grid-column: 1 / -1; text-align:center;"><p style="color:var(--muted); margin:0;">🎉 No pending posts in queue! Uploaded posts are in the <strong>✅ Published</strong> tab, or click <strong>"⚡ Generate & Render 5 Posts"</strong> above.</p></div>';
        return;
      }

      container.innerHTML = pending.map(post => {
        return \`
          <div class="post-card">
            <div class="post-top">
              <strong>\${post.id}</strong>
              <span class="badge \${post.format === 'carousel' ? 'badge-emerald' : ''}">\${post.pillar} · \${post.format}</span>
            </div>
            \${buildPostSlideViewer(post, 'q-')}
            <div class="post-body">
              <div class="meta-row">
                <span>🕒 <strong>\${post.scheduledAt}</strong></span>
                <span>🎨 \${post.template} (\${post.design.palette})</span>
              </div>
              <div class="caption-box">\${post.caption}</div>
            </div>
            <div class="post-actions" style="flex-wrap:wrap;">
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" onclick="toggleApprove('\${post.id}')">
                  \${post.approved ? '✅ Approved' : '⏳ Approve'}
                </button>
                <button class="btn btn-danger" onclick="setPostStatus('\${post.id}', 'rejected')" title="Reject and remove from main queue">
                  🚫 Reject
                </button>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" onclick="showDryRun('\${post.id}')">
                  🔍 Dry-Run
                </button>
                <button class="btn btn-emerald" id="pub-\${post.id}" onclick="publishLive('\${post.id}')">
                  📤 Publish Now
                </button>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function renderPublishedCard(post, idPrefix = 'pub-') {
      return \`
        <div class="post-card card-published">
          <div class="post-top">
            <strong>\${post.id}</strong>
            <span class="badge badge-emerald">✅ UPLOADED TO INSTAGRAM</span>
          </div>
          \${buildPostSlideViewer(post, idPrefix)}
          <div class="post-body">
            <div class="meta-row">
              <span>🆔 <strong>Request/Media ID:</strong> <code>\${post.igMediaId || 'N/A'}</code></span>
            </div>
            <div class="meta-row">
              <span>🕒 Slot: <strong>\${post.scheduledAt}</strong></span>
              <span>🎨 \${post.template} (\${post.pillar})</span>
            </div>
            \${post.postedAt ? \`<div class="meta-row"><span>📤 Uploaded At: <strong>\${post.postedAt}</strong></span></div>\` : ''}
            <div class="caption-box">\${post.caption}</div>
          </div>
          <div class="post-actions" style="flex-wrap:wrap;">
            <button class="btn btn-secondary" onclick="setPostStatus('\${post.id}', 'queued')">
              ↩️ Move Back to Queue
            </button>
            <button class="btn btn-danger" onclick="setPostStatus('\${post.id}', 'rejected')">
              🚫 Move to Rejected
            </button>
          </div>
        </div>
      \`;
    }

    function renderRejectedCard(post, idPrefix = 'rej-') {
      const badgeLabel = post.status === 'failed' ? '⚠️ PUBLISH FAILED' : '🚫 REJECTED';
      return \`
        <div class="post-card card-rejected">
          <div class="post-top">
            <strong>\${post.id}</strong>
            <span class="badge badge-danger">\${badgeLabel}</span>
          </div>
          \${buildPostSlideViewer(post, idPrefix)}
          <div class="post-body">
            <div class="meta-row">
              <span>🕒 Slot: <strong>\${post.scheduledAt}</strong></span>
              <span>🎨 \${post.template} (\${post.pillar})</span>
            </div>
            \${post.error ? \`<div style="color:#f87171; font-size:12px; background:rgba(239,68,68,0.1); padding:8px; border-radius:6px;">Error: \${post.error}</div>\` : ''}
            <div class="caption-box">\${post.caption}</div>
          </div>
          <div class="post-actions" style="flex-wrap:wrap;">
            <button class="btn btn-emerald" onclick="setPostStatus('\${post.id}', 'queued')">
              ↩️ Restore to Queue
            </button>
            <button class="btn btn-danger" onclick="deletePostPermanently('\${post.id}')">
              🗑️ Delete Permanently
            </button>
          </div>
        </div>
      \`;
    }

    function renderPublished() {
      const container = document.getElementById('published-grid');
      const published = getPublishedPosts();
      if (!published.length) {
        container.innerHTML = '<div class="post-card" style="padding:32px; grid-column: 1 / -1; text-align:center;"><p style="color:var(--muted); margin:0;">No posts have been uploaded yet. Click <strong>"📤 Publish Now"</strong> on any post in the Pending Queue.</p></div>';
      } else {
        container.innerHTML = published.map(p => renderPublishedCard(p, 'pub-')).join('');
      }

      const subRejected = document.getElementById('published-rejected-subgrid');
      const rejected = getRejectedPosts();
      if (!rejected.length) {
        subRejected.innerHTML = '<div class="post-card" style="padding:24px; grid-column: 1 / -1; text-align:center;"><p style="color:var(--muted); margin:0;">No rejected posts.</p></div>';
      } else {
        subRejected.innerHTML = rejected.map(p => renderRejectedCard(p, 'subrej-')).join('');
      }
    }

    function renderRejected() {
      const container = document.getElementById('rejected-grid');
      const rejected = getRejectedPosts();
      if (!rejected.length) {
        container.innerHTML = '<div class="post-card" style="padding:32px; grid-column: 1 / -1; text-align:center;"><p style="color:var(--muted); margin:0;">No rejected or failed posts. Clicking <strong>"🚫 Reject"</strong> on a post in the Pending Queue moves it here.</p></div>';
        return;
      }
      container.innerHTML = rejected.map(p => renderRejectedCard(p, 'rej-')).join('');
    }

    function renderTemplates() {
      const container = document.getElementById('templates-grid');
      container.innerHTML = appState.samples.map(s => {
        const imgUrl = '/preview/renders/' + s.templateId + '.jpg';
        return \`
          <div class="post-card">
            <div class="post-top">
              <strong>\${s.templateId}</strong>
              <span class="badge">\${s.paletteId}</span>
            </div>
            <div class="slide-viewer">
              <a href="\${imgUrl}" target="_blank"><img src="\${imgUrl}" alt="\${s.templateId}" loading="lazy" /></a>
            </div>
            <div class="post-body">
              <div class="meta-row">
                <span>Deco: <strong>\${s.decoration}</strong></span>
                <span>Variant: <strong>\${s.layoutVariant}</strong></span>
              </div>
              <div style="font-weight:700; font-size:15px;">\${s.data.headline}</div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function renderBankTable() {
      const filter = document.getElementById('bank-pillar-filter').value;
      const rows = appState.bank.filter(p => filter === 'all' || p.pillar === filter);
      document.getElementById('bank-tbody').innerHTML = rows.map(p => \`
        <tr>
          <td><code>\${p.id}</code></td>
          <td><span class="badge">\${p.pillar}</span></td>
          <td>\${p.format}</td>
          <td>\${p.template}</td>
          <td><strong>\${p.slides[0]?.headline || ''}</strong></td>
          <td style="color:var(--muted); font-size:12px;">\${p.hashtags.slice(0, 4).join(' ')}</td>
        </tr>
      \`).join('');
    }

    function renderDoctor() {
      const b = appState.brand;
      const up = appState.uploadPostHealth || {};
      const profilesHtml = (up.profiles && up.profiles.length)
        ? up.profiles.map(p => \`<li><strong>\${p.username}</strong> — Instagram: \${p.hasInstagram ? '<span style="color:#34d399;">✅ Connected</span>' : '<span style="color:#f87171;">❌ Not linked</span>'}</li>\`).join('')
        : '<li>No profiles detected yet (enter API key below & click Save & Test)</li>';

      document.getElementById('doctor-grid').innerHTML = \`
        <div class="post-card" style="padding:24px;">
          <h3 style="margin-top:0;">🚀 Upload-Post.com Instagram Publisher</h3>
          <p style="font-size:13px; color:var(--muted);">
            Connect your account at <a href="https://app.upload-post.com/dashboard" target="_blank" style="color:#60a5fa;">app.upload-post.com/dashboard</a>, copy your API Key & Profile Username, and save below:
          </p>
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
            <label style="font-size:12px; color:var(--muted);">UPLOADPOST_API_KEY:</label>
            <input type="text" id="up-api-key" placeholder="Paste your Upload-Post API Key..." value="" />
            <label style="font-size:12px; color:var(--muted);">UPLOADPOST_USER (Profile Username on Upload-Post):</label>
            <input type="text" id="up-user" placeholder="e.g. haanhosting (leave blank to auto-detect)" value="\${up.resolvedUser || up.configuredUser || ''}" />
            <button class="btn btn-emerald" onclick="saveUploadPostConfig()">💾 Save to .env & Verify Connection</button>
          </div>
          <p><strong>Connection Status:</strong> \${up.ok ? '<span style="color:#34d399;">✅ Connected to Upload-Post API</span>' : '<span style="color:#fbbf24;">⚠️ ' + (up.error || 'Not configured') + '</span>'}</p>
          <p><strong>Resolved Profile:</strong> <code>\${up.resolvedUser || 'Auto-detect'}</code></p>
          <h4 style="margin-bottom:6px;">Dashboard Profiles:</h4>
          <ul style="margin-top:0; font-size:13px;">\${profilesHtml}</ul>
        </div>
        <div class="post-card" style="padding:24px;">
          <h3 style="margin-top:0;">🩺 System Health Checks</h3>
          <p>✅ <strong>Active Publisher:</strong> <code>\${appState.doctor.activePublisher}</code></p>
          <p>✅ <strong>Node.js Runtime:</strong> \${appState.doctor.nodeVersion}</p>
          <p>✅ <strong>Bundled Offline Fonts:</strong> Poppins & Inter (inlined)</p>
          <p>✅ <strong>12 Launch Templates:</strong> All verified (1080×1350 4:5 JPEG)</p>
          <p>✅ <strong>Offline Content Bank:</strong> \${appState.bank.length} validated posts ready</p>
          <p>🔑 <strong>UPLOADPOST_API_KEY:</strong> \${appState.doctor.hasUploadPost ? 'Configured ✅' : 'Not set ⚠️'}</p>
          <p>🔑 <strong>GEMINI_API_KEY:</strong> \${appState.doctor.hasGemini ? 'Configured ✅' : 'Not set (Using Offline Content Bank fallback)'}</p>
        </div>
        <div class="post-card" style="padding:24px;">
          <h3 style="margin-top:0;">🏢 Verified Brand Profile (\${b.name})</h3>
          <p><strong>Website:</strong> <a href="\${b.url}" target="_blank" style="color:#60a5fa;">\${b.url}</a></p>
          <p><strong>Tagline:</strong> \${b.tagline}</p>
          <p><strong>WhatsApp Support:</strong> \${b.contact.phone} (\${b.contact.location})</p>
          <p><strong>Datacenters:</strong> \${b.datacenters.map(d => d.flag + ' ' + d.city).join(' · ')}</p>
          <h4>Verified Offers (config/brand.json):</h4>
          <ul>
            \${b.offers.map(o => \`<li><strong>\${o.plan} (\${o.price}):</strong> \${o.specs}</li>\`).join('')}
          </ul>
        </div>
      \`;
    }

    async function triggerGenerate() {
      const btn = document.getElementById('btn-generate');
      const date = document.getElementById('gen-date').value;
      btn.disabled = true;
      btn.textContent = '⏳ Generating & Rendering with Playwright...';
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        await loadState();
      } catch (e) {
        alert('Error: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '⚡ Generate & Render 5 Posts';
      }
    }

    async function toggleApprove(postId) {
      await fetch('/api/toggle-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId })
      });
      await loadState();
    }

    async function setPostStatus(postId, status) {
      const res = await fetch('/api/set-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, status })
      });
      if (!res.ok) {
        const d = await res.json();
        alert('Error: ' + (d.error || 'Failed to update status'));
        return;
      }
      await loadState();
    }

    async function deletePostPermanently(postId) {
      if (!confirm('Permanently delete post ' + postId + ' from the queue?')) return;
      const res = await fetch('/api/delete-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId })
      });
      if (!res.ok) {
        const d = await res.json();
        alert('Error: ' + (d.error || 'Failed to delete post'));
        return;
      }
      await loadState();
    }

    async function showDryRun(postId) {
      const res = await fetch('/api/publish-dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId })
      });
      const data = await res.json();
      document.getElementById('modal-title').textContent = 'Upload-Post API Dry-Run · ' + postId;
      document.getElementById('modal-content').textContent = data.log;
      document.getElementById('dryrun-modal').classList.add('open');
    }

    async function publishLive(postId) {
      const btn = document.getElementById('pub-' + postId);
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Uploading...';
      }
      try {
        const res = await fetch('/api/publish-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        document.getElementById('modal-title').textContent = '✅ Published to Instagram via Upload-Post · ' + postId;
        document.getElementById('modal-content').textContent = JSON.stringify(data, null, 2);
        document.getElementById('dryrun-modal').classList.add('open');
        await loadState();
      } catch (e) {
        alert('Publish failed: ' + e.message);
        if (btn) {
          btn.disabled = false;
          btn.textContent = '📤 Publish Now';
        }
      }
    }

    async function saveUploadPostConfig() {
      const apiKey = document.getElementById('up-api-key').value.trim();
      const user = document.getElementById('up-user').value.trim();
      const res = await fetch('/api/save-uploadpost-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, user })
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Error: ' + (data.error || 'Failed to save'));
        return;
      }
      await loadState();
      alert(data.health?.ok
        ? 'Connected to Upload-Post! Resolved profile: ' + (data.health.resolvedUser || 'none')
        : 'Saved to .env, but connection check returned: ' + (data.health?.error || 'Unknown error'));
    }

    function closeModal() {
      document.getElementById('dryrun-modal').classList.remove('open');
    }

    loadState();
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url || '/', `http://localhost:${PORT}`);
    const pathname = urlObj.pathname;

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getDashboardHtml());
      return;
    }

    if (req.method === 'GET' && pathname === '/api/state') {
      const brand = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'config/brand.json'), 'utf8'));
      const schedule = loadScheduleConfig();
      const pillars = loadPillarsConfig();
      const queue = loadQueue();
      const history = loadHistory();
      const bank = loadContentBank();
      const token = loadTokenState();
      const uploadPostHealth = await checkUploadPostConnection();

      sendJson(res, 200, {
        nextDay: getNextDayKarachi(),
        brand,
        schedule,
        pillars,
        queue,
        history,
        bank,
        token,
        uploadPostHealth,
        samples: SAMPLE_POSTS,
        doctor: {
          activePublisher: getActivePublisherType(),
          nodeVersion: process.version,
          hasGemini: Boolean(process.env.GEMINI_API_KEY),
          hasIgToken: Boolean(process.env.IG_ACCESS_TOKEN),
          hasUploadPost: Boolean(process.env.UPLOADPOST_API_KEY)
        }
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate') {
      const body = await readJsonBody(req);
      const targetDate = body.date || getNextDayKarachi();
      const history = loadHistory();
      const existingQueue = loadQueue();
      const newPosts = await generateDailyPosts({
        date: targetDate,
        history,
        postsPerDay: 5,
        existingQueue,
        allowNewBatch: true
      });

      const dateDir = path.resolve(process.cwd(), 'media', targetDate);
      if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });

      for (const post of newPosts) {
        const images: string[] = [];
        const imageUrls: string[] = [];
        const slug = post.id.replace(`${post.date}-`, '');
        for (let sIdx = 0; sIdx < post.slides.length; sIdx++) {
          const filename = post.slides.length > 1 ? `${slug}-${sIdx + 1}.jpg` : `${slug}.jpg`;
          const relPath = `media/${post.date}/${filename}`;
          const outPath = path.join(dateDir, filename);
          await renderSlide({
            templateId: post.template,
            paletteId: post.design.palette,
            seed: post.design.seed,
            decoration: post.design.decoration,
            layoutVariant: post.design.layoutVariant,
            data: post.slides[sIdx],
            outputPath: outPath
          });
          images.push(relPath);
          imageUrls.push(getPublicMediaUrl(relPath));
        }
        post.images = images;
        post.imageUrls = imageUrls;
      }

      await closeBrowser();
      const enqueueRes = enqueuePosts(newPosts, { prepend: true });
      sendJson(res, 200, { ok: true, count: enqueueRes.added, posts: newPosts.map(p => p.id) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/toggle-approve') {
      const body = await readJsonBody(req);
      const queue = loadQueue();
      const post = queue.find(p => p.id === body.postId);
      if (!post) {
        sendJson(res, 404, { error: 'Post not found' });
        return;
      }
      post.approved = !post.approved;
      saveQueue(queue);
      sendJson(res, 200, { ok: true, approved: post.approved });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/set-status') {
      const body = await readJsonBody(req);
      if (!body.postId || !body.status) {
        sendJson(res, 400, { error: 'postId and status are required' });
        return;
      }
      const updated = updatePostStatus(body.postId, body.status);
      sendJson(res, 200, { ok: true, post: updated });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/delete-post') {
      const body = await readJsonBody(req);
      const queue = loadQueue();
      const idx = queue.findIndex(p => p.id === body.postId);
      if (idx === -1) {
        sendJson(res, 404, { error: 'Post not found' });
        return;
      }
      queue.splice(idx, 1);
      saveQueue(queue);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/publish-dry-run') {
      const body = await readJsonBody(req);
      const queue = loadQueue();
      const post = queue.find(p => p.id === body.postId);
      if (!post) {
        sendJson(res, 404, { error: 'Post not found' });
        return;
      }
      const log = buildDryRunLog(post);
      sendJson(res, 200, { ok: true, log });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/publish-live') {
      const body = await readJsonBody(req);
      const queue = loadQueue();
      const post = queue.find(p => p.id === body.postId);
      if (!post) {
        sendJson(res, 404, { error: 'Post not found in queue' });
        return;
      }
      if (post.status !== 'queued') {
        sendJson(res, 409, { error: `Post is '${post.status}', only queued posts can be published` });
        return;
      }
      updatePostStatus(post.id, 'publishing');
      try {
        const result = await publishPost(post, { dryRun: false, skipMediaWait: true });
        updatePostStatus(post.id, 'posted', { igMediaId: result.igMediaId });
        sendJson(res, 200, { ok: true, postId: post.id, result });
      } catch (err: any) {
        updatePostStatus(post.id, 'queued', { error: err.message });
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/save-uploadpost-config') {
      const body = await readJsonBody(req);
      const updates: Record<string, string> = {};
      if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
        updates.UPLOADPOST_API_KEY = body.apiKey.trim();
      }
      if (typeof body.user === 'string') {
        updates.UPLOADPOST_USER = body.user.trim();
      }
      if (Object.keys(updates).length > 0) {
        upsertEnvFile(updates);
      }
      const health = await checkUploadPostConnection();
      if (health.ok && health.resolvedUser && !process.env.UPLOADPOST_USER) {
        upsertEnvFile({ UPLOADPOST_USER: health.resolvedUser });
      }
      sendJson(res, 200, { ok: true, health });
      return;
    }

    if (pathname.startsWith('/preview/') || pathname.startsWith('/media/') || pathname.startsWith('/logo/')) {
      serveStaticFile(res, pathname.slice(1));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err: any) {
    sendJson(res, 500, { error: err.message });
  }
});

// Ensure preview assets exist before serving
async function boot() {
  const contactSheet = path.resolve(process.cwd(), 'preview/contact-sheet.jpg');
  if (!fs.existsSync(contactSheet)) {
    await generatePreviews();
  }
  server.listen(PORT, () => {
    console.log(`\n🚀 Haan Hosting Instagram Agent Dashboard running at: http://localhost:${PORT}`);
    console.log(`   • Interactive Queue & Dry-Run Publisher: http://localhost:${PORT}`);
    console.log(`   • Raw 12-Template Preview Gallery:       http://localhost:${PORT}/preview/index.html`);
    console.log(`   • Contact Sheet Composite:               http://localhost:${PORT}/preview/contact-sheet.jpg\n`);
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  boot();
}
