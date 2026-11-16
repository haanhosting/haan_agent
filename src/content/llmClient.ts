import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { GeneratedPost, GeneratedPostSchema } from './schema.js';
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';
import { validatePost } from './validator.js';
import { pickBankPost } from './bank.js';

export interface GeneratePostOptions {
  date: string;
  slot: number;
  pillar: string;
  format: 'single' | 'carousel';
  template: string;
  recentHeadlines: string[];
  angleIndex?: number;
  usedBankIds?: Set<string>;
}

export function loadProvidersConfig(): any {
  const p = path.resolve(process.cwd(), 'config/providers.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function loadBrandConfig(): any {
  const p = path.resolve(process.cwd(), 'config/brand.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Strips markdown code blocks if the LLM returned ```json ... ```
 */
export function extractJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Call Google Gemini Developer API using official @google/genai SDK
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  config: any
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const ai = new GoogleGenAI({ apiKey });
  const modelName = config.model || 'gemini-2.0-flash';

  const response = await ai.models.generateContent({
    model: modelName,
    contents: `${systemPrompt}\n\n${userPrompt}`,
    config: {
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxOutputTokens ?? 2048,
      responseMimeType: 'application/json'
    }
  });

  const text = response.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

/**
 * Call Groq API via standard OpenAI-compatible REST endpoint
 */
async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  config: any
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

  const endpoint = config.endpoint || 'https://api.groq.com/openai/v1/chat/completions';
  const model = config.model || 'llama-3.3-70b-versatile';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: config.temperature ?? 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Groq API error HTTP ${res.status}: ${errorBody}`);
  }

  const json = (await res.json()) as any;
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty content from Groq');
  return content;
}

/**
 * Call OpenRouter free tier via standard OpenAI-compatible REST endpoint
 */
async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  config: any
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const endpoint = config.endpoint || 'https://openrouter.ai/api/v1/chat/completions';
  const model = config.model || 'meta-llama/llama-3.3-70b-instruct:free';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://haanhosting.store',
      'X-Title': 'Haan Insta Agent'
    },
    body: JSON.stringify({
      model,
      temperature: config.temperature ?? 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`OpenRouter API error HTTP ${res.status}: ${errorBody}`);
  }

  const json = (await res.json()) as any;
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty content from OpenRouter');
  return content;
}

/**
 * Master generator function with fallback chain:
 * Gemini -> Groq -> OpenRouter -> Bank
 */
export async function generatePost(options: GeneratePostOptions): Promise<GeneratedPost> {
  const providers = loadProvidersConfig();
  const brand = loadBrandConfig();
  const order = providers.llm?.providerOrder || ['gemini', 'groq', 'openrouter', 'bank'];

  const systemPrompt = buildSystemPrompt(brand);
  const userPrompt = buildUserPrompt({
    date: options.date,
    slot: options.slot,
    pillar: options.pillar,
    format: options.format,
    template: options.template,
    recentHeadlines: options.recentHeadlines,
    verifiedOffers: brand.offers || [],
    angleIndex: options.angleIndex
  });

  for (const provider of order) {
    if (provider === 'bank') {
      console.log(`[LLM Fallback] Using offline content bank for slot ${options.slot}`);
      const bankPost = pickBankPost({
        pillar: options.pillar,
        format: options.format,
        usedIds: options.usedBankIds || new Set()
      });
      return bankPost;
    }

    try {
      console.log(`[Content Generator] Attempting provider: ${provider} (model: ${providers.llm[provider]?.model})`);
      let rawResponse = '';

      if (provider === 'gemini') {
        rawResponse = await callGemini(systemPrompt, userPrompt, providers.llm.gemini);
      } else if (provider === 'groq') {
        rawResponse = await callGroq(systemPrompt, userPrompt, providers.llm.groq);
      } else if (provider === 'openrouter') {
        rawResponse = await callOpenRouter(systemPrompt, userPrompt, providers.llm.openrouter);
      }

      const jsonStr = extractJsonString(rawResponse);
      const parsed = JSON.parse(jsonStr);

      // Validate schema
      const parseResult = GeneratedPostSchema.safeParse(parsed);
      if (!parseResult.success) {
        console.warn(`[Content Generator] Zod validation failed for ${provider}:`, parseResult.error.message);
        continue;
      }

      // Validate brand truthfulness & rules
      const valResult = validatePost(parseResult.data);
      if (!valResult.ok) {
        console.warn(`[Content Generator] Brand rules validation failed for ${provider}:`, valResult.errors);
        continue;
      }

      console.log(`[Content Generator] Success with provider: ${provider}`);
      return parseResult.data;
    } catch (err: any) {
      console.warn(`[Content Generator] Provider ${provider} failed: ${err.message}`);
    }
  }

  // Safety net: offline content bank
  console.log('[Content Generator] All providers exhausted. Falling back to offline content bank.');
  return pickBankPost({
    pillar: options.pillar,
    format: options.format,
    usedIds: options.usedBankIds || new Set()
  });
}
