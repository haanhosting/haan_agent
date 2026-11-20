/**
 * Minimal OpenAI REST helpers shared by AI Studio modules.
 * The key is read only from process.env.OPENAI_API_KEY (.env locally, GitHub secret in Actions).
 */

/** Thrown when retrying is pointless: no key, key rejected, or no credits. */
export class QuotaError extends Error {}

export function getOpenAiKey(): string | null {
  const k = process.env.OPENAI_API_KEY;
  return k && k.trim() ? k.trim() : null;
}

async function handle(res: Response): Promise<any> {
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const code = json?.error?.code || json?.error?.type || '';
    const msg = json?.error?.message || text.slice(0, 300);
    if (res.status === 429 && /quota|billing/i.test(`${code} ${msg}`)) {
      throw new QuotaError(`OpenAI quota/billing: ${msg}`);
    }
    if (res.status === 401) throw new QuotaError(`OpenAI key rejected: ${msg}`);
    const err: any = new Error(`OpenAI HTTP ${res.status} (${code}): ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function openaiFetch(endpoint: string, body: any): Promise<any> {
  const key = getOpenAiKey();
  if (!key) throw new QuotaError('OPENAI_API_KEY is not set');
  const res = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body)
  });
  return handle(res);
}

/** multipart/form-data request (used by images/edits). */
export async function openaiFetchForm(endpoint: string, form: FormData): Promise<any> {
  const key = getOpenAiKey();
  if (!key) throw new QuotaError('OPENAI_API_KEY is not set');
  const res = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form
  });
  return handle(res);
}
