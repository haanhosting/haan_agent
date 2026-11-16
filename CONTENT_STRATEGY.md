# CONTENT_STRATEGY.md

## 1. Pillars (config/pillars.json) with weights
| Pillar | Weight | Examples |
|---|---|---|
| Tips & how-to | 30% | Speed up WordPress, choose a domain name, what is SSL, backup basics |
| Educational myth/fact & explainers | 15% | "Shared vs VPS hosting", "What is DNS?" |
| Business/website growth | 15% | Why every shop needs a website, Google Business basics, trust signals |
| Offers & services (REAL only) | 15% | Hosting plans, domain registration, support – only data from brand.json/website |
| Engagement | 10% | Polls, "this or that", questions, quizzes |
| Trust & brand | 10% | Uptime/support values (only true claims), behind the scenes, FAQs |
| Motivation / quotes | 5% | Entrepreneur quotes in original wording (no copyrighted quotes) |

Rule: never more than 1 promotional post in a row; at most 1–2 offer posts per day.

## 2. Daily plan (5 posts, Asia/Karachi)
| Slot | Time (PKT) | UTC cron | Suggested pillar |
|---|---|---|---|
| 1 | 09:30 | 04:30 | Tip / educational |
| 2 | 12:30 | 07:30 | Engagement / poll |
| 3 | 16:00 | 11:00 | Business growth |
| 4 | 19:30 | 14:30 | Offer / service |
| 5 | 21:30 | 16:30 | Carousel (educational) or quote |
For 4 posts/day drop slot 2. Times are editable in `config/schedule.json`; the CLI should explain that
GitHub cron can drift by minutes and design `publish.yml` to run every 15 min and publish anything due.

## 3. Caption rules
- Structure: **Hook line** (≤ 90 chars, no spoilers) → value (2–5 short lines or bullets) → CTA ("Save this", "Visit haanhosting.store", "Comment YES for…") → hashtags block.
- Language: English by default; `config/brand.json → languageMix` can allow ~20% Roman Urdu captions. Keep it simple and readable.
- Tone: helpful first, selling second. No ALL-CAPS spam, no fake urgency, no emoji walls (1–4 emojis).
- Link: "link in bio" – Instagram captions don't make links clickable. Keep the profile bio link set to haanhosting.store.
- Length: 300–900 characters typical; hard cap 2,200.
- Alt text: always generated (accessibility + SEO).

## 4. Hashtag rules
- 8–15 hashtags per post: mix of niche (`#webhostingpakistan`, `#wordpresshosting`), medium (`#smallbusiness`, `#websitedesign`) and brand (`#HaanHosting`).
- Rotate sets so consecutive posts differ by ≥ 40%. Keep a `content/hashtags.json` pool per pillar.
- No banned/spammy tags; no hashtags unrelated to the post.

## 5. Truthfulness guardrails (validator must enforce)
- No invented prices, discounts, uptime %, customer counts, testimonials, awards, or competitor bashing.
- Offer posts must reference a real offer defined in `config/brand.json → offers[]` (with start/end dates if any); otherwise skip to another pillar.
- Don't promise rankings, guaranteed sales or "100% uptime".
- No copyrighted quotes/lyrics; no trademark logos of other companies (only plain text mentions like "WordPress").

## 6. Content bank (offline fallback)
Create `content/bank/` with ≥ 60 ready posts covering every pillar (headline, body, caption, hashtags, pillar, recommended template).
The bank must be high quality – it's what posts if the LLM fails. Items are marked used in history and recycled only after 60 days.

## 7. LLM prompt design (src/content/prompt.ts)
- System: brand voice, truthfulness rules, JSON-only output matching the schema, char limits per template.
- Input: date, slot/pillar, last 30 days of headlines (to avoid repeats), available real offers, desired template family.
- Ask for **one JSON object per post**, validated with a schema (zod). On invalid JSON → retry once with the error message → then bank fallback.
- Temperature ~0.8 for variety; seed the request with a random "angle" (e.g., beginner, shop owner, student, freelancer).
