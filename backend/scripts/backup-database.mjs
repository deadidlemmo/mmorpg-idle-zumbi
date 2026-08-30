import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { getErrorMessage, updateBackupStatus } from './backup-status.mjs';
import { resolvePostgresCommand } from './postgres-cli.mjs';

const outputArgument = process.argv.find((argument) =>
  argument.startsWith('--output='),
);
const defaultName = `dead-idle-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
const outputPath = path.resolve(
  outputArgument?.split('=').slice(1).join('=') ||
    path.join('backups', defaultName),
);

try {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL nao configurada.');

  const postgresCliUrl = new URL(databaseUrl);
  postgresCliUrl.searchParams.delete('schema');
  await mkdir(path.dirname(outputPath), { recursive: true });

  const result = spawnSync(
    resolvePostgresCommand('pg_dump'),
    [
      `--dbname=${postgresCliUrl.toString()}`,
      '--format=custom',
      '--compress=9',
      '--no-owner',
      '--no-acl',
      `--file=${outputPath}`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`pg_dump falhou: ${result.stderr || result.stdout}`);
  }

  const bytes = await readFile(outputPath);
  const manifest = {
    status: 'success',
    file: path.basename(outputPath),
    createdAt: new Date().toISOString(),
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };

  await writeFile(
    `${outputPath}.sha256.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await updateBackupStatus('backup', manifest);
  console.log(JSON.stringify(manifest));
} catch (error) {
  await updateBackupStatus('backup', {
    status: 'failed',
    file: path.basename(outputPath),
    failedAt: new Date().toISOString(),
    error: getErrorMessage(error),
  });
  throw error;
}
