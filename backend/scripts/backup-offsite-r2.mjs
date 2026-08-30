import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { getErrorMessage, updateBackupStatus } from './backup-status.mjs';

function getArgument(name) {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function getIsoWeek(date) {
  const value = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((value - yearStart) / 86_400_000 + 1) / 7);

  return {
    year: value.getUTCFullYear(),
    week: String(week).padStart(2, '0'),
  };
}

function runWrangler(wranglerCwd, args) {
  const npmCli =
    process.env.npm_execpath ||
    path.join(
      path.dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    );
  const result = spawnSync(
    process.execPath,
    [npmCli, 'exec', 'wrangler', '--', ...args],
    {
      cwd: wranglerCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Wrangler falhou: ${(result.stderr || result.stdout).trim()}`,
    );
  }
}

async function assertLocalBackup(backupPath) {
  const manifestPath = `${backupPath}.sha256.json`;
  const [bytes, manifestText, fileStats] = await Promise.all([
    readFile(backupPath),
    readFile(manifestPath, 'utf8'),
    stat(backupPath),
  ]);
  const manifest = JSON.parse(manifestText);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  if (
    manifest.file !== path.basename(backupPath) ||
    manifest.sizeBytes !== fileStats.size ||
    manifest.sha256 !== sha256
  ) {
    throw new Error('Backup local ou manifesto SHA-256 invalido.');
  }

  return { bytes, manifest, sha256, sizeBytes: fileStats.size };
}

async function uploadObject({
  bucket,
  key,
  filePath,
  contentType,
  wranglerCwd,
}) {
  runWrangler(wranglerCwd, [
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
    '--remote',
    '--force',
    `--content-type=${contentType}`,
    `--file=${filePath}`,
  ]);
}

const backupValue = getArgument('backup');
const bucket =
  getArgument('bucket') || process.env.BACKUP_R2_BUCKET?.trim() || '';
const wranglerCwd = path.resolve(
  getArgument('wrangler-cwd') ||
    process.env.BACKUP_WRANGLER_CWD?.trim() ||
    path.join('..', 'frontend'),
);
const backupPath = backupValue ? path.resolve(backupValue) : '';
let temporaryDirectory;

try {
  if (!backupPath) throw new Error('Use --backup=<arquivo.dump>.');
  if (!bucket) throw new Error('BACKUP_R2_BUCKET nao configurado.');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('Nome do bucket R2 invalido.');
  }

  const local = await assertLocalBackup(backupPath);
  const createdAt = new Date(local.manifest.createdAt || Date.now());
  if (!Number.isFinite(createdAt.getTime())) {
    throw new Error('Data do manifesto de backup invalida.');
  }

  const year = String(createdAt.getUTCFullYear());
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(createdAt.getUTCDate()).padStart(2, '0');
  const dateKey = `${year}-${month}-${day}`;
  const isoWeek = getIsoWeek(createdAt);
  const objects = {
    hourly: `hourly/${year}/${month}/${day}/${path.basename(backupPath)}`,
    daily: `daily/${year}/${month}/${dateKey}.dump`,
    weekly: `weekly/${isoWeek.year}/${isoWeek.year}-W${isoWeek.week}.dump`,
  };

  temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'dead-idle-r2-backup-'),
  );

  for (const [retention, objectKey] of Object.entries(objects)) {
    const remoteManifest = {
      ...local.manifest,
      file: path.basename(objectKey),
      retention,
      objectKey,
    };
    const remoteManifestPath = path.join(
      temporaryDirectory,
      `${retention}.sha256.json`,
    );
    await writeFile(
      remoteManifestPath,
      `${JSON.stringify(remoteManifest, null, 2)}\n`,
      'utf8',
    );
    await uploadObject({
      bucket,
      key: objectKey,
      filePath: backupPath,
      contentType: 'application/octet-stream',
      wranglerCwd,
    });
    await uploadObject({
      bucket,
      key: `${objectKey}.sha256.json`,
      filePath: remoteManifestPath,
      contentType: 'application/json',
      wranglerCwd,
    });
  }

  const downloadedPath = path.join(temporaryDirectory, 'roundtrip.dump');
  runWrangler(wranglerCwd, [
    'r2',
    'object',
    'get',
    `${bucket}/${objects.hourly}`,
    '--remote',
    `--file=${downloadedPath}`,
  ]);
  const downloadedBytes = await readFile(downloadedPath);
  const downloadedSha256 = createHash('sha256')
    .update(downloadedBytes)
    .digest('hex');

  if (
    downloadedBytes.length !== local.sizeBytes ||
    downloadedSha256 !== local.sha256
  ) {
    throw new Error('Backup baixado do R2 nao confere com o checksum local.');
  }

  const result = {
    status: 'success',
    provider: 'cloudflare-r2',
    bucket,
    objectKey: objects.hourly,
    objects,
    uploadedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    sizeBytes: local.sizeBytes,
    sha256: local.sha256,
    encryptionAtRest: 'provider-managed',
    transportEncryption: 'tls',
    publicAccess: false,
  };
  await updateBackupStatus('offsite', result);
  console.log(JSON.stringify({ uploaded: true, ...result }));
} catch (error) {
  await updateBackupStatus('offsite', {
    status: 'failed',
    provider: 'cloudflare-r2',
    bucket: bucket || undefined,
    failedAt: new Date().toISOString(),
    error: getErrorMessage(error),
  });
  throw error;
} finally {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
