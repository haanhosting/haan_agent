# Architectural & Implementation Decisions

This file tracks all key decisions made during development, as required by the project specifications.

---

## 1. Runtime & Language
- **Decision:** Node.js 20+ with TypeScript (`tsx` for execution, `tsc` for type-checking).
- **Rationale:** Strict adherence to spec; zero compilation overhead during development using `tsx`, strong type safety via Zod schemas for all JSON configurations and LLM outputs.

## 2. LLM Provider Hierarchy
- **Decision:** 
  1. Google Gemini Developer API (free tier, model configurable via `config/providers.json`, default `gemini-2.0-flash` or `gemini-1.5-flash`).
  2. Groq free tier (`llama-3.3-70b-versatile` or `llama-3.1-8b-instant`) / OpenRouter free models as secondary.
  3. Offline content bank (`content/bank/*.json` with >= 60 pre-written posts) as the deterministic safety net.
- **Rationale:** Free tiers cost $0. Gemini offers generous RPM/TPM limits on AI Studio. If an API call fails or rate-limits after retries, the fallback chain ensures zero dropped days.

## 3. Template Engine & Rendering
- **Decision:** Pure HTML5/CSS with CSS variables (`--bg1`, `--bg2`, `--ink`, `--accent`, etc.), rendered using Playwright Chromium headless at exact 1080×1350 viewport, converted to high-quality JPEG (quality 88) via `sharp`.
- **Rationale:** Chromium rendering provides perfect CSS grid/flexbox, custom font rendering, SVG filters, text-overflow detection and auto font-scaling. Sharp produces optimized JPEGs compliant with Instagram's 4:5 ratio and 8MB limit.

## 4. State Management
- **Decision:** File-based state in `state/queue.json`, `state/history.json`, and `state/token.json`, committed directly to the git repository by GitHub Actions.
- **Rationale:** $0 cost, eliminates database provisioning and credentials. Git history provides complete audit logs. Concurrency locks in GitHub Actions prevent conflicting state writes.

## 5. Instagram Publishing Protocol
- **Decision:** Official Instagram Graph API (Instagram Login), single and carousel container creation + status polling + publish. Upload-Post adapter included as disabled fallback (`publisher: "instagram-graph"` by default).
- **Rationale:** Official API is free and allows 50 posts/24h without risk of account suspension. Upload-Post free tier is strictly capped at 10 posts/month, making it unsuitable for 4-5 posts/day.

## 6. Timezone & Scheduling
- **Decision:** Hardcoded UTC+5 offset (`Asia/Karachi`, no daylight saving time shifts). Scheduled slots:
  - Slot 1: 09:30 PKT (04:30 UTC)
  - Slot 2: 12:30 PKT (07:30 UTC)
  - Slot 3: 16:00 PKT (11:00 UTC)
  - Slot 4: 19:30 PKT (14:30 UTC)
  - Slot 5: 21:30 PKT (16:30 UTC)
- **Rationale:** Direct alignment with target Pakistani audience peak engagement hours while respecting GitHub Actions UTC cron.
