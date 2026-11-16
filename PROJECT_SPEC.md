# PROJECT_SPEC.md

## 1. Goal
Fully automated Instagram content pipeline for **Haan Hosting** (https://haanhosting.store):
generate → design → host → publish, 4–5 posts per day, zero ongoing cost, minimal human work.

## 2. Brand
Brand details live in `config/brand.json`. The CLI must **fetch https://haanhosting.store**
and extract: tagline, services (hosting plans, domains, SSL, etc.), real plan names, real prices
(only if clearly shown on the site), contact info, colors and logo style. Anything not found stays a
`TODO` placeholder – **never invent prices, discounts, uptime numbers, testimonials or features.**

Default brand assumptions (override from the website if different):
- Name: Haan Hosting
- Website: haanhosting.store
- Audience: small businesses, students, freelancers, shop owners, bloggers (Pakistan-focused, English with optional Roman Urdu)
- Voice: friendly, confident, simple language, no jargon walls, no hype lies

## 3. Functional requirements
1. **Content generator** – produces N posts/day (default 5, configurable 4–5) as structured JSON (see ARCHITECTURE.md).
2. **Template engine** – pre-built HTML/CSS templates rendered to 1080×1350 JPEG (4:5). Carousel support (up to 10 slides, 1080×1350).
3. **Uniqueness engine** – no two posts in a 14-day window share the same template + palette + decoration combo. Posts must look varied but still on-brand.
4. **Publisher** – posts via Instagram Graph API (single image + carousel). Scheduled slots in Asia/Karachi time.
5. **Scheduler** – GitHub Actions cron: nightly generation job + frequent "publish due posts" job.
6. **State** – JSON files committed to the repo (queue, history, token metadata). No database.
7. **Dry-run / preview mode** – render everything and produce an `preview/index.html` gallery without posting.
8. **Approval mode (optional)** – config flag `requireApproval`; when true, posts publish only if the queue item has `approved: true`.
9. **Logging + failure alerts** – clear logs; failed posts retried (max 3) then marked `failed`; GitHub Actions failure email is the alert channel (free).
10. **Token auto-refresh** – long-lived Instagram token refreshed automatically before expiry.

## 4. Non-functional requirements
- Language: **Node.js 20 + TypeScript**. Minimal dependencies.
- **Everything free**: no paid APIs, no credit card, no paid hosting.
- Deterministic fallbacks: if the LLM is down/out of quota, use the built-in content bank (`content/bank/*.json`) so a day never goes unposted.
- Idempotent: re-running a job must never double-post.
- Secrets only in GitHub Actions secrets / local `.env` (gitignored). Never committed or logged.
- Fully runnable locally: `npm run generate`, `npm run render`, `npm run publish -- --dry-run`.

## 5. Non-goals
- Reels/video (can be added later), Stories, DMs, comment automation, follower growth tricks, buying anything.
- Scraping Instagram or using unofficial/private APIs (account-ban risk). Official Graph API only.

## 6. Acceptance criteria
- [ ] `npm run preview` generates 5 distinct sample posts (different templates/palettes) in `preview/`.
- [ ] Every rendered image is exactly 1080×1350 JPEG, < 8 MB, text never overflows or clips.
- [ ] Arabic/Urdu script not required; English + Roman Urdu text renders correctly with bundled fonts.
- [ ] `npm run publish -- --dry-run` prints the exact API calls without sending them.
- [ ] GitHub workflows validate (`actionlint` clean) and use only free runners.
- [ ] Unit tests pass for: uniqueness engine, caption validator, scheduler/slot logic, token-refresh logic.
- [ ] No secrets in repo; `.env.example` provided.
- [ ] README in the project root explains setup in under 10 steps.
