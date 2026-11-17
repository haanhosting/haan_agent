# TEMPLATES.md – pre-built templates + uniqueness engine

> **Visual style is defined in `STYLE_REFERENCE.md` (owner-approved).** If anything below conflicts with it
> (e.g. gradients, decorations), `STYLE_REFERENCE.md` wins: flat solid colors, bold type, no photos.

## 1. Technical format
- Canvas: **1080 × 1350 px** (4:5). Safe margin 80 px on all sides. Export JPEG q≈88 via Playwright screenshot → `sharp`.
- Each template = a folder: `template.html` (with `{{placeholders}}`), `meta.json`, optional SVG parts. All templates import `_shared/base.css`.
- Styling is driven by **CSS variables** so palette/decoration can change without touching HTML:
  `--bg1 --bg2 --ink --muted --accent --accent2 --card --radius --font-display --font-body`.
- `meta.json`: `{ id, name, formats:["single","carousel"], maxHeadlineChars, maxBodyChars, supportsBadge, layoutVariants:3, bestFor:["tips","offer",…] }`.
- **Text-fit**: renderer measures overflow in the page and shrinks font-size (steps of 2px, floor 70%) until it fits; if it still overflows, the validator shortens the text via the LLM or fallback trimming. No clipped text, ever.
- Every post carries a small brand footer (logo/wordmark + `haanhosting.store`) in a consistent position per template.

## 2. The 12 launch templates
| ID | Name | Look | Best for |
|---|---|---|---|
| T01 | Bold Statement | Huge headline, gradient bg, accent underline | Hooks, announcements |
| T02 | Split Card | Half color block, half white card with text | Tips, features |
| T03 | Checklist | Rounded list with check icons (3–5 items) | How-to, "5 things…" |
| T04 | Big Number | Giant stat/number with caption | Facts, steps ("Step 3"), tips #N |
| T05 | Offer Poster | Badge, strike-through old/new, ribbon, CTA button | Promotions (only real offers from config) |
| T06 | Quote Card | Oversized quote marks, author/line | Motivation, business quotes |
| T07 | Myth vs Fact | Two-panel red/green comparison | Education |
| T08 | Browser Mockup | Fake browser window frame with URL bar | Website/domain/hosting topics |
| T09 | Terminal / Code | Dark terminal-style card | Tech tips, DNS, SSL, WordPress |
| T10 | Question Poll | Big question + 2–4 option pills | Engagement |
| T11 | Carousel Cover + Slides | Cover (hook) + content slides + final CTA slide | Educational carousels (3–7 slides) |
| T12 | Minimal Editorial | Lots of whitespace, serif headline, thin lines | Premium/brand feel |

Carousel layout: slide 1 = hook, slides 2…n-1 = one point each (reuse a content template family for visual consistency),
last slide = CTA ("Visit haanhosting.store" / "Save this post"). Add a small "swipe →" indicator on slide 1.

## 3. Palettes (≥ 10, all with AA contrast between `--ink` and `--bg`)
Define in `templates/_shared/palettes.json`. Start with: `ocean-blue`, `sunset-violet`, `mint-fresh`, `midnight-gold`,
`coral-pop`, `forest-lime`, `slate-cyan`, `berry-cream`, `sand-terracotta`, `electric-indigo`.
Brand color from `brand.json` must appear as `--accent` in at least 2 of every 5 posts so the feed stays recognizable.
The CLI should also provide a `generatePalette(seed)` helper (HSL-based, contrast-checked) for extra variety.

## 4. Uniqueness engine (anti-repeat rules)
Inputs: today's posts + `state/history.json` (last 14 days).
1. **No same template twice in one day**, and no template reused within 3 days (12 templates / 5 per day makes this feasible).
2. **No palette reuse** within the same day; same palette not reused within 4 days.
3. **Decoration** (dots grid, blobs, diagonal lines, circles, waves, grain, geometric corner, none) – pick one that differs from the previous 5 posts.
4. **Layout variant** (0–2): alignment/position changes (left/center/right text, top/bottom card).
5. **Seeded randomness**: `seed = hash(date + slot)`; the seed is stored so any post can be re-rendered identically.
6. **Content match**: template must be in the pillar's `bestFor` list; otherwise choose the closest allowed.
7. **Mix of formats**: per day roughly 3–4 single images + 1–2 carousels.
8. Duplicate guard: headline similarity (Jaccard on tokens) > 0.6 with any history item in 30 days → regenerate.
Log the design choice and the reason for every pick (for debugging).

## 5. Design quality checklist (the CLI must self-check by viewing renders)
- High contrast, large type (headline ≥ 64 px, body ≥ 34 px), max ~12 words in a headline.
- One idea per image. Generous spacing. Consistent corner radius and shadows per template.
- Mobile-first: legible when viewed at 400 px wide. Render a contact sheet and inspect it.
- No stock-photo dependency (free & copyright-safe): use gradients, shapes, icons, mockups, typography.
- Logo: use real logo if found on the site (download once into `templates/_shared/`), else a clean wordmark "Haan Hosting".
