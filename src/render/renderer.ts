import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import sharp from 'sharp';
import { compileTemplate } from './templateCompiler.js';
import { TEXT_FIT_SCRIPT } from './textFit.js';
import { Palette, getPaletteById, generatePalette, formatCssVariables } from './palette.js';

let sharedBrowser: Browser | null = null;
let cachedBundledCss: string | null = null;

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

  // Replace @import in base.css with the fonts definition
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
    paletteId = 'ocean-blue',
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

  // Inline the bundled base.css and fonts
  const bundledCss = getBundledCss();
  rawHtml = rawHtml.replace(
    /<link\s+rel=["']stylesheet["']\s+href=["'][^"']*base\.css["']\s*\/?>/i,
    `<style>\n${bundledCss}\n</style>`
  );

  // Resolve palette
  let palette: Palette;
  if (paletteId && paletteId.startsWith('dyn-')) {
    palette = generatePalette(seed);
  } else {
    palette = getPaletteById(paletteId);
  }

  // Resolve decoration
  let decorationStyle = '';
  if (decoration && decoration !== 'none') {
    const shapePath = path.resolve(process.cwd(), 'templates/_shared/shapes', `${decoration}.svg`);
    if (fs.existsSync(shapePath)) {
      const svgBase64 = fs.readFileSync(shapePath).toString('base64');
      decorationStyle = `background-image: url('data:image/svg+xml;base64,${svgBase64}');`;
    }
  }

  // Prepare template variables
  const templateVars: Record<string, any> = {
    ...data,
    variantClass: `variant-${layoutVariant}`,
    cssVariables: formatCssVariables(palette),
    decorationStyle,
    cta: data.cta || 'haanhosting.store',
    badge: data.badge || 'Haan Hosting'
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

    // Wait for bundled fonts to be fully decoded
    await page.evaluate(() => document.fonts.ready);

    // Apply auto text-fit
    await page.evaluate(TEXT_FIT_SCRIPT);

    // Give a brief moment for layout to settle
    await page.waitForTimeout(50);

    // Screenshot the canvas element
    const canvasElement = await page.$('.canvas');
    if (!canvasElement) {
      throw new Error(`Could not find .canvas element in template ${templateId}`);
    }

    const pngBuffer = await canvasElement.screenshot({
      type: 'png',
      omitBackground: false
    });

    // Ensure output directory exists
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Convert to Instagram-compliant JPEG via sharp (1080x1350, quality 88)
    await sharp(pngBuffer)
      .resize(1080, 1350, { fit: 'cover' })
      .jpeg({
        quality: 88,
        mozjpeg: true
      })
      .toFile(outputPath);

    // Verify output file size < 8MB
    const stats = fs.statSync(outputPath);
    if (stats.size > 8 * 1024 * 1024) {
      throw new Error(`Rendered image exceeds 8MB limit: ${stats.size} bytes`);
    }

    return outputPath;
  } finally {
    await page.close();
  }
}
