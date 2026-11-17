import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { renderSlide, closeBrowser } from './renderer.js';

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
    paletteId: 'deep-violet',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Tip #12',
      headline: 'Slow websites lose 7% of buyers per second.',
      subline: 'Switch to 10 Gbps NVMe hosting built for speed.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T02-split-card',
    paletteId: 'slate-cyan',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'WordPress tip',
      headline: 'Why your WordPress site feels slow today',
      subline: 'Shared hosting crowds hundreds of sites onto one CPU. An NVMe VPS gives your database dedicated RAM.',
      highlight: 'Enable Redis object caching for sub-100ms loads',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T03-checklist',
    paletteId: 'mint-fresh',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Checklist',
      headline: 'Before you launch a website',
      items: [
        'Free SSL installed & HTTPS forced',
        'Daily automated backups enabled',
        'PHP updated to 8.2+ in cPanel'
      ],
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T04-big-number',
    paletteId: 'midnight-gold',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Infrastructure',
      statNumber: '10 Gbps',
      statLabel: 'Dedicated network port speed',
      headline: 'Zero bottlenecks for Forex & apps.',
      subline: 'Included on every Windows RDP and NVMe Cloud VPS in USA, UK & Singapore.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T05-offer-poster',
    paletteId: 'ocean-blue',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Cloud VPS',
      headline: 'High-speed NVMe VPS from $11.99/mo',
      planName: 'Starter Cloud VPS',
      price: '$11.99/mo',
      specs: [
        '4 Cores CPU',
        '8 GB RAM',
        '50 GB NVMe',
        '10 Gbps Port',
        'DDoS Protection',
        'USA / UK / SG'
      ],
      ctaButtonText: 'Order at haanhosting.store',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T06-quote-card',
    paletteId: 'sunset-violet',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Builder mindset',
      headline: 'Your website is the only digital asset you truly own.',
      author: 'Haan Engineering Team',
      role: 'Lahore',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T07-myth-fact',
    paletteId: 'coral-pop',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Myth vs fact',
      myth: 'Cheap $3 RDPs on WhatsApp groups are safe for business.',
      fact: 'Most are hacked PCs that vanish overnight. Always use a registered host.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T08-browser-mockup',
    paletteId: 'sand-terracotta',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Web hosting',
      headline: 'Get your business online in 5 minutes',
      urlDomain: 'haanhosting.store',
      contentTitle: '1-Click WordPress + Free SSL',
      subline: 'cPanel web hosting with SSD storage and 24/7 WhatsApp support starting at $3.99/mo.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T09-terminal',
    paletteId: 'forest-lime',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Tech tip',
      headline: 'Test real server latency in seconds',
      command: 'ping -c 4 haanhosting.store',
      output: '64 bytes from 104.21.32.1: time=12.4 ms',
      successLine: '0% packet loss · 10 Gbps uplink',
      subline: 'Pick Singapore for lowest ping from Pakistan, or London LD4 for Forex.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T10-question-poll',
    paletteId: 'navy-sky',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Poll',
      headline: 'Which server OS do you deploy most?',
      options: [
        'Ubuntu Server LTS',
        'Debian Minimal',
        'Windows Server 2022',
        'AlmaLinux / Rocky'
      ],
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T11-carousel',
    paletteId: 'electric-indigo',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Forex guide',
      slideIndex: 1,
      totalSlides: 3,
      isCover: true,
      headline: 'Why Forex traders use a dedicated RDP',
      subline: 'Home laptops suffer from power cuts and high broker ping.',
      bullets: [
        'Non-stop 24/5 MT4/MT5 execution',
        '1ms latency to London LD4 brokers',
        'Clean dedicated IP address'
      ],
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T12-minimal-editorial',
    paletteId: 'berry-cream',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Reliability',
      headline: 'Good hosting is invisible. It just works.',
      subline: 'Enterprise NVMe hardware, 99.9% SLA uptime, and real human support in Lahore.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T13-cyber-hero-bg',
    paletteId: 'ocean-blue',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Cloud Architecture',
      headline: 'Dedicated NVMe Power With Zero CPU Throttling',
      subline: 'Deploy isolated Linux & Windows instances on 10 Gbps enterprise racks in under 60 seconds.',
      highlight: 'Instant Root & Admin Access · 99.9% Uptime SLA',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T14-datacenter-spotlight',
    paletteId: 'navy-sky',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Global Infrastructure',
      headline: 'Host Right Next to Your Customers & Brokers',
      subline: 'Choose USA, UK London LD4, or Singapore data centers with 10 Gbps connectivity.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T15-vs-comparison',
    paletteId: 'electric-indigo',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Hosting Comparison',
      headline: 'Why Growing Brands Leave Cheap Shared Hosting',
      beforeText: 'Crowded CPUs, slow 5-second database queries, and random account suspensions.',
      afterText: 'Dedicated NVMe Gen4 storage, guaranteed RAM, and 10 Gbps network speed from $11.99/mo.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T16-bento-grid',
    paletteId: 'deep-violet',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Enterprise Stack',
      headline: '4 Reasons Developers Trust Haan Hosting',
      bentoItems: [
        '10 Gbps Dedicated Network Ports',
        'Pure Gen4 NVMe SSD Arrays',
        'USA, UK LD4 & Singapore Nodes',
        '24/7 WhatsApp Support in Lahore'
      ],
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T17-forex-telemetry',
    paletteId: 'forest-lime',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Forex RDP',
      headline: 'Zero Slippage for Your MT4 & MT5 Trading Bots',
      subline: 'Keep your Expert Advisors running 24/5 on dedicated Windows Server RDP in London LD4 & New York.',
      cta: 'haanhosting.store'
    }
  },
  {
    templateId: 'T18-vip-promo-poster',
    paletteId: 'ocean-blue',
    decoration: 'none',
    layoutVariant: 0,
    data: {
      label: 'Verified Offer',
      headline: 'Launch Your High-Speed Website or RDP Today',
      priceBadge: 'Web Hosting $3.99/mo · VPS $11.99/mo',
      subline: 'Includes Free SSL, DDoS Protection, Instant Provisioning, and 24/7 WhatsApp Engineering Support.',
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

  console.log(`Rendering ${SAMPLE_POSTS.length} template previews (STYLE_REFERENCE.md flat style)...`);

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
      background: { r: 15, g: 23, b: 42 }
    }
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(contactSheetPath);

  console.log(`  ✓ Contact sheet saved to ${contactSheetPath}`);

  // Generate preview/index.html
  const htmlPath = path.join(previewDir, 'index.html');
  const cardsHtml = SAMPLE_POSTS.map((sample) => {
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
      </div>
    `;
  }).join('\n');

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HAAN HOSTING - Approved Style Template Gallery</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      background: #0f172a;
      color: #ffffff;
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
    }
    header {
      margin-bottom: 40px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      padding-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 { margin: 0 0 8px 0; font-size: 32px; font-weight: 700; }
    p { margin: 0; color: #94a3b8; font-size: 16px; }
    .btn {
      background: #2563eb;
      color: #fff;
      text-decoration: none;
      padding: 12px 22px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 28px;
    }
    .card {
      background: #1e293b;
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .card-header {
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .template-title { font-weight: 600; font-size: 15px; }
    .badge {
      background: rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
    }
    .card img {
      width: 100%;
      height: auto;
      aspect-ratio: 4 / 5;
      display: block;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Haan Hosting · Approved Flat Style Gallery</h1>
      <p>12 Templates · 1080×1350 px · Flat Solid Colors · Poppins + Inter</p>
    </div>
    <div>
      <a href="contact-sheet.jpg" class="btn" target="_blank">Open Contact Sheet</a>
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
