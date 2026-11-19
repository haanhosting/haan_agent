import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import sharp from 'sharp';
import { compileTemplate } from './templateCompiler.js';
import { TEXT_FIT_SCRIPT } from './textFit.js';
import { Palette, getPaletteById, generatePalette, formatCssVariables } from './palette.js';

let sharedBrowser: Browser | null = null;
let cachedBundledCss: string | null = null;
let cachedLogoDataUri: string | null = null;
const cachedBgDataUris: Record<string, string> = {};

const BG_NAMES = [
  'bg-datacenter',
  'bg-globe-network',
  'bg-forex-chart',
  'bg-cyber-shield',
  'bg-cloud-matrix'
];

function getLogoDataUri(): string {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  const circleLogoPath = path.resolve(process.cwd(), 'templates/_shared/logo-circle.png');
  const mainLogoPath = path.resolve(process.cwd(), 'logo/logo.png');
  const fallbackLogoPath = path.resolve(process.cwd(), 'templates/_shared/logo.png');

  const chosen = fs.existsSync(circleLogoPath)
    ? circleLogoPath
    : fs.existsSync(mainLogoPath)
      ? mainLogoPath
      : fallbackLogoPath;

  if (fs.existsSync(chosen)) {
    cachedLogoDataUri = `data:image/png;base64,${fs.readFileSync(chosen).toString('base64')}`;
  } else {
    cachedLogoDataUri = '';
  }
  return cachedLogoDataUri;
}

function getBgDataUri(templateId: string, seed = 1000): string {
  let bgKey = BG_NAMES[Math.abs(seed) % BG_NAMES.length];
  if (templateId.includes('T19') || templateId.includes('T23')) {
    bgKey = 'bg-datacenter';
  } else if (templateId.includes('T20')) {
    bgKey = 'bg-forex-chart';
  } else if (templateId.includes('T21')) {
    bgKey = 'bg-cloud-matrix';
  } else if (templateId.includes('T22')) {
    bgKey = 'bg-cyber-shield';
  } else if (templateId.includes('T24')) {
    bgKey = 'bg-globe-network';
  } else if (templateId.includes('T13') || templateId.includes('T18') || templateId.includes('T05')) {
    bgKey = 'bg-datacenter';
  } else if (templateId.includes('T14') || templateId.includes('T08')) {
    bgKey = 'bg-globe-network';
  } else if (templateId.includes('T17') || templateId.includes('T11') || templateId.includes('T04')) {
    bgKey = 'bg-forex-chart';
  } else if (templateId.includes('T16') || templateId.includes('T03') || templateId.includes('T07')) {
    bgKey = 'bg-cyber-shield';
  } else if (templateId.includes('T15') || templateId.includes('T09') || templateId.includes('T02')) {
    bgKey = 'bg-cloud-matrix';
  }

  if (cachedBgDataUris[bgKey]) return cachedBgDataUris[bgKey];
  const bgPath = path.resolve(process.cwd(), 'templates/_shared/backgrounds', `${bgKey}.jpg`);
  if (fs.existsSync(bgPath)) {
    cachedBgDataUris[bgKey] = `data:image/jpeg;base64,${fs.readFileSync(bgPath).toString('base64')}`;
    return cachedBgDataUris[bgKey];
  }
  return '';
}

function getBundledCss(): string {
  if (cachedBundledCss) return cachedBundledCss;

  const baseCssPath = path.resolve(process.cwd(), 'templates/_shared/base.css');
  const inlinedFontsPath = path.resolve(process.cwd(), 'templates/_shared/fonts/fonts-inlined.css');

  let baseCss = fs.readFileSync(baseCssPath, 'utf8');
  let fontsCss = '';
  if (fs.existsSync(inlinedFontsPath)) {
    fontsCss = fs.readFileSync(inlinedFontsPath, 'utf8');
  } else {
    const regularFontsPath = path.resolve(process.cwd(), 'templates/_shared/fonts/fonts.css');
    if (fs.existsSync(regularFontsPath)) {
      fontsCss = fs.readFileSync(regularFontsPath, 'utf8');
    }
  }

  baseCss = baseCss.replace(/@import\s+url\(['\"][^'\"]+fonts\.css['\"]\);?/, fontsCss);
  cachedBundledCss = baseCss;
  return cachedBundledCss;
}

let cachedNeonCss: string | null = null;
function getNeonThemeCss(): string {
  if (cachedNeonCss === null) {
    const p = path.resolve(process.cwd(), 'templates/_shared/neon-theme.css');
    cachedNeonCss = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }
  return cachedNeonCss;
}

const FEATURE_ICONS: Array<[string, string]> = [
  ['Instant Setup', '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'],
  ['DDoS Protection', '<path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>'],
  ['NVMe SSD', '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 11h6M7 14h3"/><circle cx="17" cy="12" r="1.2"/>'],
  ['99.9% Uptime', '<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>'],
  ['24/7 Support', '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19c0 1.5-2 2.5-5 2.5"/>']
];

const featureItem = ([label, svg]: [string, string], cls: string) =>
  `<div class="${cls}"><svg viewBox="0 0 24 24">${svg}</svg><span>${label}</span></div>`;

const BRAND_LEFT_HTML =
  '<div class="brand-footer-left"><img src="{{logoDataUri}}" alt="HAAN" /><div><div class="brand-footer-title">HAAN HOSTING</div><div class="brand-footer-sub">haanhosting.store</div></div></div>';

type HeaderVariant = 'split' | 'center' | 'ribbon' | 'bar';
type FooterVariant = 'strip' | 'compact' | 'centered' | 'chips';

const NEON_FOOTERS: Record<FooterVariant, string> = {
  // Full feature strip + crest row + ORDER NOW
  strip:
    '<div class="footer neon-footer f-strip">' +
    '<div class="feature-strip">' + FEATURE_ICONS.map(f => featureItem(f, 'feature-item')).join('') + '</div>' +
    '<div class="neon-footer-row">' + BRAND_LEFT_HTML + '<div class="order-btn">{{footerCtaLabel}}</div></div>' +
    '</div>',
  // Single glass bar: crest + name | ORDER NOW
  compact:
    '<div class="footer neon-footer f-compact">' +
    '<div class="neon-footer-row">' + BRAND_LEFT_HTML + '<div class="order-btn">{{footerCtaLabel}}</div></div>' +
    '</div>',
  // Inline feature line, wide centred ORDER NOW, url underneath
  centered:
    '<div class="footer neon-footer f-centered">' +
    '<div class="feature-line">' + FEATURE_ICONS.slice(0, 4).map(f => featureItem(f, 'feature-inline')).join('') + '</div>' +
    '<div class="order-btn">{{footerCtaLabel}}</div>' +
    '<div class="footer-url"><img src="{{logoDataUri}}" alt="HAAN" /><span>HAAN HOSTING</span><i></i><span>haanhosting.store</span></div>' +
    '</div>',
  // Feature chips, then url + ORDER NOW
  chips:
    '<div class="footer neon-footer f-chips">' +
    '<div class="feature-chips">' + FEATURE_ICONS.slice(0, 4).map(f => featureItem(f, 'feature-chip')).join('') + '</div>' +
    '<div class="neon-footer-row">' + BRAND_LEFT_HTML + '<div class="order-btn">{{footerCtaLabel}}</div></div>' +
    '</div>'
};

// Per-template header/footer pairing so the feed doesn't repeat one frame.
// Content-heavy templates get the slimmer footers.
const LAYOUT_VARIANTS: Record<string, [HeaderVariant, FooterVariant]> = {
  T01: ['center', 'centered'],
  T02: ['split', 'strip'],
  T03: ['ribbon', 'chips'],
  T04: ['bar', 'centered'],
  T05: ['center', 'compact'],
  T06: ['ribbon', 'centered'],
  T07: ['split', 'chips'],
  T08: ['bar', 'strip'],
  T09: ['ribbon', 'compact'],
  T10: ['center', 'strip'],
  T11: ['split', 'chips'],
  T12: ['ribbon', 'centered'],
  T13: ['bar', 'compact'],
  T14: ['center', 'compact'],
  T15: ['split', 'compact'],
  T16: ['ribbon', 'chips'],
  T17: ['bar', 'compact'],
  T18: ['center', 'compact'],
  T19: ['split', 'strip'],
  T20: ['center', 'compact'],
  T21: ['ribbon', 'compact'],
  T22: ['bar', 'centered'],
  T23: ['center', 'compact'],
  T24: ['split', 'compact']
};

function getLayoutVariant(templateId: string): [HeaderVariant, FooterVariant] {
  const key = (templateId.match(/T\d{2}/) || [''])[0];
  return LAYOUT_VARIANTS[key] || ['split', 'strip'];
}

export async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser) {
    sharedBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
    });
  }
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

export interface RenderOptions {
  templateId: string;
  paletteId?: string;
  seed?: number;
  decoration?: string;
  layoutVariant?: number;
  data: Record<string, any>;
  outputPath: string;
}

export async function renderSlide(options: RenderOptions): Promise<string> {
  const {
    templateId,
    paletteId = 'deep-violet',
    seed = 1000,
    decoration = 'none',
    layoutVariant = 0,
    data,
    outputPath
  } = options;

  const templateDir = path.resolve(process.cwd(), 'templates', templateId);
  const templateHtmlPath = path.join(templateDir, 'template.html');

  if (!fs.existsSync(templateHtmlPath)) {
    throw new Error(`Template not found at ${templateHtmlPath}`);
  }

  let rawHtml = fs.readFileSync(templateHtmlPath, 'utf8');

  // Inline bundled base.css and fonts
  const bundledCss = getBundledCss();
  rawHtml = rawHtml.replace(
    /<link\s+rel=["']stylesheet["']\s+href=["'][^"']*base\.css["']\s*\/?>/i,
    `<style>\n${bundledCss}\n</style>`
  );

  // Inject low-opacity background image layer into templates that don't explicitly declare it
  if (!rawHtml.includes('bg-image-layer')) {
    rawHtml = rawHtml.replace(
      /(<div\s+class=["'][^"']*canvas[^"']*["'][^>]*>)/i,
      `$1\n    <div class="bg-image-layer" style="{{bgImageStyle}}"></div>\n    <div class="bg-vignette-layer"></div>`
    );
  }

  // Upgrade top .label and bottom .footer to include the official HAAN HOSTING logo.png crest
  rawHtml = rawHtml.replace(
    /<div class="label">{{label}}<\/div>/g,
    `<div class="label"><span class="brand-top-pill">{{label}}</span><div class="brand-top-logo"><img src="{{logoDataUri}}" alt="HAAN" /><span>HAAN HOSTING</span></div></div>`
  );

  // HAAN neon brand footer (variant per template; replaces every template's footer)
  const [headerVariant, footerVariant] = getLayoutVariant(templateId);
  rawHtml = rawHtml.replace(
    /<div class="footer">[\s\S]*?<\/div>(?=\s*<\/div>\s*<\/body>)/,
    NEON_FOOTERS[footerVariant]
  );

  // Neon theme: class + header variant on canvas, glow layer, and theme CSS after template styles
  rawHtml = rawHtml.replace(
    /(<div\s+class=["'])([^"']*\bcanvas\b[^"']*)(["'][^>]*>)/i,
    `$1$2 neon hdr-${headerVariant}$3\n    <div class="neon-glow"></div>`
  );
  rawHtml = rawHtml.replace(/<\/head>/i, `<style>\n${getNeonThemeCss()}\n</style>\n</head>`);

  // Resolve palette
  let palette: Palette;
  if (paletteId && paletteId.startsWith('dyn-')) {
    palette = generatePalette(seed);
  } else {
    palette = getPaletteById(paletteId);
  }

  // Resolve optional subtle flat decoration
  let decorationStyle = '';
  if (decoration && decoration !== 'none') {
    const shapePath = path.resolve(process.cwd(), 'templates/_shared/shapes', `${decoration}.svg`);
    if (fs.existsSync(shapePath)) {
      const svgBase64 = fs.readFileSync(shapePath).toString('base64');
      decorationStyle = `background-image: url('data:image/svg+xml;base64,${svgBase64}');`;
    }
  }

  const logoDataUri = getLogoDataUri();
  const bgDataUri = getBgDataUri(templateId, seed);
  const bgImageStyle = bgDataUri ? `background-image: url('${bgDataUri}');` : '';

  // Normalize options array for T10 poll pills
  const pillOptions: string[] = Array.isArray(data.options)
    ? data.options.map((opt: any) => (typeof opt === 'string' ? opt : opt.text || `${opt.letter}. ${opt.text}`))
    : [];

  // Normalize bentoItems for T16
  const bentoItems: string[] = Array.isArray(data.bentoItems)
    ? data.bentoItems
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.specs)
        ? data.specs.slice(0, 4)
        : [
            '10 Gbps Dedicated Port Speed',
            'Enterprise NVMe Gen4 Storage',
            'USA, UK LD4 & Singapore Nodes',
            '24/7 WhatsApp Support in PK'
          ];

  // Prepare template variables supporting all 24 templates
  const templateVars: Record<string, any> = {
    ...data,
    variantClass: `variant-${layoutVariant}`,
    cssVariables: formatCssVariables(palette),
    decorationStyle,
    logoDataUri,
    bgImageStyle,
    label: data.label || data.badge || data.category || 'Haan Hosting',
    subline: data.subline || data.body || '',
    question: data.question || data.headline || '',
    pillOptions,
    bentoItems,
    beforeText: data.beforeText || data.myth || 'Crowded shared CPUs, random downtime, and slow page loads during traffic spikes.',
    afterText: data.afterText || data.fact || 'Isolated NVMe Cloud VPS & Dedicated Windows RDP with 10 Gbps port speed and 99.9% SLA.',
    priceBadge: data.priceBadge || data.price || data.statNumber || 'Plans from $3.99/mo',
    cta: data.cta || 'haanhosting.store',
    footerCtaLabel: data.isCover && Number(data.totalSlides) > 1 ? 'Swipe »' : 'Order Now »',
    badge: data.badge || data.label || 'Haan Hosting'
  };

  const compiledHtml = compileTemplate(rawHtml, templateVars);

  const browser = await getBrowser();
  const page: Page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 1
  });

  try {
    await page.setContent(compiledHtml, {
      waitUntil: 'load'
    });

    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(TEXT_FIT_SCRIPT);
    await page.waitForTimeout(40);

    const canvasElement = await page.$('.canvas, .post');
    if (!canvasElement) {
      throw new Error(`Could not find .canvas or .post element in template ${templateId}`);
    }

    const pngBuffer = await canvasElement.screenshot({
      type: 'png',
      omitBackground: false
    });

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    await sharp(pngBuffer)
      .resize(1080, 1350, { fit: 'cover' })
      .jpeg({
        quality: 88,
        mozjpeg: true
      })
      .toFile(outputPath);

    const stats = fs.statSync(outputPath);
    if (stats.size > 8 * 1024 * 1024) {
      throw new Error(`Rendered image exceeds 8MB limit: ${stats.size} bytes`);
    }

    return outputPath;
  } finally {
    await page.close();
  }
}
