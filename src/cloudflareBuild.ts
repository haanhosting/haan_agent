import fs from 'fs';
import path from 'path';
import { getDashboardHtml } from './server.js';
import { SAMPLE_POSTS } from './render/preview.js';

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function buildCloudflarePages() {
  const root = process.cwd();
  const dist = path.join(root, 'dist');

  if (fs.existsSync(dist)) {
    fs.rmSync(dist, { recursive: true, force: true });
  }
  fs.mkdirSync(dist, { recursive: true });

  // 1. Write main Dashboard HTML
  fs.writeFileSync(path.join(dist, 'index.html'), getDashboardHtml(), 'utf8');

  // 2. Copy static media & preview directories
  copyDirRecursive(path.join(root, 'media'), path.join(dist, 'media'));
  copyDirRecursive(path.join(root, 'preview'), path.join(dist, 'preview'));

  // 3. Copy JSON state/config/content for Cloudflare Pages Functions
  copyDirRecursive(path.join(root, 'config'), path.join(dist, 'config'));
  copyDirRecursive(path.join(root, 'content'), path.join(dist, 'content'));
  copyDirRecursive(path.join(root, 'state'), path.join(dist, 'state'));
  fs.writeFileSync(path.join(dist, 'state', 'samples.json'), JSON.stringify(SAMPLE_POSTS, null, 2), 'utf8');

  console.log('✓ Cloudflare Pages build complete -> dist/');
}

buildCloudflarePages().catch(err => {
  console.error('Cloudflare build failed:', err);
  process.exit(1);
});
