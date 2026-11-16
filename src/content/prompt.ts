import fs from 'fs';
import path from 'path';

export const AUDIENCE_ANGLES = [
  'Freelance web developer needing reliable VPS hosting for client sites',
  'Forex trader looking for low-latency Windows RDP for 24/5 MT4/MT5 EA robots in London/NY',
  'Small business owner in Pakistan launching their first online shop',
  'Student or CS learner deploying their personal portfolio and APIs',
  'SEO professional running automated crawler and audit tools 24/7 on remote desktop',
  'WordPress agency owner seeking cPanel hosting with free SSL and automated backups'
];

export function buildSystemPrompt(brand: any): string {
  return `You are the lead content strategist for HAAN HOSTING (https://haanhosting.store).
Your job is to generate high-performing, authentic, modern Instagram posts for HAAN HOSTING.

CRITICAL TRUTHFULNESS & BRAND RULES:
1. NEVER invent prices, discounts, testimonials, or features.
2. Verified Plans:
   - Starter Cloud VPS: $11.99/mo (4 Cores CPU, 8 GB RAM, 50 GB NVMe, 10 Gbps Port, DDoS Protection)
   - Starter Windows RDP: $11.99/mo (4 Cores CPU, 8 GB RAM, 50 GB NVMe SSD, Full Admin Access, Dedicated Clean IP, USA/UK/Singapore)
   - Starter Web Hosting: $3.99/mo (1 Website, 10 GB SSD, Free SSL, 1-Click WordPress, cPanel, 24/7 Support)
   - Business Windows RDP: $16.99/mo (6 Cores CPU, 16 GB RAM, 100 GB NVMe SSD, Dedicated IP)
3. Never promise "100% uptime" or "guaranteed sales". Real SLA is 99.9% uptime.
4. Support: 24/7 technical assistance via WhatsApp (+92 317 7109812) and ticket system. Real team based in Lahore, Pakistan.
5. Datacenters: USA (New York), UK (London), and Singapore.
6. Tone: Friendly, confident, straightforward, technical yet accessible. Roman Urdu can be lightly blended if natural.
7. Captions:
   - Hook line (<= 90 chars, high curiosity, no spoilers)
   - 2-4 short value bullets
   - Clear Call To Action (e.g. "Save this for later", "Link in bio to order at haanhosting.store")
   - 8-15 hashtags including #HaanHosting
8. Output Format: You MUST reply with ONLY a raw valid JSON object matching the requested schema. No markdown formatting, no code fences.`;
}

export function buildUserPrompt(params: {
  date: string;
  slot: number;
  pillar: string;
  format: 'single' | 'carousel';
  template: string;
  recentHeadlines: string[];
  verifiedOffers: any[];
  angleIndex?: number;
}): string {
  const {
    date,
    slot,
    pillar,
    format,
    template,
    recentHeadlines,
    verifiedOffers,
    angleIndex = 0
  } = params;

  const angle = AUDIENCE_ANGLES[angleIndex % AUDIENCE_ANGLES.length];

  return `Generate a complete Instagram post JSON for HAAN HOSTING:
- Date: ${date}
- Slot: ${slot}
- Pillar: "${pillar}"
- Target Format: "${format}"
- Target Template: "${template}"
- Audience Angle: ${angle}

Recent headlines to AVOID duplicating:
${recentHeadlines.map(h => `- "${h}"`).join('\n') || '- None'}

Available Verified Offers (Use ONLY if pillar is "offers"):
${JSON.stringify(verifiedOffers, null, 2)}

Required JSON Schema:
{
  "pillar": "${pillar}",
  "format": "${format}",
  "template": "${template}",
  "offerId": "starter-vps-1199 (only if pillar is offers)",
  "slides": [
    {
      "headline": "Punchy headline (max 75 chars)",
      "body": "Clear supporting text (max 200 chars)",
      "badge": "Short badge tag (e.g., Tip #04, Cloud VPS)",
      "category": "Topic category (e.g., Performance, Security)",
      "cta": "haanhosting.store",
      // Include template specific fields if applicable:
      // For T03: "items": ["Item 1", "Item 2", "Item 3"]
      // For T04: "statNumber": "10 Gbps", "statLabel": "Port Speed"
      // For T05: "planName": "Starter Cloud VPS", "price": "$11.99/mo", "specs": ["4 Cores CPU", "8 GB RAM", "50 GB NVMe", "10 Gbps Port"], "ctaButtonText": "Order at haanhosting.store"
      // For T07: "myth": "Myth statement", "fact": "Fact statement"
      // For T08: "urlDomain": "haanhosting.store/vps", "statusText": "Online", "contentTitle": "Title"
      // For T09: "terminalTitle": "haan@admin:~", "command": "curl -I haanhosting.store", "output": "HTTP/2 200", "successLine": "Connected"
      // For T10: "options": [{"letter": "A", "text": "Option 1"}, {"letter": "B", "text": "Option 2"}], "promptText": "Comment A or B below!"
      // For T11 (if format=carousel, provide 3 to 5 slides in this array with isCover=true on first slide and slideIndex/totalSlides):
      // "slideIndex": 1, "totalSlides": 3, "isCover": true, "bullets": ["Point 1", "Point 2"]
    }
  ],
  "caption": "Full Instagram caption with hook, bullet points, CTA, and hashtag block.",
  "hashtags": ["#HaanHosting", "#webhosting", "#cloudvps", "#pakistantech", ...8 to 15 hashtags],
  "altText": "Descriptive accessibility alt-text explaining the post visuals and core message."
}

Reply with ONLY the raw JSON object.`;
}
