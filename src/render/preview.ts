import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { renderSlide, closeBrowser } from './renderer.js';
import { loadPalettes } from './palette.js';

export interface TemplateSample {
  templateId: string;
  paletteId: string;
  decoration: string;
  layoutVariant: number;
  data: Record<string, any>;
}

export const SAMPLE_POSTS: TemplateSample[] = [
  {
    templateId: 'T01-bold-statement',
    paletteId: 'ocean-blue',
    decoration: 'mesh-gradient',
    layoutVariant: 0,
    data: {
      badge: 'Speed Matters',
      category: 'Performance',
      headline: 'A 1-second delay in loading costs you 7% of your customers.',
      body: 'Get ultra-fast NVMe storage and guaranteed 10 Gbps port speed with HAAN HOSTING.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T02-split-card',
    paletteId: 'slate-cyan',
    decoration: 'dots-grid',
    layoutVariant: 0,
    data: {
      badge: 'WordPress Pro Tip',
      category: 'Optimization',
      headline: 'Why Your WordPress Site Is Dragging Today',
      body: 'Most slow sites suffer from uncompressed images and shared CPU throttling. Upgrading to an isolated NVMe VPS gives your database dedicated resources.',
      highlight: '⚡ Pro fix: Enable Redis caching on your VPS',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T03-checklist',
    paletteId: 'forest-lime',
    decoration: 'diagonal-stripes',
    layoutVariant: 1,
    data: {
      badge: 'Checklist #04',
      category: 'Best Practices',
      headline: '3 Things to Check Before Launching Your Website',
      items: [
        'Free SSL certificate installed & HTTPS forced',
        'Automated daily backup schedule enabled',
        'cPanel PHP version updated to 8.2+'
      ],
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T04-big-number',
    paletteId: 'midnight-gold',
    decoration: 'glow-orb',
    layoutVariant: 0,
    data: {
      badge: 'Raw Bandwidth',
      category: 'Infrastructure',
      statNumber: '10 Gbps',
      statLabel: 'Data Center Network Port',
      headline: 'Zero Bottlenecks for Forex & Heavy Traffic',
      body: 'Every HAAN Windows RDP and NVMe VPS comes connected to a dedicated 10 Gbps port in USA, UK & Singapore.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T05-offer-poster',
    paletteId: 'ocean-blue',
    decoration: 'circuit-lines',
    layoutVariant: 0,
    data: {
      badge: 'Verified Deal',
      category: 'Cloud VPS',
      headline: 'Enterprise Cloud VPS Starting at Just $11.99',
      planName: 'Starter Cloud VPS',
      price: '$11.99/mo',
      specs: [
        '4 Cores CPU',
        '8 GB RAM',
        '50 GB NVMe Storage',
        '10 Gbps Port Speed',
        'DDoS Protection',
        'USA / UK / Singapore'
      ],
      ctaButtonText: 'Order at haanhosting.store',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T06-quote-card',
    paletteId: 'sunset-violet',
    decoration: 'isometric-cube',
    layoutVariant: 0,
    data: {
      badge: 'Builder Mindset',
      category: 'Insight',
      headline: 'Your website is the only digital asset you truly own. Don’t build your business on borrowed land.',
      author: 'HAAN Engineering Team',
      role: 'Lahore, Pakistan',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T07-myth-fact',
    paletteId: 'coral-pop',
    decoration: 'corner-brackets',
    layoutVariant: 0,
    data: {
      badge: 'Myth Buster',
      category: 'Security',
      headline: 'The Truth About Cheap Social Media RDPs',
      myth: 'Cheap $3 RDPs on WhatsApp groups are completely safe to use for your business and banking.',
      fact: 'Most cheap RDPs are hacked computers that disappear overnight with your data. Always buy from a registered hosting provider.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T08-browser-mockup',
    paletteId: 'slate-cyan',
    decoration: 'wave-curves',
    layoutVariant: 0,
    data: {
      badge: 'Instant Setup',
      category: 'Web Hosting',
      headline: 'Launch Your Business Website in 5 Minutes',
      urlDomain: 'haanhosting.store/cpanel',
      statusText: 'Server Online · 99.9% Uptime',
      contentTitle: '1-Click WordPress & cPanel Hosting',
      body: 'Get SSD web hosting with free SSL, business email, and 24/7 WhatsApp support starting from $3.99/mo.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T09-terminal',
    paletteId: 'ocean-blue',
    decoration: 'dots-grid',
    layoutVariant: 0,
    data: {
      badge: 'DevOps Tip',
      category: 'Terminal',
      headline: 'How to Check Real Latency to Your Server',
      terminalTitle: 'haan@admin:~# ping -c 4 haanhosting.store',
      command: 'ping -c 4 haanhosting.store',
      output: '64 bytes from 104.21.32.1: icmp_seq=1 ttl=58 time=12.4 ms',
      successLine: '4 packets transmitted, 0% packet loss (avg 12ms)',
      body: 'Pick the datacenter closest to your audience: USA for global traffic, London for LD4 Forex, or Singapore for low ping across Pakistan & Asia.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T10-question-poll',
    paletteId: 'electric-indigo',
    decoration: 'diagonal-stripes',
    layoutVariant: 0,
    data: {
      badge: 'Community Poll',
      category: 'Discussion',
      headline: 'Which OS do you prefer for your production server?',
      options: [
        { letter: 'A', text: 'Ubuntu Server (LTS)' },
        { letter: 'B', text: 'Debian Minimal' },
        { letter: 'C', text: 'Windows Server 2022' },
        { letter: 'D', text: 'AlmaLinux / Rocky' }
      ],
      promptText: 'Comment your answer A, B, C or D below!',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T11-carousel',
    paletteId: 'ocean-blue',
    decoration: 'mesh-gradient',
    layoutVariant: 0,
    data: {
      badge: 'Forex Guide',
      category: 'Trading',
      slideIndex: 1,
      totalSlides: 3,
      isCover: true,
      headline: 'Why 90% of Successful Forex Traders Use an RDP VPS',
      body: 'Running MetaTrader 4/5 on your home laptop means dealing with power cuts, sleep mode, and internet drops.',
      bullets: [
        'Non-stop 24/5 Expert Advisor (EA) execution',
        'Sub-millisecond latency to London LD4 brokers',
        'Dedicated clean IP prevents broker account flags'
      ],
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T12-minimal-editorial',
    paletteId: 'sand-terracotta',
    decoration: 'mesh-gradient',
    layoutVariant: 0,
    data: {
      badge: 'Architecture',
      category: 'Perspective',
      headline: 'Reliable infrastructure should be invisible. It simply works.',
      editorialTag: 'Enterprise Principle',
      body: 'When your server never crashes, your customers never complain. Invest in hardware with ECC RAM, RAID-10 NVMe storage, and real human support.',
      cta: 'haanhosting.store'
    }
  }
];

export async function generatePreviews(): Promise<{
  renderedFiles: string[];
  contactSheetPath: string;
  htmlPath: string;
}> {
  const previewDir = path.resolve(process.cwd(), 'preview');
  const rendersDir = path.join(previewDir, 'renders');
  if (!fs.existsSync(rendersDir)) {
    fs.mkdirSync(rendersDir, { recursive: true });
  }

  const renderedFiles: string[] = [];

  console.log(`Rendering ${SAMPLE_POSTS.length} template previews...`);

  for (const sample of SAMPLE_POSTS) {
    const filename = `${sample.templateId}.jpg`;
    const outputPath = path.join(rendersDir, filename);
    await renderSlide({
      templateId: sample.templateId,
      paletteId: sample.paletteId,
      decoration: sample.decoration,
      layoutVariant: sample.layoutVariant,
      data: sample.data,
      outputPath
    });
    renderedFiles.push(outputPath);
    console.log(`  ✓ Rendered ${sample.templateId} (${sample.paletteId})`);
  }

  // Generate Contact Sheet (Grid of images)
  const contactSheetPath = path.join(previewDir, 'contact-sheet.jpg');
  console.log('Generating contact sheet composite...');

  const thumbWidth = 360;
  const thumbHeight = 450;
  const cols = 4;
  const rows = Math.ceil(renderedFiles.length / cols);
  const sheetWidth = cols * thumbWidth + (cols + 1) * 20;
  const sheetHeight = rows * thumbHeight + (rows + 1) * 20;

  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < renderedFiles.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = 20 + col * (thumbWidth + 20);
    const top = 20 + row * (thumbHeight + 20);

    const thumbBuffer = await sharp(renderedFiles[i])
      .resize(thumbWidth, thumbHeight, { fit: 'cover' })
      .toBuffer();

    composites.push({
      input: thumbBuffer,
      left,
      top
    });
  }

  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 3,
      background: { r: 10, g: 15, b: 30 }
    }
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(contactSheetPath);

  console.log(`  ✓ Contact sheet saved to ${contactSheetPath}`);

  // Generate preview/index.html
  const htmlPath = path.join(previewDir, 'index.html');
  const cardsHtml = SAMPLE_POSTS.map((sample, idx) => {
    const filename = `${sample.templateId}.jpg`;
    return `
      <div class="card">
        <div class="card-header">
          <div class="template-title">${sample.templateId}</div>
          <span class="badge">${sample.paletteId}</span>
        </div>
        <a href="renders/${filename}" target="_blank">
          <img src="renders/${filename}" alt="${sample.templateId}" loading="lazy" />
        </a>
        <div class="card-meta">
          <div><strong>Deco:</strong> ${sample.decoration}</div>
          <div><strong>Variant:</strong> ${sample.layoutVariant}</div>
        </div>
      </div>
    `;
  }).join('\n');

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HAAN HOSTING - Instagram Template Gallery</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      background: #070d1d;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    header {
      margin-bottom: 40px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 32px;
      font-weight: 800;
    }
    h1 span { color: #2563eb; }
    p { margin: 0; color: #94a3b8; font-size: 16px; }
    .actions { display: flex; gap: 16px; }
    .btn {
      background: #2563eb;
      color: #fff;
      text-decoration: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 30px;
    }
    .card {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px rgba(37, 99, 235, 0.2);
    }
    .card-header {
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(0, 0, 0, 0.2);
    }
    .template-title {
      font-weight: 700;
      font-size: 15px;
    }
    .badge {
      background: rgba(37, 99, 235, 0.2);
      color: #60a5fa;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .card img {
      width: 100%;
      height: auto;
      aspect-ratio: 4 / 5;
      display: block;
      object-fit: cover;
    }
    .card-meta {
      padding: 12px 18px;
      font-size: 13px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>HAAN <span>HOSTING</span> · Instagram Template Gallery</h1>
      <p>12 Launch Templates · 1080×1350 px (4:5) · Fully Responsive & Auto Text-Fitted</p>
    </div>
    <div class="actions">
      <a href="contact-sheet.jpg" class="btn" target="_blank">View Contact Sheet</a>
    </div>
  </header>
  <div class="grid">
    ${cardsHtml}
  </div>
</body>
</html>`;

  fs.writeFileSync(htmlPath, htmlContent);
  console.log(`  ✓ Gallery HTML saved to ${htmlPath}`);

  await closeBrowser();
  return { renderedFiles, contactSheetPath, htmlPath };
}
