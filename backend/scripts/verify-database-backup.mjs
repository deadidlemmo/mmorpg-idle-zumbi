import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;
const backupArgument = process.argv.find((argument) =>
  argument.startsWith('--backup='),
);

if (!databaseUrl) throw new Error('DATABASE_URL nao configurada.');
if (!backupArgument) throw new Error('Use --backup=<arquivo.dump>.');

const backupPath = path.resolve(backupArgument.split('=').slice(1).join('='));
const sourceUrl = new URL(databaseUrl);
const verificationDatabase = `dead_idle_restore_verify_${Date.now()}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
adminUrl.search = '';
const verificationUrl = new URL(sourceUrl);
verificationUrl.pathname = `/${verificationDatabase}`;
verificationUrl.search = '';

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(`${command} falhou: ${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
}

async function verifyChecksum() {
  try {
    const manifest = JSON.parse(
      await readFile(`${backupPath}.sha256.json`, 'utf8'),
    );
    const bytes = await readFile(backupPath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    if (manifest.sha256 !== sha256) {
      throw new Error('Checksum SHA-256 do backup nao confere.');
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

await verifyChecksum();

try {
  run('psql', [
    `--dbname=${adminUrl.toString()}`,
    '--set=ON_ERROR_STOP=1',
    '--command',
    `CREATE DATABASE "${verificationDatabase}"`,
  ]);
  run('pg_restore', [
    `--dbname=${verificationUrl.toString()}`,
    '--exit-on-error',
    '--no-owner',
    '--no-acl',
    backupPath,
  ]);
  const migrationCount = run('psql', [
    `--dbname=${verificationUrl.toString()}`,
    '--tuples-only',
    '--no-align',
    '--set=ON_ERROR_STOP=1',
    '--command',
    'SELECT COUNT(*) FROM "_prisma_migrations"',
  ]);

  if (!Number.isFinite(Number(migrationCount)) || Number(migrationCount) < 1) {
    throw new Error('Backup restaurado sem historico de migrations.');
  }

  const tableCount = run('psql', [
    `--dbname=${verificationUrl.toString()}`,
    '--tuples-only',
    '--no-align',
    '--set=ON_ERROR_STOP=1',
    '--command',
    "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  ]);
  const canonicalItemCount = run('psql', [
    `--dbname=${verificationUrl.toString()}`,
    '--tuples-only',
    '--no-align',
    '--set=ON_ERROR_STOP=1',
    '--command',
    'SELECT COUNT(*) FROM "items"',
  ]);

  if (!Number.isFinite(Number(tableCount)) || Number(tableCount) < 1) {
    throw new Error('Backup restaurado sem tabelas de aplicacao.');
  }
  if (
    !Number.isFinite(Number(canonicalItemCount)) ||
    Number(canonicalItemCount) < 1
  ) {
    throw new Error('Backup restaurado sem os dados canonicos de itens.');
  }

  console.log(
    JSON.stringify({
      verified: true,
      backup: path.basename(backupPath),
      migrationCount: Number(migrationCount),
      tableCount: Number(tableCount),
      canonicalItemCount: Number(canonicalItemCount),
    }),
  );
} finally {
  run('psql', [
    `--dbname=${adminUrl.toString()}`,
    '--set=ON_ERROR_STOP=1',
    '--command',
    `DROP DATABASE IF EXISTS "${verificationDatabase}" WITH (FORCE)`,
  ]);
}
