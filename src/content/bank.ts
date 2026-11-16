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
}): any {
  const bank = loadContentBank();
  
  // Filter matching pillar and format
  let eligible = bank.filter(p =>
    p.pillar === params.pillar &&
    p.format === params.format &&
    !params.usedIds.has(p.id)
  );

  // If none available without reuse, pick any matching pillar
  if (eligible.length === 0) {
    eligible = bank.filter(p => p.pillar === params.pillar && p.format === params.format);
  }

  // If still none, pick any from bank
  if (eligible.length === 0) {
    eligible = bank;
  }

  const idx = Math.floor(Math.random() * eligible.length);
  return eligible[idx];
}
