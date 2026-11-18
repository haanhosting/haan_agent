# SETUP_GUIDE.md – manual steps only YOU can do (all free)

## A. Instagram
1. In the Instagram app: Settings → Account type and tools → **Switch to professional account** (Business or Creator).
2. Set your profile bio link to `https://haanhosting.store`.

## B. Meta developer app (for the API token)
1. Go to developers.facebook.com → log in → **Create App** → use case "Other"/"Business" → app type **Business**.
2. Add the **Instagram** product → "API setup with Instagram login".
3. Add your Instagram account as a tester/under "Instagram → Roles" (your own account) and accept the invite in the Instagram app (Settings → Apps and websites → Tester invites).
4. Generate an access token for your account with permissions `instagram_business_basic` and `instagram_business_content_publish`.
5. Exchange it for a **long-lived token** (60 days) using the "Generate token"/exchange option in the dashboard
   (or `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=<APP_SECRET>&access_token=<SHORT_TOKEN>`).
6. Note your **Instagram user ID** (shown in the API setup page, or `GET https://graph.instagram.com/me?fields=user_id,username`).
The dashboard layout changes over time; if a step differs, follow Meta's current "Instagram Platform → Content Publishing" docs.

## C. GitHub
1. Create a free GitHub account → new **public** repo (public = unlimited free Actions minutes and free Pages).
   (Private works too but has 2,000 min/month and Pages may need a paid plan – prefer public.)
2. Push the project. In repo **Settings → Pages**: deploy from branch `main`, folder `/ (root)`.
3. In **Settings → Secrets and variables → Actions** add:
   - `IG_ACCESS_TOKEN` – long-lived token
   - `IG_USER_ID`
   - `GEMINI_API_KEY` – from aistudio.google.com (free, no card)
   - `GROQ_API_KEY` – optional second provider (console.groq.com, free)
   - `GH_PAT` – fine-grained personal access token limited to this repo (Secrets: read/write) for token refresh
4. In **Settings → Actions → General**: allow workflows read/write permissions.
5. Add a repository variable `PAGES_BASE_URL` = `https://<username>.github.io/<repo>`.

## D. First run checklist
1. `cp .env.example .env` and fill values (local testing only; never commit `.env`).
2. `npm install && npx playwright install chromium`
3. `npm run doctor` → everything green.
4. `npm run preview` → open `preview/index.html`, check the design.
5. `npm run publish -- --dry-run` → inspect the printed API calls.
6. Set `requireApproval: true` for the first week, review the queue, then switch to full auto.
7. Enable the workflows (Actions tab) and trigger `generate` manually once.

## E. Ongoing (about 2 minutes/month)
- Glance at the Actions tab for red runs. Token refresh is automatic.
- Update `config/brand.json → offers[]` when you run a real promotion.
