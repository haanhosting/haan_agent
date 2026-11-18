# FREE_STACK.md – everything is $0

| Need | Tool | Why free / limits |
|---|---|---|
| Code runtime | Node.js 20 + TypeScript | Open source |
| Scheduler / server | **GitHub Actions** | Free. Public repo = unlimited minutes. Private = 2,000 min/month (enough: ~5 min/day generate + short publish checks). Cron runs in **UTC** and can be delayed 5–20 min. |
| State storage | JSON files in the git repo | Free |
| Image hosting (Instagram needs a **public URL**) | **GitHub Pages** (same repo, `media/` folder) | Free. Soft limit 1 GB site / 100 GB/month bandwidth – a JPEG ≈ 250 KB so ~400 MB/year. Prune media older than 60 days. |
| Image rendering | **Playwright (Chromium)** + `sharp` | Open source. Installs in GitHub Actions for free. |
| Fonts | Google Fonts files bundled locally (Poppins, Inter, Outfit, Sora, Space Grotesk, Playfair Display, Baloo/Bebas Neue for display) | OFL licensed |
| Icons/shapes | Inline SVG, Lucide / Phosphor icons (MIT) | Free |
| Text generation (LLM) | **Google Gemini API free tier** (key from Google AI Studio) – primary. **Groq free tier** or **OpenRouter `:free` models** – secondary. **Offline content bank** – last resort. | Free tiers have rate limits; generating 5 posts/day is a tiny load. No card needed. Model names change: put them in `config/providers.json`, never hard-code. |
| Publishing | **Instagram Graph API** (Instagram API with Instagram Login) | Free. Limit: 50 API posts / rolling 24h per account; carousel = 1 post. We use ≤ 5/day. |
| Alerts | GitHub Actions failure e-mails | Free |
| Tests | Vitest | Free |

## Hard rules for the CLI
1. Do not add any dependency or service that needs a credit card, trial, or paid tier.
2. If a free tier is exceeded, degrade gracefully (fallback provider → content bank), never fail the whole day.
3. Keep repo small: render at 1080×1350, JPEG quality ~88, delete old media via a prune script.
4. Instagram **requires JPEG** for API image posts – never upload PNG/WebP.

## Limits cheat-sheet
- Instagram API: 50 posts / 24h; image must be public, JPEG; feed aspect ratio between 4:5 and 1.91:1; carousel up to 10 items; caption ≤ 2,200 chars; ≤ 30 hashtags (we use ≤ 15).
- GitHub Pages propagation after a push: usually under a minute, sometimes a few – poll the URL.
- Instagram long-lived token: valid 60 days; refresh once it is ≥ 24h old and before expiry (we refresh weekly).
