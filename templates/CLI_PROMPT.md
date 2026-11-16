# CLI PROMPT – paste everything below into Claude Code

---

You are a senior full-stack engineer and designer. Build the complete project described in the spec files located in
the current folder. **First read all of these files fully:** `README.md`, `PROJECT_SPEC.md`, `ARCHITECTURE.md`,
`FREE_STACK.md`, `TEMPLATES.md`, `STYLE_REFERENCE.md`, `CONTENT_STRATEGY.md`, `INSTAGRAM_PUBLISHING.md`, `SETUP_GUIDE.md`.
They are the source of truth. **`STYLE_REFERENCE.md` is the owner-approved visual style: the posts must look exactly like
those four designs (flat, bold, high-contrast, solid colors, label top-left, footer bottom-left). Build the templates from
its HTML snippets and make every other template match that style.** If anything conflicts, the order of priority is: `PROJECT_SPEC.md` > `FREE_STACK.md` >
the rest. Do not ask me questions unless something is truly blocking; make sensible decisions, record them in `DECISIONS.md`.

## Mission
Create an AI agent for my business **Haan Hosting (https://haanhosting.store)** that automatically creates
**4–5 unique, attractive Instagram posts per day** from **pre-built templates** and **publishes them automatically**.
**Budget is exactly $0** – use only free tools and free tiers, no credit card anywhere.

## Critical constraints
1. Free only: Node.js 20 + TypeScript, Playwright, sharp, Vitest, GitHub Actions (cron), GitHub Pages (image hosting),
   Google Gemini free tier (primary LLM), Groq or OpenRouter free models (secondary), offline content bank (last resort).
2. Publishing uses the official **Instagram Graph API** (Instagram Login) – free, 50 posts/24h. The Upload-Post
   free plan allows only 10 uploads/month, so implement it only as an optional disabled fallback adapter.
3. Instagram requires **JPEG at a public URL**, 1080×1350 (4:5). Carousels up to 10 slides.
4. Never invent prices, discounts, uptime numbers, testimonials or features about Haan Hosting. Fetch
   https://haanhosting.store (WebFetch) and build `config/brand.json` from what is really there; put `TODO`
   where information is missing. Offers only from `brand.json → offers[]`.
5. Never hard-code secrets; use `.env` (gitignored) and GitHub secrets. Provide `.env.example`.
6. Model names and API versions go in config files, not scattered in code. Before coding any third-party API call,
   check its current official docs (web search/fetch) because endpoints and model names change.
7. The system must never skip a day because an LLM failed: provider fallback chain → content bank.
8. Idempotent publishing: no duplicate posts, ever.

## Work plan – execute in this order, verifying each phase before the next
**Phase 0 – Setup:** init repo, `package.json`, `tsconfig`, lint/format, folder structure from `ARCHITECTURE.md`, `.gitignore`, `.env.example`, `DECISIONS.md`.

**Phase 1 – Brand & config:** fetch the website, create `config/brand.json`, `schedule.json`, `providers.json`, `content/pillars.json`, `content/hashtags.json`. Download/derive logo + brand colors.

**Phase 2 – Template system:** build the 12 templates in `TEMPLATES.md` (HTML/CSS with CSS variables), shared base CSS, bundled
Google Fonts (OFL), ≥ 10 palettes, ≥ 8 decorations, 3 layout variants each, carousel family. Make them genuinely **beautiful and modern**
(use the `frontend-design` skill/approach if available): strong typography, spacing, gradients, subtle shadows, brand footer.
Implement the Playwright renderer with auto text-fit and JPEG export. Create a preview command rendering every template with
sample text into `preview/index.html` + a contact sheet. **Open the rendered images and visually inspect them**; fix any overflow,
low contrast or ugly spacing until all 12 look professional at phone size.

**Phase 3 – Uniqueness engine:** implement rules from `TEMPLATES.md §4`, seeded randomness, history tracking, headline-similarity guard. Unit tests.

**Phase 4 – Content generator:** LLM clients (Gemini, Groq/OpenRouter) behind one interface with retry/backoff, zod-validated JSON output,
prompt builder per `CONTENT_STRATEGY.md §7`, validator (truthfulness guardrails, limits), pillar balancing, slot-to-pillar mapping.
Write the **offline content bank with ≥ 60 high-quality posts** (original, accurate, varied). Unit tests with mocked LLM.

**Phase 5 – Publisher:** Instagram Graph API client (single + carousel, status polling, quota check, error matrix from
`INSTAGRAM_PUBLISHING.md`), media-host helper that waits for the GitHub Pages URL to return 200 `image/jpeg`,
token refresh logic, optional Upload-Post adapter (disabled), `--dry-run` that prints exact requests without sending. Mock-based tests.

**Phase 6 – Scheduler & state:** Asia/Karachi slot logic, `state/queue.json` + `history.json`, due-post selection, approval flag,
retry/failed handling, crash-safe status transitions, media pruning (> 60 days).

**Phase 7 – CLI & workflows:** `src/cli.ts` with commands `generate | render | publish | preview | refresh-token | doctor`.
GitHub Actions: `generate.yml` (nightly ~00:30 PKT), `publish.yml` (every 15 min, concurrency-locked), `refresh-token.yml` (weekly),
with correct UTC cron conversions, caching of npm + Playwright browsers, minimal permissions, commits by `github-actions[bot]`
(use `[skip ci]` where appropriate to avoid loops). Validate with `actionlint` if available.

**Phase 8 – QA & docs:** run all tests, run an end-to-end local simulation (generate 5 posts → render → dry-run publish),
re-inspect the images, write the final root `README.md` (setup in < 10 steps, referencing `SETUP_GUIDE.md`), and a `TROUBLESHOOTING.md`.

## Definition of done
All acceptance criteria in `PROJECT_SPEC.md §6` are checked off, tests pass, `npm run preview` produces 5 visibly different
on-brand posts, and `npm run publish -- --dry-run` works. Do NOT actually post to Instagram – I will add my secrets and
enable the workflows myself afterwards.

## How to work
- Use a task list; work phase by phase; commit after each phase with clear messages.
- Use sub-agents for independent chunks (e.g., templates vs. publisher) when it speeds things up.
- After finishing, give me: (1) a short summary, (2) the exact commands to run first, (3) the list of manual steps from `SETUP_GUIDE.md` I still must do, (4) any assumptions/TODOs (especially missing brand info from the website).

Start now with Phase 0.
