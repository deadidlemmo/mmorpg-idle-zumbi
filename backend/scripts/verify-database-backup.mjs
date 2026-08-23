import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { getErrorMessage, updateBackupStatus } from './backup-status.mjs';

const databaseUrl = process.env.DATABASE_URL;
const backupArgument = process.argv.find((argument) =>
  argument.startsWith('--backup='),
);

if (!databaseUrl) throw new Error('DATABASE_URL nao configurada.');
if (!backupArgument) throw new Error('Use --backup=<arquivo.dump>.');

const backupPath = path.resolve(backupArgument.split('=').slice(1).join('='));
const sourceUrl = new URL(databaseUrl);
sourceUrl.searchParams.delete('schema');
const verificationDatabase = `dead_idle_restore_verify_${Date.now()}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const verificationUrl = new URL(sourceUrl);
verificationUrl.pathname = `/${verificationDatabase}`;
let databaseCreated = false;

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

  if (manifest.file !== path.basename(backupPath)) {
    throw new Error('Manifesto pertence a outro arquivo de backup.');
  }
  if (manifest.sizeBytes !== bytes.length) {
    throw new Error('Tamanho do backup nao confere com o manifesto.');
  }
  if (manifest.sha256 !== sha256) {
    throw new Error('Checksum SHA-256 do backup nao confere.');
  }
}

try {
  await verifyChecksum();
  try {
    run('psql', [
      `--dbname=${adminUrl.toString()}`,
      '--set=ON_ERROR_STOP=1',
      '--command',
      `CREATE DATABASE "${verificationDatabase}"`,
    ]);
    databaseCreated = true;
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

    if (
      !Number.isFinite(Number(migrationCount)) ||
      Number(migrationCount) < 1
    ) {
      throw new Error('Backup restaurado sem historico de migrations.');
    }
    if (!Number.isFinite(Number(tableCount)) || Number(tableCount) < 1) {
      throw new Error('Backup restaurado sem tabelas de aplicacao.');
    }
    if (
      !Number.isFinite(Number(canonicalItemCount)) ||
      Number(canonicalItemCount) < 1
    ) {
      throw new Error('Backup restaurado sem os dados canonicos de itens.');
    }

    const result = {
      status: 'success',
      backup: path.basename(backupPath),
      verifiedAt: new Date().toISOString(),
      migrationCount: Number(migrationCount),
      tableCount: Number(tableCount),
      canonicalItemCount: Number(canonicalItemCount),
    };
    await updateBackupStatus('verification', result);
    console.log(JSON.stringify({ verified: true, ...result }));
  } finally {
    if (databaseCreated) {
      run('psql', [
        `--dbname=${adminUrl.toString()}`,
        '--set=ON_ERROR_STOP=1',
        '--command',
        `DROP DATABASE IF EXISTS "${verificationDatabase}" WITH (FORCE)`,
      ]);
    }
  }
} catch (error) {
  await updateBackupStatus('verification', {
    status: 'failed',
    backup: path.basename(backupPath),
    failedAt: new Date().toISOString(),
    error: getErrorMessage(error),
  });
  throw error;
}
