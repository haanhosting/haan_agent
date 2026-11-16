# Troubleshooting Guide

This guide covers common issues, root causes, and fixes for the **Haan Hosting Instagram Auto-Poster Agent**.

---

## 1. Instagram API Errors

### Error: `[IG Graph Error 190] Access token expired or invalid`
- **Root Cause:** Instagram long-lived tokens expire after 60 days if not refreshed.
- **Solution:**
  1. If the token is still within 60 days, run:
     ```bash
     npm run refresh-token
     ```
  2. If the token has completely expired, generate a new short-lived token from developers.facebook.com, exchange it for a long-lived token (see `SETUP_GUIDE.md §B`), and update `IG_ACCESS_TOKEN` in `.env` and GitHub Secrets.

### Error: `[IG Graph Rate Limit] Quota exceeded (code 4, 32, or 17)`
- **Root Cause:** Meta enforces a limit of 50 API-published posts per rolling 24 hours per account.
- **Solution:** The agent posts 4–5 times per day, using <10% of the daily quota. If this error occurs, verify that no external tools or duplicate workflows are publishing simultaneously. Run `npm run doctor` to check current quota usage.

### Container processing status `ERROR`
- **Root Cause:** Instagram could not download the image from GitHub Pages (e.g. image URL was unreachable, returned 404, or wasn't a standard JPEG).
- **Solution:** 
  - Ensure GitHub Pages is enabled on `main` branch root (`/`).
  - Verify `PAGES_BASE_URL` in `.env` or repository variables (e.g. `https://<username>.github.io/<repo>`).
  - The agent will automatically retry up to 3 times before marking the post `failed`.

---

## 2. GitHub Actions & Scheduling

### Posts publish a few minutes later than scheduled
- **Root Cause:** GitHub Actions cron triggers run in UTC and can experience 5–20 minute queue delays during peak hours on GitHub's free runners.
- **Solution:** This is normal and expected behavior. `publish.yml` runs every 15 minutes and publishes any post where `scheduledAt <= now`. Timing is safe and idempotent.

### Workflow concurrency errors
- **Root Cause:** Multiple publish runs trying to modify state at the same time.
- **Solution:** `publish.yml` uses `concurrency: { group: publish-lock, cancel-in-progress: false }` to strictly serialize executions.

---

## 3. Media & Rendering

### Playwright Chromium not found
- **Root Cause:** Playwright browser binaries are not installed locally or in CI.
- **Solution:**
  ```bash
  npx playwright install chromium
  ```

### Blank or misaligned fonts
- **Root Cause:** Google Fonts blocked by firewall or network drop.
- **Solution:** The agent bundles all fonts locally (`Inter`, `Outfit`, `Space Grotesk`) in `templates/_shared/fonts/fonts-inlined.css`. No external internet connection is required during rendering.

---

## 4. AI & Content Generation

### All LLM providers failed / out of quota
- **Behavior:** The agent uses an automatic 4-tier fallback chain:
  `Google Gemini → Groq → OpenRouter → Offline Content Bank (66 posts)`
- **Result:** Even if all external LLM APIs fail or network is down, the agent pulls from `content/bank/posts.json`. A posting day is **never** skipped.

---

## 5. Doctor & Health Check

Run the built-in diagnostic tool anytime to verify system readiness:
```bash
npm run doctor
```
Checks Node.js version, local font bundles, 12 templates, content bank integrity, token health, and API reachability.
