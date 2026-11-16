# Haan Hosting – Instagram Auto-Poster Agent

An AI agent that **creates 4–5 unique, branded Instagram posts every day** for
[Haan Hosting](https://haanhosting.store) and **publishes them automatically** – with a monthly cost of **$0**.

## How it works (one paragraph)

Every night a scheduled job asks a free LLM to write the day's post ideas (captions, headlines, hashtags).
A template engine fills pre-built HTML/CSS designs with that content, using a different palette/layout/decoration
each time so posts never look the same, and renders them to JPEG images. The images are hosted on free GitHub Pages.
At the scheduled times, the publisher sends each image to Instagram through the official **Instagram Graph API**
(free, up to 50 posts/24h). Everything runs on **GitHub Actions** (free). No server, no paid service.

## Important finding (read this)

Upload-Post's free plan gives only **10 uploads per month**. 4–5 posts/day is ~135/month, so it
**cannot** be the main publisher on a free budget. The primary publisher is the official Instagram Graph API.
Upload-Post is kept as an optional, disabled-by-default fallback adapter (useful for the first 10 test posts).

## Files in this project spec

| File | Purpose |
|---|---|
| `README.md` | This overview |
| `PROJECT_SPEC.md` | Goals, brand, requirements, non-goals, acceptance criteria |
| `ARCHITECTURE.md` | Folder layout, modules, data flow, config schemas |
| `FREE_STACK.md` | Every tool used, why it is free, limits to respect |
| `TEMPLATES.md` | Template system, 12 template designs, uniqueness engine |
| `STYLE_REFERENCE.md` | **The approved post look**: exact colors, sizes and HTML for the 4 reference designs |
| `CONTENT_STRATEGY.md` | Content pillars, weekly calendar, caption/hashtag rules |
| `INSTAGRAM_PUBLISHING.md` | Graph API flow, token handling, error handling, fallback |
| `SETUP_GUIDE.md` | The manual steps only the owner can do (accounts, tokens, secrets) |
| `CLI_PROMPT.md` | **The prompt to paste into the CLI to build everything** |

## How to start

1. Put all `.md` files in an empty folder, e.g. `haan-insta-agent/`.
2. Open your terminal in that folder and start Claude Code (`claude`).
3. Paste the full contents of `CLI_PROMPT.md`.
4. When the CLI finishes, follow `SETUP_GUIDE.md` to add your Instagram token and GitHub secrets.
