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
  if (templateId.includes('T13') || templateId.includes('T18') || templateId.includes('T05')) {
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

  rawHtml = rawHtml.replace(
    /<div class="footer">(?:Haan Hosting · )?{{cta}}<\/div>/g,
    `<div class="footer"><div class="brand-footer-left"><img src="{{logoDataUri}}" alt="HAAN" /><div><div class="brand-footer-title">HAAN HOSTING</div><div class="brand-footer-sub">NVMe Cloud VPS · Windows RDP · Web Hosting</div></div></div><div class="brand-footer-cta">{{cta}} →</div></div>`
  );

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

  // Prepare template variables supporting all 18 templates
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
