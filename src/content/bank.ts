import fs from 'fs';
import path from 'path';

// Load existing or seed high-quality posts
export function loadContentBank(): any[] {
  const bankFile = path.resolve(process.cwd(), 'content/bank/posts.json');
  if (!fs.existsSync(bankFile)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(bankFile, 'utf8'));
}

export function pickBankPost(params: {
  pillar: string;
  format: 'single' | 'carousel';
  usedIds: Set<string>;
  recentHeadlines?: string[];
}): any {
  const bank = loadContentBank();
  const recentSet = new Set((params.recentHeadlines || []).map(h => h.toLowerCase().trim()));

  // 1. Filter matching pillar, format, not in usedIds, and headline not already in queue/history
  let eligible = bank.filter(p => {
    const headline = (p.slides?.[0]?.headline || '').toLowerCase().trim();
    return (
      p.pillar === params.pillar &&
      p.format === params.format &&
      !params.usedIds.has(p.id) &&
      !recentSet.has(headline)
    );
  });

  // 2. Fallback: matching format, not in usedIds, and headline not in queue/history (any pillar)
  if (eligible.length === 0) {
    eligible = bank.filter(p => {
      const headline = (p.slides?.[0]?.headline || '').toLowerCase().trim();
      return p.format === params.format && !params.usedIds.has(p.id) && !recentSet.has(headline);
    });
  }

  // 3. Fallback: matching pillar & format, not in usedIds
  if (eligible.length === 0) {
    eligible = bank.filter(
      p => p.pillar === params.pillar && p.format === params.format && !params.usedIds.has(p.id)
    );
  }

  // 4. Fallback: any matching format not in usedIds
  if (eligible.length === 0) {
    eligible = bank.filter(p => p.format === params.format && !params.usedIds.has(p.id));
  }

  // 5. Final fallback: any matching format
  if (eligible.length === 0) {
    eligible = bank.filter(p => p.format === params.format);
  }
  if (eligible.length === 0) {
    eligible = bank;
  }

  const idx = Math.floor(Math.random() * eligible.length);
  const chosen = eligible[idx];
  if (chosen?.id) {
    params.usedIds.add(chosen.id);
  }
  return chosen;
}
