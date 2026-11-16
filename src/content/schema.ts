import { z } from 'zod';

export const SlideDataSchema = z.object({
  headline: z.string().min(5).max(120),
  body: z.string().max(350).optional(),
  badge: z.string().max(40).optional(),
  category: z.string().max(30).optional(),
  cta: z.string().default('haanhosting.store'),
  // Template-specific optional fields
  statNumber: z.string().max(30).optional(),
  statLabel: z.string().max(50).optional(),
  planName: z.string().max(60).optional(),
  price: z.string().max(30).optional(),
  specs: z.array(z.string()).max(8).optional(),
  ctaButtonText: z.string().max(40).optional(),
  myth: z.string().max(180).optional(),
  fact: z.string().max(200).optional(),
  items: z.array(z.string()).max(6).optional(),
  options: z.array(z.object({
    letter: z.string().length(1),
    text: z.string().max(60)
  })).max(4).optional(),
  promptText: z.string().max(80).optional(),
  author: z.string().max(50).optional(),
  role: z.string().max(50).optional(),
  urlDomain: z.string().max(50).optional(),
  statusText: z.string().max(50).optional(),
  contentTitle: z.string().max(80).optional(),
  command: z.string().max(80).optional(),
  output: z.string().max(150).optional(),
  successLine: z.string().max(80).optional(),
  bullets: z.array(z.string()).max(6).optional(),
  slideIndex: z.number().int().optional(),
  totalSlides: z.number().int().optional(),
  isCover: z.boolean().optional(),
  editorialTag: z.string().max(40).optional()
});

export type SlideData = z.infer<typeof SlideDataSchema>;

export const GeneratedPostSchema = z.object({
  pillar: z.string(),
  format: z.enum(['single', 'carousel']),
  template: z.string(),
  slides: z.array(SlideDataSchema).min(1).max(10),
  caption: z.string().min(50).max(2200),
  hashtags: z.array(z.string()).min(5).max(15),
  altText: z.string().min(10).max(500),
  offerId: z.string().optional()
});

export type GeneratedPost = z.infer<typeof GeneratedPostSchema>;
