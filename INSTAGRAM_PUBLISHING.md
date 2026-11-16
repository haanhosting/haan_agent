# INSTAGRAM_PUBLISHING.md

## 1. Chosen method: Instagram API with Instagram Login (official, free)
Requirements:
- Instagram account converted to **Professional** (Business or Creator) – free, done in the app.
- A free Meta developer app (developers.facebook.com) with the Instagram product added.
- Permissions: `instagram_business_basic`, `instagram_business_content_publish`.
- While the app is in **Development mode**, the app's own admin/tester accounts can publish to their own Instagram
  account without App Review – that is all we need (we only post to our own account).
- Images must be **JPEG** and reachable at a **public URL** (Instagram downloads them).
- Limit: 50 API-published posts per rolling 24h; a carousel counts as 1.

The owner generates a token once (see SETUP_GUIDE.md); the agent keeps it fresh afterwards.

## 2. API flow (host `https://graph.instagram.com`, version configurable, e.g. `v23.0`+ – check current docs)
**Single image**
1. `POST /{ig-user-id}/media` with `image_url`, `caption`, `alt_text` (optional) → returns `creation_id`.
2. Poll `GET /{creation_id}?fields=status_code` until `FINISHED` (timeout ~60s, `ERROR`/`EXPIRED` → fail).
3. `POST /{ig-user-id}/media_publish` with `creation_id` → returns the media ID.

**Carousel**
1. For each slide: `POST /{ig-user-id}/media` with `image_url` and `is_carousel_item=true` → child IDs.
2. `POST /{ig-user-id}/media` with `media_type=CAROUSEL`, `children=id1,id2,…`, `caption`.
3. Poll status, then `media_publish`.

Before publishing: `GET /{ig-user-id}/content_publishing_limit` to confirm quota remains.
Auth: `Authorization: Bearer <token>` header or `access_token` param. Never log the token.

## 3. Token management
- Store the long-lived token in GitHub secret `IG_ACCESS_TOKEN`; `IG_USER_ID` in `IG_USER_ID`.
- Long-lived tokens last 60 days. `refresh-token.yml` (weekly) calls
  `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<token>`
  and writes the new token back to the repo secret via the GitHub API using a fine-grained PAT (`GH_PAT` secret, `secrets:write` on this repo).
- If refresh fails, the workflow fails loudly (GitHub e-mail) with instructions to regenerate the token manually.
- `npm run doctor` checks: token valid, days left, user id matches, publishing quota, Pages URL reachable, fonts present.

## 4. Error handling matrix
| Situation | Action |
|---|---|
| Image URL not yet live (404) | wait/poll up to 3 min, then retry later |
| Container status `ERROR` | log reason, re-render once, retry; after 3 attempts → `failed` |
| Rate limit / 4xx quota | stop publishing, retry next run |
| Token expired/invalid (code 190) | mark run failed, alert via failed workflow, do not retry endlessly |
| Network/5xx | exponential backoff 3 tries |
| Crash between create & publish | on next run check recent media/caption hash before re-publishing → no duplicates |

## 5. Optional fallback adapter: Upload-Post (disabled by default)
Upload-Post offers a one-call API (`POST https://api.upload-post.com/api/upload_photos`, header `Authorization: Apikey …`,
form fields `photos[]`, `title`, `user`, `platform[]=instagram`) and handles Instagram auth for you.
**But the free plan is only 10 uploads/month**, so it cannot sustain 4–5 posts/day. Implement it as
`src/publish/uploadPost.ts` behind `providers.json → publisher: "uploadpost"`, useful for first tests or emergencies.
Verify the current endpoint/fields in their docs before coding (APIs change).

## 6. Compliance
Official API only. No scraping, no unofficial login libraries, no follow/like/comment bots (ban risk).
Spread posts through the day (never burst-post). Keep content original and truthful (see CONTENT_STRATEGY.md §5).
