import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function getStatusPath() {
  return path.resolve(
    process.env.BACKUP_STATUS_PATH?.trim() ||
      path.join('backups', 'status.json'),
  );
}

export async function updateBackupStatus(section, value) {
  const statusPath = getStatusPath();
  let current = {};

  try {
    current = JSON.parse(await readFile(statusPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const next = {
    ...current,
    updatedAt: new Date().toISOString(),
    [section]: value,
  };
  const temporaryPath = `${statusPath}.${process.pid}.tmp`;
  await mkdir(path.dirname(statusPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, statusPath);
}

export function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
