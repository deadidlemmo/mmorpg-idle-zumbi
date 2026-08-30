import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function getArgument(name) {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

const backupDirectory = path.resolve(getArgument('directory') || 'backups');
const retainHours = Math.max(
  24,
  Number(getArgument('retain-hours') || 72) || 72,
);
const cutoff = Date.now() - retainHours * 60 * 60 * 1000;
const entries = await readdir(backupDirectory, { withFileTypes: true });
const dumps = [];
const automatedBackupPattern =
  /^dead-idle-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.dump$/;

for (const entry of entries) {
  if (!entry.isFile() || !automatedBackupPattern.test(entry.name)) continue;
  const filePath = path.join(backupDirectory, entry.name);
  const fileStats = await stat(filePath);
  dumps.push({ filePath, mtimeMs: fileStats.mtimeMs });
}

dumps.sort((left, right) => right.mtimeMs - left.mtimeMs);
const removed = [];

for (const backup of dumps.slice(1)) {
  if (backup.mtimeMs >= cutoff) continue;
  await rm(backup.filePath, { force: true });
  await rm(`${backup.filePath}.sha256.json`, { force: true });
  removed.push(path.basename(backup.filePath));
}

console.log(
  JSON.stringify({
    status: 'success',
    retainedLatest: dumps[0] ? path.basename(dumps[0].filePath) : null,
    retainHours,
    removed,
  }),
);
