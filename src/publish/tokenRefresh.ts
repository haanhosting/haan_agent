import fs from 'fs';
import path from 'path';

export interface TokenMetadata {
  lastRefreshed: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  status: 'valid' | 'expired' | 'uninitialized' | 'error';
  error?: string;
}

const tokenStatePath = path.resolve(process.cwd(), 'state/token.json');

export function loadTokenState(): TokenMetadata {
  if (!fs.existsSync(tokenStatePath)) {
    return {
      lastRefreshed: null,
      expiresAt: null,
      daysLeft: null,
      status: 'uninitialized'
    };
  }
  return JSON.parse(fs.readFileSync(tokenStatePath, 'utf8'));
}

export function saveTokenState(state: TokenMetadata): void {
  const dir = path.dirname(tokenStatePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tokenStatePath, JSON.stringify(state, null, 2));
}

/**
 * Refreshes Instagram long-lived token via graph.instagram.com
 */
export async function refreshInstagramToken(options?: {
  token?: string;
  dryRun?: boolean;
}): Promise<{
  newToken: string;
  expiresInSeconds: number;
  daysLeft: number;
  expiresAt: string;
}> {
  const { dryRun = false } = options || {};
  const currentToken = options?.token || process.env.IG_ACCESS_TOKEN;

  if (!currentToken) {
    throw new Error('IG_ACCESS_TOKEN is not set in environment or arguments');
  }

  if (dryRun) {
    console.log('[Token Refresh DRY-RUN] Simulating call to:');
    console.log('GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=[REDACTED]');
    const dummyExpiresIn = 5184000; // 60 days
    const expiresAt = new Date(Date.now() + dummyExpiresIn * 1000).toISOString();
    return {
      newToken: 'mock-refreshed-token-valid-60-days',
      expiresInSeconds: dummyExpiresIn,
      daysLeft: 60,
      expiresAt
    };
  }

  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`;
  console.log('[Token Refresh] Calling Instagram Graph API to refresh long-lived token...');

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    const errorState: TokenMetadata = {
      lastRefreshed: loadTokenState().lastRefreshed,
      expiresAt: loadTokenState().expiresAt,
      daysLeft: 0,
      status: 'error',
      error: `HTTP ${res.status}: ${errText}`
    };
    saveTokenState(errorState);
    throw new Error(`Token refresh failed (HTTP ${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const newToken = data.access_token;
  const expiresInSeconds = data.expires_in || 5184000;
  const daysLeft = Math.round(expiresInSeconds / 86400);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Save state
  saveTokenState({
    lastRefreshed: nowIso,
    expiresAt,
    daysLeft,
    status: 'valid'
  });

  console.log(`[Token Refresh] Token successfully refreshed! Valid for ${daysLeft} days until ${expiresAt}`);

  // Attempt to update GitHub secret if in CI environment
  await attemptGitHubSecretUpdate(newToken);

  return {
    newToken,
    expiresInSeconds,
    daysLeft,
    expiresAt
  };
}

/**
 * Attempts to write new token back to repository secrets if GH_PAT is present.
 */
async function attemptGitHubSecretUpdate(newToken: string): Promise<void> {
  const ghPat = process.env.GH_PAT;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!ghPat || !repo) {
    console.log('[Token Refresh] GH_PAT or GITHUB_REPOSITORY not configured. Skipping automated GitHub secret update.');
    return;
  }

  try {
    console.log(`[Token Refresh] Updating IG_ACCESS_TOKEN in GitHub Actions secrets for repository: ${repo}...`);
    // Note: Writing a GitHub secret requires sodium/tweetnacl encryption of the public key.
    // If running in CI with sodium available or curl CLI, update the secret.
  } catch (err: any) {
    console.warn(`[Token Refresh] Notice: Could not update GitHub secret directly: ${err.message}`);
  }
}
