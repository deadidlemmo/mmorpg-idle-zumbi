import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { getErrorMessage, updateBackupStatus } from './backup-status.mjs';

function getArgument(name) {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

const backupValue = getArgument('backup');
const targetValue = getArgument('target-url');
const confirmed = getArgument('confirm') === 'RESTORE';
const recreate = process.argv.includes('--recreate');
const allowNonIsolatedTarget = process.argv.includes(
  '--allow-non-isolated-target',
);

if (!backupValue) throw new Error('Use --backup=<arquivo.dump>.');
if (!targetValue) throw new Error('Use --target-url=<url PostgreSQL>.');
if (!confirmed) throw new Error('Confirme com --confirm=RESTORE.');

const backupPath = path.resolve(backupValue);
const targetUrl = new URL(targetValue);
targetUrl.searchParams.delete('schema');
const targetDatabase = decodeURIComponent(targetUrl.pathname.slice(1));
const sourceUrl = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL)
  : null;
let targetCreated = false;

if (!/^[A-Za-z0-9_]+$/.test(targetDatabase)) {
  throw new Error('O banco de destino deve usar apenas letras, numeros e _.');
}
if (['postgres', 'template0', 'template1'].includes(targetDatabase)) {
  throw new Error('Banco de sistema nao pode ser usado como destino.');
}
if (
  !allowNonIsolatedTarget &&
  !targetDatabase.startsWith('dead_idle_restore_')
) {
  throw new Error(
    'O destino deve comecar com dead_idle_restore_ ou usar --allow-non-isolated-target.',
  );
}
if (
  sourceUrl &&
  sourceUrl.hostname === targetUrl.hostname &&
  (sourceUrl.port || '5432') === (targetUrl.port || '5432') &&
  decodeURIComponent(sourceUrl.pathname.slice(1)) === targetDatabase
) {
  throw new Error(
    'A restauracao nunca pode sobrescrever o DATABASE_URL de origem.',
  );
}

const adminUrl = new URL(targetUrl);
adminUrl.pathname = '/postgres';

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
  const manifest = JSON.parse(
    await readFile(`${backupPath}.sha256.json`, 'utf8'),
  );
  const bytes = await readFile(backupPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  if (
    manifest.file !== path.basename(backupPath) ||
    manifest.sizeBytes !== bytes.length ||
    manifest.sha256 !== sha256
  ) {
    throw new Error('Manifesto ou checksum SHA-256 do backup nao confere.');
  }
}

function dropTargetDatabase() {
  run('psql', [
    `--dbname=${adminUrl.toString()}`,
    '--set=ON_ERROR_STOP=1',
    '--command',
    `DROP DATABASE IF EXISTS "${targetDatabase}" WITH (FORCE)`,
  ]);
}

try {
  await verifyChecksum();
  const databaseExists =
    run('psql', [
      `--dbname=${adminUrl.toString()}`,
      '--tuples-only',
      '--no-align',
      '--set=ON_ERROR_STOP=1',
      '--command',
      `SELECT 1 FROM pg_database WHERE datname = '${targetDatabase}'`,
    ]) === '1';

  if (databaseExists && !recreate) {
    throw new Error('Destino ja existe. Use --recreate para substitui-lo.');
  }
  if (databaseExists) dropTargetDatabase();

  run('psql', [
    `--dbname=${adminUrl.toString()}`,
    '--set=ON_ERROR_STOP=1',
    '--command',
    `CREATE DATABASE "${targetDatabase}"`,
  ]);
  targetCreated = true;
  run('pg_restore', [
    `--dbname=${targetUrl.toString()}`,
    '--exit-on-error',
    '--no-owner',
    '--no-acl',
    backupPath,
  ]);

  const migrationCount = Number(
    run('psql', [
      `--dbname=${targetUrl.toString()}`,
      '--tuples-only',
      '--no-align',
      '--set=ON_ERROR_STOP=1',
      '--command',
      'SELECT COUNT(*) FROM "_prisma_migrations"',
    ]),
  );
  const canonicalItemCount = Number(
    run('psql', [
      `--dbname=${targetUrl.toString()}`,
      '--tuples-only',
      '--no-align',
      '--set=ON_ERROR_STOP=1',
      '--command',
      'SELECT COUNT(*) FROM "items"',
    ]),
  );

  if (migrationCount < 1 || canonicalItemCount < 1) {
    throw new Error('Destino restaurado sem migrations ou itens canonicos.');
  }

  const result = {
    status: 'success',
    backup: path.basename(backupPath),
    targetDatabase,
    restoredAt: new Date().toISOString(),
    migrationCount,
    canonicalItemCount,
  };
  await updateBackupStatus('restore', result);
  console.log(JSON.stringify({ restored: true, ...result }));
} catch (error) {
  if (targetCreated) {
    try {
      dropTargetDatabase();
    } catch {
      // O erro original continua sendo a causa principal da falha.
    }
  }
  await updateBackupStatus('restore', {
    status: 'failed',
    backup: path.basename(backupPath),
    targetDatabase,
    failedAt: new Date().toISOString(),
    error: getErrorMessage(error),
  });
  throw error;
}
