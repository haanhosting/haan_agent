import { Command } from 'commander';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env
dotenv.config();

import { generateDailyPosts, loadScheduleConfig, PreparedPost } from './content/slotMapper.js';
import { loadQueue, saveQueue, loadHistory, getDuePosts, updatePostStatus, enqueuePosts } from './state/stateManager.js';
import { renderSlide, closeBrowser } from './render/renderer.js';
import { generatePreviews } from './render/preview.js';
import { publishPost, getActivePublisherType } from './publish/publisher.js';
import { checkUploadPostConnection } from './publish/uploadPost.js';
import { refreshInstagramToken, loadTokenState } from './publish/tokenRefresh.js';
import { getPublicMediaUrl } from './publish/mediaHost.js';
import { getKarachiNow, getNextDayKarachi } from './schedule/scheduler.js';
import { pruneOldMedia } from './schedule/pruneMedia.js';
import { InstagramGraphClient } from './publish/instagramGraph.js';

const program = new Command();

program
  .name('haan-insta-agent')
  .description('Autonomous Instagram content generation and publishing agent for Haan Hosting')
  .version('1.0.0');

/**
 * COMMAND: generate
 */
program
  .command('generate')
  .description('Generate daily post ideas and queue them for a target date')
  .option('-d, --date <date>', 'Target date (YYYY-MM-DD), defaults to next day in Asia/Karachi')
  .option('-p, --posts <number>', 'Number of posts for the day (4 or 5)')
  .option('-r, --render', 'Render generated posts immediately after generation', false)
  .action(async (options) => {
    try {
      const targetDate = options.date || getNextDayKarachi();
      const schedule = loadScheduleConfig();
      const postsCount = options.posts ? parseInt(options.posts, 10) : schedule.postsPerDay;

      console.log(`\n=== GENERATING POSTS FOR ${targetDate} (Asia/Karachi) ===`);
      const history = loadHistory();

      const newPosts = await generateDailyPosts({
        date: targetDate,
        history,
        postsPerDay: postsCount
      });

      enqueuePosts(newPosts);

      if (options.render) {
        console.log('\n=== RENDERING GENERATED POSTS ===');
        await renderPostsForDate(targetDate);
      }

      console.log(`\n✓ Generation complete for ${targetDate}. Total posts queued: ${newPosts.length}`);
    } catch (err: any) {
      console.error(`\n❌ Generation failed: ${err.message}`);
      process.exit(1);
    }
  });

/**
 * Helper to render queued posts for a date
 */
async function renderPostsForDate(targetDate?: string, force = false): Promise<void> {
  const queue = loadQueue();
  const eligible = queue.filter(p => (!targetDate || p.date === targetDate) && (force || p.images.length === 0));

  if (eligible.length === 0) {
    console.log('[Render] No posts require rendering.');
    return;
  }

  console.log(`[Render] Rendering images for ${eligible.length} post(s)...`);

  for (const post of eligible) {
    console.log(`\nRendering post: ${post.id} (Template: ${post.template}, Palette: ${post.design.palette})`);
    const dateDir = path.resolve(process.cwd(), 'media', post.date);
    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }

    const images: string[] = [];
    const imageUrls: string[] = [];

    for (let sIdx = 0; sIdx < post.slides.length; sIdx++) {
      const slideData = post.slides[sIdx];
      const filename = post.slides.length > 1
        ? `slot${post.slot}-${sIdx + 1}.jpg`
        : `slot${post.slot}.jpg`;
      const localRelPath = `media/${post.date}/${filename}`;
      const outputPath = path.join(dateDir, filename);

      await renderSlide({
        templateId: post.template,
        paletteId: post.design.palette,
        seed: post.design.seed,
        decoration: post.design.decoration,
        layoutVariant: post.design.layoutVariant,
        data: slideData,
        outputPath
      });

      images.push(localRelPath);
      imageUrls.push(getPublicMediaUrl(localRelPath));
      console.log(`  ✓ Rendered slide ${sIdx + 1}/${post.slides.length} -> ${localRelPath}`);
    }

    post.images = images;
    post.imageUrls = imageUrls;
  }

  saveQueue(queue);
  await closeBrowser();
  console.log('\n✓ All rendered images written and queue updated.');
}

/**
 * COMMAND: render
 */
program
  .command('render')
  .description('Render queued posts to JPEG images (1080x1350)')
  .option('-d, --date <date>', 'Filter by date (YYYY-MM-DD)')
  .option('-f, --force', 'Force re-render even if images already exist', false)
  .action(async (options) => {
    try {
      await renderPostsForDate(options.date, options.force);
    } catch (err: any) {
      console.error(`\n❌ Render failed: ${err.message}`);
      process.exit(1);
    }
  });

/**
 * COMMAND: publish
 */
program
  .command('publish')
  .description('Publish due posts to Instagram')
  .option('--dry-run', 'Print exact API calls without sending them', false)
  .option('-p, --post-id <id>', 'Publish a specific post ID immediately')
  .option('--skip-wait', 'Skip waiting for public media URL propagation', false)
  .action(async (options) => {
    try {
      const dryRun = Boolean(options.dryRun);
      console.log(`\n=== PUBLISHER RUN (Dry Run: ${dryRun}) ===`);

      // Prune old media (> 60 days) to keep repo small
      pruneOldMedia(60);

      let postsToPublish: PreparedPost[] = [];

      if (options.postId) {
        const queue = loadQueue();
        const found = queue.find(p => p.id === options.postId);
        if (!found) throw new Error(`Post ID ${options.postId} not found in queue`);
        postsToPublish = [found];
      } else {
        postsToPublish = getDuePosts();
      }

      if (postsToPublish.length === 0) {
        console.log('[Publisher] No posts are currently due for publishing.');
        return;
      }

      console.log(`[Publisher] Found ${postsToPublish.length} post(s) to publish.`);

      for (const post of postsToPublish) {
        console.log(`\nPublishing Post: ${post.id} (Scheduled: ${post.scheduledAt})`);

        if (!dryRun) {
          updatePostStatus(post.id, 'publishing');
        }

        try {
          const result = await publishPost(post, {
            dryRun,
            skipMediaWait: options.skipWait
          });

          if (!dryRun) {
            updatePostStatus(post.id, 'posted', { igMediaId: result.igMediaId });
            console.log(`✓ Post ${post.id} successfully published to Instagram! ID: ${result.igMediaId}`);
          } else {
            console.log(`✓ [DRY-RUN] Post ${post.id} simulated publish successful!`);
          }
        } catch (err: any) {
          console.error(`❌ Failed to publish post ${post.id}: ${err.message}`);
          if (!dryRun) {
            updatePostStatus(post.id, 'queued', { error: err.message });
          }
        }
      }
    } catch (err: any) {
      console.error(`\n❌ Publisher fatal error: ${err.message}`);
      process.exit(1);
    }
  });

/**
 * COMMAND: preview
 */
program
  .command('preview')
  .description('Generate sample renders for all 12 templates into preview/ + contact sheet')
  .action(async () => {
    try {
      console.log('\n=== GENERATING 12 TEMPLATE PREVIEWS ===');
      const res = await generatePreviews();
      console.log(`\n✓ Preview generation complete!`);
      console.log(`• Contact Sheet: ${res.contactSheetPath}`);
      console.log(`• Gallery HTML: ${res.htmlPath}`);
    } catch (err: any) {
      console.error(`\n❌ Preview failed: ${err.message}`);
      process.exit(1);
    }
  });

/**
 * COMMAND: refresh-token
 */
program
  .command('refresh-token')
  .description('Refresh long-lived Instagram Graph API access token before 60-day expiry')
  .option('--dry-run', 'Simulate token refresh without sending request', false)
  .action(async (options) => {
    try {
      console.log('\n=== REFRESHING INSTAGRAM LONG-LIVED ACCESS TOKEN ===');
      const res = await refreshInstagramToken({ dryRun: options.dryRun });
      console.log(`✓ Token refreshed! Valid until: ${res.expiresAt} (${res.daysLeft} days remaining)`);
    } catch (err: any) {
      console.error(`\n❌ Token refresh failed: ${err.message}`);
      process.exit(1);
    }
  });

/**
 * COMMAND: doctor
 */
program
  .command('doctor')
  .description('Run system diagnostic health checks on templates, environment, and connectivity')
  .action(async () => {
    console.log('\n======================================================');
    console.log('       HAAN HOSTING INSTAGRAM AGENT · DOCTOR CHECK    ');
    console.log('======================================================\n');

    let allOk = true;

    // 1. Node Version Check
    const nodeVer = process.version;
    const major = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
    if (major >= 20) {
      console.log(`[PASS] Node.js version: ${nodeVer} (>= 20)`);
    } else {
      console.log(`[FAIL] Node.js version ${nodeVer} is below required v20+`);
      allOk = false;
    }

    // 2. Bundled Fonts Check
    const fontsDir = path.resolve(process.cwd(), 'templates/_shared/fonts');
    const inlinedFonts = path.join(fontsDir, 'fonts-inlined.css');
    if (fs.existsSync(inlinedFonts)) {
      console.log(`[PASS] Bundled Google Fonts present (fonts-inlined.css: ${(fs.statSync(inlinedFonts).size / 1024).toFixed(1)} KB)`);
    } else {
      console.log(`[FAIL] Bundled fonts missing at ${inlinedFonts}`);
      allOk = false;
    }

    // 3. 12 Templates Verification
    const templatesDir = path.resolve(process.cwd(), 'templates');
    const expected = ['T01-bold-statement', 'T02-split-card', 'T03-checklist', 'T04-big-number', 'T05-offer-poster', 'T06-quote-card', 'T07-myth-fact', 'T08-browser-mockup', 'T09-terminal', 'T10-question-poll', 'T11-carousel', 'T12-minimal-editorial'];
    let templateOk = true;
    for (const t of expected) {
      if (!fs.existsSync(path.join(templatesDir, t, 'template.html')) || !fs.existsSync(path.join(templatesDir, t, 'meta.json'))) {
        console.log(`[FAIL] Template ${t} is missing files`);
        templateOk = false;
        allOk = false;
      }
    }
    if (templateOk) {
      console.log(`[PASS] All 12 launch templates verified with meta.json and template.html`);
    }

    // 4. Offline Content Bank
    const bankFile = path.resolve(process.cwd(), 'content/bank/posts.json');
    if (fs.existsSync(bankFile)) {
      const bank = JSON.parse(fs.readFileSync(bankFile, 'utf8'));
      if (bank.length >= 60) {
        console.log(`[PASS] Offline Content Bank verified with ${bank.length} posts (>= 60)`);
      } else {
        console.log(`[WARN] Offline Content Bank has ${bank.length} posts (< 60)`);
      }
    } else {
      console.log(`[FAIL] Offline Content Bank missing at ${bankFile}`);
      allOk = false;
    }

    // 5. Environment Variables
    const activePub = getActivePublisherType();
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const uploadPostKey = process.env.UPLOADPOST_API_KEY;
    const uploadPostUser = process.env.UPLOADPOST_USER;
    const igToken = process.env.IG_ACCESS_TOKEN;
    const igUser = process.env.IG_USER_ID;
    const pagesUrl = process.env.PAGES_BASE_URL;

    console.log('\n--- Publisher & Environment ---');
    console.log(`  Active Publisher:   ${activePub}`);
    console.log(`  UPLOADPOST_API_KEY: ${uploadPostKey ? 'Configured [OK]' : 'Not set (get from https://app.upload-post.com/dashboard)'}`);
    console.log(`  UPLOADPOST_USER:    ${uploadPostUser ? uploadPostUser + ' [OK]' : 'Not set (will auto-detect from Upload-Post profile)'}`);
    console.log(`  GEMINI_API_KEY:     ${geminiKey ? 'Configured [OK]' : 'Not set (will fallback to Groq/Bank)'}`);
    console.log(`  GROQ_API_KEY:       ${groqKey ? 'Configured [OK]' : 'Not set'}`);
    console.log(`  IG_ACCESS_TOKEN:    ${igToken ? 'Configured [OK]' : 'Not set (only needed for instagram-graph mode)'}`);
    console.log(`  IG_USER_ID:         ${igUser ? 'Configured [OK]' : 'Not set (only needed for instagram-graph mode)'}`);
    console.log(`  PAGES_BASE_URL:     ${pagesUrl ? pagesUrl + ' [OK]' : 'Not set (not required when Upload-Post uploads local files)'}`);

    if (uploadPostKey) {
      console.log('\nTesting Upload-Post API connection...');
      const upHealth = await checkUploadPostConnection();
      if (upHealth.ok) {
        const profileSummary = upHealth.profiles.length > 0
          ? upHealth.profiles.map(p => `${p.username} (IG: ${p.hasInstagram ? 'Connected' : 'Not linked'})`).join(', ')
          : 'No profiles created yet';
        console.log(`[PASS] Upload-Post API connected! Active profile: ${upHealth.resolvedUser || 'none'} | Profiles: ${profileSummary}`);
      } else {
        console.log(`[WARN] Upload-Post API check failed: ${upHealth.error}`);
      }
    }

    // 6. Token Metadata Check
    const tokenState = loadTokenState();
    console.log('\n--- Instagram Graph Token Health (Optional Fallback) ---');
    console.log(`  Status:             ${tokenState.status}`);
    console.log(`  Last Refreshed:     ${tokenState.lastRefreshed || 'Never'}`);
    console.log(`  Days Left:          ${tokenState.daysLeft !== null ? tokenState.daysLeft + ' days' : 'Unknown'}`);

    if (igToken && igUser) {
      try {
        console.log('\nTesting Instagram Graph API connection...');
        const client = new InstagramGraphClient();
        const quota = await client.checkPublishingLimit(false);
        console.log(`[PASS] Instagram Graph API connected! Quota: ${quota.quotaUsage}/${quota.configTotal} posts in 24h`);
      } catch (err: any) {
        console.log(`[WARN] Instagram Graph API connection check: ${err.message}`);
      }
    }

    console.log('\n======================================================');
    if (allOk) {
      console.log('Doctor Result: SYSTEM READY FOR LOCAL RUNS & DRY-RUNS');
    } else {
      console.log('Doctor Result: SOME CHECKS FAILED. Review warnings above.');
    }
    console.log('======================================================\n');
  });

program.parse(process.argv);
