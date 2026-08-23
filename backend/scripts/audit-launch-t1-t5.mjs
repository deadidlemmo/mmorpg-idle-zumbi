import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const backendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const frontendDirectory = path.resolve(backendDirectory, '..', 'frontend');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmExecPath = process.env.npm_execpath;
const launchLevels = Array.from({ length: 50 }, (_, index) => index + 1).join(
  ',',
);

const checks = [
  {
    name: 'catalogo de equipamentos e receitas T1-T5',
    cwd: backendDirectory,
    args: [
      'test',
      '--',
      '--runInBand',
      'src/common/config/launch-catalog.spec.ts',
    ],
  },
  {
    name: 'cadeia de crafting e origem dos ingredientes',
    cwd: backendDirectory,
    args: ['run', 'prisma:audit:crafting-chain'],
  },
  {
    name: 'tempo e simetria da economia',
    cwd: backendDirectory,
    args: ['run', 'prisma:audit:economy-time'],
  },
  {
    name: 'balanceamento de combate nos niveis 1-50',
    cwd: backendDirectory,
    args: [
      'run',
      'balance:auto-combat:validate',
      '--',
      `--levels=${launchLevels}`,
      '--strict',
      '--summary-only',
    ],
  },
  {
    name: 'cobertura das artes de equipamento T1-T5',
    cwd: frontendDirectory,
    args: ['run', 'images:audit:equipment'],
  },
];

const startedAt = Date.now();

for (const check of checks) {
  const command = npmExecPath ? process.execPath : npmCommand;
  const args = npmExecPath ? [npmExecPath, ...check.args] : check.args;
  const result = spawnSync(command, args, {
    cwd: check.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0) {
    process.stderr.write(`FALHOU: ${check.name}\n`);
    process.stderr.write(result.error ? `${result.error.message}\n` : '');
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status ?? 1);
  }

  process.stdout.write(`OK: ${check.name}\n`);
}

process.stdout.write(
  `${JSON.stringify({
    ready: true,
    scope: 'T1-T5',
    checks: checks.length,
    durationMs: Date.now() - startedAt,
  })}\n`,
);
