import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL nao configurada.');

const postgresCliUrl = new URL(databaseUrl);
postgresCliUrl.searchParams.delete('schema');

const outputArgument = process.argv.find((argument) =>
  argument.startsWith('--output='),
);
const defaultName = `dead-idle-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
const outputPath = path.resolve(
  outputArgument?.split('=').slice(1).join('=') ||
    path.join('backups', defaultName),
);

await mkdir(path.dirname(outputPath), { recursive: true });

const result = spawnSync(
  'pg_dump',
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

if (result.status !== 0) {
  throw new Error(`pg_dump falhou: ${result.stderr || result.stdout}`);
}

const bytes = await readFile(outputPath);
const manifest = {
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

console.log(JSON.stringify(manifest));
