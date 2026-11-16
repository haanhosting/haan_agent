# STYLE_REFERENCE.md – the EXACT look the owner approved

The owner approved this look: **flat, bold, high-contrast cards, one idea per post, big readable text, solid colors,
small label top-left, brand footer bottom-left.** The four designs below are the baseline templates (T01, T03, T07, T10).
All other templates (T02, T04–T06, T08, T09, T11, T12) MUST follow the same visual language: same spacing, same type
scale, same label + footer pattern, solid color families, rounded rectangles, no photos.

## Global rules (canvas 1080×1350)
- Padding: **100 px** all sides. Corner radius for inner boxes: **24 px**; pills: 999 px.
- Top-left **label** (34 px, medium): category such as "Tip #12", "Checklist", "Myth vs fact", "Poll".
- Bottom-left **footer** (34 px): `Haan Hosting · haanhosting.store` (or just the URL on light designs).
- Headline: 80–110 px, weight 600, line-height 1.12; auto-shrink to fit (floor 64 px). Max ~10 words.
- Body/secondary: 38–44 px. Never below 34 px.
- Fonts: Poppins (headlines) + Inter (body), bundled locally. Weights 400/500/600 only.
- Colors come from palette tokens (below); each palette = {bg, ink, muted, accent, card, cardInk}. Swap palettes per post
  to create variety while keeping the layout. Every palette must pass AA contrast for ink-on-bg.
- Decorations (optional, subtle, flat): corner dots grid, large faint circle, diagonal stripes, thin underline bar.

## Reference palettes (taken from the approved mockup)
| Name | bg | ink | muted | accent | card | cardInk |
|---|---|---|---|---|---|---|
| deep-violet | #26215C | #EEEDFE | #CECBF6 | #7F77DD | – | – |
| mint-fresh | #E1F5EE | #04342C | #0F6E56 | #1D9E75 | #FFFFFF | #085041 |
| coral-pop | #FAECE7 | #4A1B0C | #993C1D | #D85A30 | myth #F5C4B3 / fact #C0DD97 | #712B13 / #173404 |
| navy-sky | #042C53 | #E6F1FB | #85B7EB | #378ADD | – | #B5D4F4 |
Add 8+ more in the same style (flat, saturated dark OR soft light backgrounds, one accent).

## T01 – Bold statement (deep-violet)
Dark bg, label top-left, big headline bottom-left area, accent underline bar (192×16 px, accent), subline, footer.
```html
<div class="post t01">
  <div class="label">{{label}}</div>
  <div class="mid">
    <h1>{{headline}}</h1>
    <div class="bar"></div>
    <p>{{subline}}</p>
  </div>
  <div class="footer">Haan Hosting · haanhosting.store</div>
</div>
<style>
.post{width:1080px;height:1350px;padding:100px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;
 background:var(--bg);color:var(--ink);font-family:Inter,sans-serif}
.label{font-size:34px;color:var(--accent2,var(--muted))}
h1{font-family:Poppins,sans-serif;font-weight:600;font-size:104px;line-height:1.12;margin:0}
.bar{height:16px;width:192px;background:var(--accent);margin:44px 0}
p{font-size:42px;color:var(--muted);margin:0}
.footer{font-size:34px;color:var(--accent2,var(--muted))}
</style>
```

## T03 – Checklist (mint-fresh)
Light bg, headline, 3–5 white rounded rows each starting with "✓", footer.
```html
<div class="post t03">
  <div class="label">{{label}}</div>
  <div class="mid">
    <h1>{{headline}}</h1>
    <ul>{{#items}}<li><span>✓</span> {{.}}</li>{{/items}}</ul>
  </div>
  <div class="footer">haanhosting.store</div>
</div>
<style>
.post{width:1080px;height:1350px;padding:100px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;
 background:var(--bg);color:var(--ink);font-family:Inter,sans-serif}
.label{font-size:34px;color:var(--muted)}
h1{font-family:Poppins,sans-serif;font-weight:600;font-size:84px;line-height:1.12;margin:0 0 56px}
ul{list-style:none;margin:0;padding:0;display:grid;gap:22px}
li{background:var(--card);color:var(--cardInk);border-radius:24px;padding:30px 36px;font-size:42px}
li span{color:var(--accent);font-weight:600;margin-right:14px}
.footer{font-size:34px;color:var(--muted)}
</style>
```

## T07 – Myth vs fact (coral-pop)
Two stacked boxes: myth (warm tint) and fact (green tint), each with small label + bold statement.
```html
<div class="post t07">
  <div class="label">Myth vs fact</div>
  <div class="mid">
    <div class="box myth"><small>Myth</small><b>{{myth}}</b></div>
    <div class="box fact"><small>Fact</small><b>{{fact}}</b></div>
  </div>
  <div class="footer">Haan Hosting</div>
</div>
<style>
.post{width:1080px;height:1350px;padding:100px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;
 background:var(--bg);color:var(--ink);font-family:Inter,sans-serif}
.label{font-size:34px;color:var(--muted)}
.mid{display:grid;gap:28px}
.box{border-radius:24px;padding:48px 52px}
.box small{display:block;font-size:34px;margin-bottom:12px}
.box b{font-family:Poppins,sans-serif;font-weight:600;font-size:64px;line-height:1.15}
.myth{background:#F5C4B3;color:#4A1B0C}.myth small{color:#712B13}
.fact{background:#C0DD97;color:#173404}.fact small{color:#27500A}
.footer{font-size:34px;color:var(--muted)}
</style>
```

## T10 – Poll / question (navy-sky)
Dark bg, big question, 2–4 outlined pill options, footer.
```html
<div class="post t10">
  <div class="label">Poll</div>
  <div class="mid">
    <h1>{{question}}</h1>
    {{#options}}<div class="pill">{{.}}</div>{{/options}}
  </div>
  <div class="footer">haanhosting.store</div>
</div>
<style>
.post{width:1080px;height:1350px;padding:100px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;
 background:var(--bg);color:var(--ink);font-family:Inter,sans-serif}
.label{font-size:34px;color:var(--muted)}
h1{font-family:Poppins,sans-serif;font-weight:600;font-size:84px;line-height:1.12;margin:0 0 56px}
.pill{border:3px solid var(--accent);border-radius:999px;padding:24px 40px;font-size:42px;color:var(--cardInk,var(--muted));margin-bottom:22px}
.footer{font-size:34px;color:var(--muted)}
</style>
```

## How the CLI must use this file
1. Create `templates/T01…T12` starting from the four snippets above (turn them into full HTML files with CSS variables,
   bundled fonts and the `{{placeholders}}` engine of your choice, e.g. Handlebars/Mustache).
2. Build the remaining 8 templates in the **same language** (T02 split card, T04 big number, T05 offer poster,
   T06 quote, T08 browser mockup, T09 terminal, T11 carousel family, T12 minimal editorial).
3. Render each with sample text, compare side by side with these four, and fix anything that looks different in spirit
   (gradients, photos, thin fonts, clutter, tiny text are NOT allowed).
4. The mockup the owner approved used exactly these colors and arrangement – keep the four reference designs
   visually recognizable in the final product.
