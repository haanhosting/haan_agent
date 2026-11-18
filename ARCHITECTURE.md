# ARCHITECTURE.md

## Folder layout (target)

```
haan-insta-agent/
├─ config/
│  ├─ brand.json            # name, url, colors, fonts, logo, services, voice
│  ├─ schedule.json         # postsPerDay, slots (Asia/Karachi), requireApproval
│  └─ providers.json        # llm provider order, publisher selection
├─ content/
│  ├─ bank/                 # offline fallback posts (JSON), 60+ items
│  └─ pillars.json          # content pillars + weights (see CONTENT_STRATEGY.md)
├─ templates/
│  ├─ _shared/              # base.css, fonts/, icons/, shapes/ (SVG)
│  ├─ T01-bold-quote/ ... T12-.../   # each: template.html, meta.json, preview.png
├─ src/
│  ├─ cli.ts                # commands: generate | render | publish | preview | refresh-token | doctor
│  ├─ content/              # llm clients, prompt builder, validator, bank fallback
│  ├─ design/               # uniqueness engine, palette generator, template picker
│  ├─ render/               # Playwright renderer, HTML→PNG→JPEG (sharp), text-fit logic
│  ├─ publish/              # instagramGraph.ts, publisher.ts, mediaHost.ts
│  ├─ schedule/             # slot calculator (Asia/Karachi), due-post selector
│  ├─ state/                # read/write queue.json, history.json, token.json
│  └─ util/                 # logger, retry, env, time
├─ state/                   # committed JSON state (queue, history, token meta)
├─ media/                   # rendered JPEGs, served by GitHub Pages (public URL)
├─ preview/                 # local gallery (gitignored)
├─ tests/
├─ .github/workflows/
│  ├─ generate.yml          # nightly: create + render + queue next day's posts
│  ├─ publish.yml           # every 15–30 min: publish posts that are due
│  └─ refresh-token.yml     # weekly: refresh IG long-lived token
├─ .env.example
├─ package.json / tsconfig.json
└─ (the spec .md files)
```

## Data flow

```
 nightly (generate.yml)                       every 15 min (publish.yml)
 ┌────────────────────┐                       ┌──────────────────────────┐
 │ pillars + history  │                       │ read state/queue.json    │
 │   ↓                │                       │ pick items where         │
 │ LLM (free) → JSON  │                       │   status=queued &         │
 │   ↓ (fallback bank)│                       │   scheduledAt <= now      │
 │ validate content   │                       │   ↓                       │
 │   ↓                │                       │ image URL = Pages URL     │
 │ uniqueness engine  │                       │   ↓                       │
 │   ↓                │                       │ IG Graph: create container│
 │ render JPEG(s)     │                       │   → poll status → publish │
 │   ↓                │                       │   ↓                       │
 │ commit media/ +    │                       │ mark posted / retry/failed│
 │ queue.json (Pages) │                       │ commit state              │
 └────────────────────┘                       └──────────────────────────┘
```

Note: after committing media, wait until the GitHub Pages URL returns HTTP 200 with `image/jpeg`
before the item is marked `queued` (Instagram downloads the file itself).

## Post JSON schema (`state/queue.json` item)

```json
{
  "id": "2026-11-18-slot3",
  "date": "2026-11-18",
  "scheduledAt": "2026-11-18T15:00:00+05:00",
  "status": "queued | publishing | posted | failed | skipped",
  "approved": true,
  "pillar": "tips",
  "format": "single | carousel",
  "template": "T04-split-card",
  "design": { "palette": "sunset-violet", "seed": 48213, "decoration": "dots-bl", "layoutVariant": 2 },
  "slides": [
    { "headline": "Is your website slow?", "body": "3 quick fixes you can do today", "cta": "haanhosting.store", "badge": "Tip #12" }
  ],
  "caption": "Full caption text with line breaks…",
  "hashtags": ["#webhosting", "#pakistan"],
  "altText": "Slide describing …",
  "images": ["media/2026-11-18/slot3-1.jpg"],
  "imageUrls": ["https://<user>.github.io/<repo>/media/2026-11-18/slot3-1.jpg"],
  "igMediaId": null,
  "attempts": 0,
  "error": null
}
```

## History schema (`state/history.json`)
Rolling 30 days of `{date, template, palette, decoration, headline, pillar, hashCaption}`.
Used for: uniqueness engine, duplicate-topic detection (similarity check on headlines), pillar balancing.

## Key module contracts

- `generateDailyPosts(date, history, config) → Post[]` – LLM first, bank fallback, always returns `postsPerDay` valid posts.
- `validatePost(post) → {ok, errors[]}` – length limits, banned claims, hashtag count (≤ 15), no empty fields, no placeholder text.
- `pickDesign(post, history) → design` – seeded random constrained by anti-repeat rules (TEMPLATES.md §4).
- `renderPost(post) → string[]` – returns JPEG file paths; auto-shrinks font until text fits box.
- `publishPost(post) → {igMediaId}` – Graph API two-step flow with status polling and retry/backoff.
- `dueSlots(now, schedule) → Slot[]` – timezone-correct (Asia/Karachi, UTC+5, no DST).

## Concurrency / safety
- `publish.yml` uses `concurrency: { group: publish, cancel-in-progress: false }` so runs never overlap.
- Before publishing, set `status=publishing` and commit; if a run crashes, a later run checks the IG account's
  recent media (by caption hash) before retrying to avoid duplicates.
- Max 5 API posts/day is far below the 50/24h limit; still read `content_publishing_limit` before each publish.
