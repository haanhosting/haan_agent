import fs from 'fs';
import path from 'path';

export interface PruneResult {
  deletedDirs: string[];
  deletedFilesCount: number;
  freedBytes: number;
}

export function pruneOldMedia(maxAgeDays = 60, baseDate: Date = new Date()): PruneResult {
  const mediaDir = path.resolve(process.cwd(), 'media');
  if (!fs.existsSync(mediaDir)) {
    return { deletedDirs: [], deletedFilesCount: 0, freedBytes: 0 };
  }

  const entries = fs.readdirSync(mediaDir);
  const nowMs = baseDate.getTime();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const deletedDirs: string[] = [];
  let deletedFilesCount = 0;
  let freedBytes = 0;

  const dateDirRegex = /^\d{4}-\d{2}-\d{2}$/;

  for (const entry of entries) {
    if (!dateDirRegex.test(entry)) continue;

    const dirPath = path.join(mediaDir, entry);
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) continue;

    const dirDate = new Date(`${entry}T00:00:00Z`).getTime();
    if (isNaN(dirDate)) continue;

    if (nowMs - dirDate > maxAgeMs) {
      // Collect files to count
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const fileStat = fs.statSync(filePath);
        freedBytes += fileStat.size;
        deletedFilesCount++;
        fs.unlinkSync(filePath);
      }
      fs.rmdirSync(dirPath);
      deletedDirs.push(entry);
    }
  }

  if (deletedDirs.length > 0) {
    console.log(`[Media Prune] Cleaned ${deletedDirs.length} folders older than ${maxAgeDays} days (${deletedFilesCount} files, ${(freedBytes / 1024).toFixed(1)} KB freed).`);
  } else {
    console.log(`[Media Prune] No media folders older than ${maxAgeDays} days found.`);
  }

  return { deletedDirs, deletedFilesCount, freedBytes };
}
