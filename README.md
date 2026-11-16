# Haan Hosting – Instagram Auto-Poster Agent

An autonomous AI agent that automatically designs **4–5 unique, on-brand Instagram posts per day** for [Haan Hosting](https://haanhosting.store) and **publishes them on schedule** — running at **$0 monthly cost** using official free tiers.

---

## ⚡ Quick Start (< 10 Steps)

Follow these steps to set up and run the agent locally or via GitHub Actions:

1. **Clone & Install Dependencies**
   ```bash
   git clone <repo-url>
   cd haan-insta-agent
   npm install
   npx playwright install chromium
   ```

2. **Configure Environment Secrets**
   ```bash
   cp .env.example .env
   ```
   Fill in your keys in `.env` (Google Gemini API key, Instagram Graph token, user ID). Refer to [SETUP_GUIDE.md](SETUP_GUIDE.md) for step-by-step instructions on obtaining free Meta & Google tokens.

3. **Run System Diagnostic Check**
   ```bash
   npm run doctor
   ```
   Ensures Node 20+, Playwright, bundled fonts, 12 templates, and environment secrets are ready.

4. **Preview All 12 Launch Templates**
   ```bash
   npm run preview
   ```
   Renders all templates with sample text and creates `preview/index.html` and `preview/contact-sheet.jpg`.

5. **Generate Tomorrow's Daily Posts**
   ```bash
   npm run generate -- --render
   ```
   Asks the AI (or fallback content bank) to generate the daily queue, picks unique designs, and renders 1080×1350 JPEGs.

6. **Simulate Publishing (Safe Dry-Run)**
   ```bash
   npm run publish -- --dry-run
   ```
   Simulates media reachability, checks publishing quota, and prints the exact Instagram Graph API calls without publishing.

7. **Push to a Public GitHub Repository**
   Create a free GitHub repository and push your code. In repository **Settings → Pages**, set branch to `main` and folder to `/ (root)`.

8. **Add GitHub Secrets & Variables**
   Under **Settings → Secrets and variables → Actions**:
   - Secrets: `IG_ACCESS_TOKEN`, `IG_USER_ID`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `GH_PAT`
   - Variables: `PAGES_BASE_URL` (e.g. `https://<username>.github.io/<repo>`)

9. **Enable Automated GitHub Workflows**
   - `generate.yml`: Runs nightly (~00:30 PKT / 19:30 UTC) to prepare the next day's posts.
   - `publish.yml`: Runs every 15 minutes with concurrency locking to publish due posts.
   - `refresh-token.yml`: Runs weekly to refresh the 60-day Instagram token automatically.

---

## 🏗️ Architecture & Features

- **100% Free Stack ($0/month):** Node.js 20, TypeScript, Playwright Chromium, Sharp, GitHub Actions, GitHub Pages, Google Gemini free tier.
- **12 Modern Launch Templates:** HTML/CSS with CSS variables, auto text-fit, bundled offline fonts (Inter, Outfit, Space Grotesk), ≥10 palettes, and ≥8 SVG decorations.
- **Strict Anti-Repeat Engine:** Enforces no template reuse within 3 days, no palette reuse within 4 days, brand color in ≥2 of 5 posts, and Jaccard token similarity guard against headline repeats.
- **Zero-Downtime Fallback Chain:** `Google Gemini → Groq → OpenRouter → Offline Content Bank (66 pre-written verified posts)`.
- **Official Instagram Graph API:** Uses the official Instagram Login API (50 posts/24h limit, carousels up to 10 slides). Includes optional disabled Upload-Post adapter.
- **Truthfulness Guardrails:** Enforces real plans and prices directly from [haanhosting.store](https://haanhosting.store). Prohibits invented claims, discounts, or fake "100% uptime".

---

## 🛠️ CLI Commands

| Command | Description |
|---|---|
| `npm run doctor` | Runs diagnostics on templates, fonts, API quota, and environment |
| `npm run preview` | Renders all 12 templates into `preview/index.html` + contact sheet |
| `npm run generate` | Generates posts for a date (`--date YYYY-MM-DD`, `--render`) |
| `npm run render` | Renders queued posts to 1080×1350 JPEGs |
| `npm run publish -- --dry-run` | Prints exact API calls without publishing |
| `npm run refresh-token` | Refreshes long-lived Instagram token |
| `npm test` | Runs complete Vitest test suite |
| `npm run lint` | Runs TypeScript type check (`tsc --noEmit`) |

---

## 📖 Documentation Reference

- [SETUP_GUIDE.md](SETUP_GUIDE.md) — Manual setup for Meta developer tokens & GitHub configuration
- [PROJECT_SPEC.md](PROJECT_SPEC.md) — Detailed specifications, acceptance criteria, brand rules
- [TEMPLATES.md](TEMPLATES.md) — The 12 template designs, palettes, and uniqueness rules
- [CONTENT_STRATEGY.md](CONTENT_STRATEGY.md) — Content pillars, schedule slots, caption guidelines
- [INSTAGRAM_PUBLISHING.md](INSTAGRAM_PUBLISHING.md) — Graph API flows, token management, error matrix
- [DECISIONS.md](DECISIONS.md) — Record of architectural and implementation decisions
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — Common error codes, token renewal, and fixes
