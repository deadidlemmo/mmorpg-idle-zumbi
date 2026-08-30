import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function splitArg(arg) {
  const separatorIndex = arg.indexOf('=');
  return separatorIndex < 0
    ? [arg, undefined]
    : [arg.slice(0, separatorIndex), arg.slice(separatorIndex + 1)];
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseArgs() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const options = {
    users: [50, 100],
    durationSeconds: 60,
    warmupSeconds: 5,
    outputDir: resolve(process.cwd(), '..', '_reports', 'load-test', stamp),
    skipBuild: false,
    backendPortBase: 3101,
    postgresPortBase: 5541,
    redisPortBase: 6391,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--skip-build') {
      options.skipBuild = true;
      continue;
    }

    const [key, value] = splitArg(arg);

    switch (key) {
      case '--users':
        options.users = String(value ?? '50,100')
          .split(',')
          .map((entry) => positiveInteger(entry, 0))
          .filter((entry) => entry > 0 && entry <= 500);
        break;
      case '--duration-seconds':
        options.durationSeconds = positiveInteger(
          value,
          options.durationSeconds,
        );
        break;
      case '--warmup-seconds':
        options.warmupSeconds = positiveInteger(value, options.warmupSeconds);
        break;
      case '--output-dir':
        options.outputDir = resolve(String(value ?? options.outputDir));
        break;
      case '--backend-port-base':
        options.backendPortBase = positiveInteger(
          value,
          options.backendPortBase,
        );
        break;
      case '--postgres-port-base':
        options.postgresPortBase = positiveInteger(
          value,
          options.postgresPortBase,
        );
        break;
      case '--redis-port-base':
        options.redisPortBase = positiveInteger(value, options.redisPortBase);
        break;
      default:
        break;
    }
  }

  if (options.users.length === 0) {
    throw new Error('Informe ao menos uma carga valida em --users.');
  }

  return options;
}

function runCommand(command, args, options = {}) {
  const acceptedExitCodes = options.acceptedExitCodes ?? [0];

  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
      windowsHide: true,
      shell: false,
    });

    child.once('error', rejectCommand);
    child.once('exit', (code) => {
      const exitCode = code ?? 1;

      if (acceptedExitCodes.includes(exitCode)) {
        resolveCommand(exitCode);
        return;
      }

      rejectCommand(
        new Error(
          `${command} ${args.join(' ')} terminou com codigo ${exitCode}.`,
        ),
      );
    });
  });
}

async function waitForPostgres(containerName, databaseName) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      await runCommand(
        'docker',
        [
          'exec',
          containerName,
          'pg_isready',
          '-U',
          'zumbi',
          '-d',
          databaseName,
        ],
        { stdio: 'ignore' },
      );
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
  }

  throw new Error(`PostgreSQL temporario ${containerName} nao ficou pronto.`);
}

async function waitForBackend(baseUrl, backendProcess) {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (backendProcess.exitCode !== null) {
      throw new Error(
        `Backend de carga encerrou antes do health check: ${backendProcess.exitCode}.`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}/health/ready`);

      if (response.ok) return;
    } catch {
      // O processo ainda esta iniciando.
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }

  throw new Error(`Backend de carga nao ficou pronto em ${baseUrl}.`);
}

async function stopBackend(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) return;

  const exited = new Promise((resolveExit) => {
    processHandle.once('exit', resolveExit);
  });
  processHandle.kill('SIGTERM');

  await Promise.race([
    exited,
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
  ]);

  if (processHandle.exitCode === null) {
    if (process.platform === 'win32') {
      await runCommand(
        'taskkill',
        ['/PID', String(processHandle.pid), '/T', '/F'],
        { acceptedExitCodes: [0, 128], stdio: 'ignore' },
      ).catch(() => undefined);
    } else {
      processHandle.kill('SIGKILL');
    }
  }
}

async function removeContainer(containerName) {
  await runCommand('docker', ['rm', '-f', containerName], {
    acceptedExitCodes: [0, 1],
    stdio: 'ignore',
  }).catch(() => undefined);
}

function buildSummaryMarkdown(reports) {
  const passed = reports.every((report) => report.assessment.passed);
  const rows = reports
    .map((report) => {
      const cpu = report.resources.processCpuPercentOfOneCore;
      const rss = report.resources.rssMiB;
      const postgres = report.resources.postgresConnections;
      const autoCombat = report.autoCombat;
      const sockets = report.sockets;

      return `| ${report.config.users} | ${report.assessment.passed ? 'Aprovado' : 'Reprovado'} | ${cpu.average}% / ${cpu.p95}% / ${cpu.max}% | ${rss.max} MiB | ${postgres.max}/${postgres.configuredMax} | ${autoCombat.tickDurationMs.p95} ms | ${autoCombat.tickSchedulingLagMs.p95} ms | ${sockets.reconciliationsSucceeded}/${sockets.reconnectsAttempted} |`;
    })
    .join('\n');

  const failedChecks = reports.flatMap((report) =>
    report.assessment.checks
      .filter((check) => !check.passed)
      .map(
        (check) =>
          `- ${report.config.users} personagens - ${check.name}: ${check.actual}; meta ${check.target}.`,
      ),
  );

  return `# Suite de carga do autocombate

> ${passed ? 'APROVADA' : 'REPROVADA'} em ${new Date().toISOString()}. Carga sintetica executada em PostgreSQL, Redis e backend descartaveis, sem usar o banco dos jogadores.

| Personagens | Resultado | CPU media / P95 / max (% de 1 nucleo) | RSS max | PostgreSQL max | Tick P95 | Atraso P95 | Reconciliacoes |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## Criterios nao atendidos

${failedChecks.length > 0 ? failedChecks.join('\n') : '- Nenhum.'}

## Interpretacao

Esta suite valida capacidade tecnica local, processamento autoritativo, conexoes e reconexao. Os personagens sinteticos foram distribuidos entre T1-T5 e as quatro classes, mas os resultados nao devem ser tratados como telemetria economica real. O gargalo estimado de 496-860 horas para insumos de pets continua pendente de calibracao baseada em amostras reais.
`;
}

async function runScenario(options, users, scenarioIndex, suiteId) {
  const databaseName =
    `mmorpg_zumbi_load_test_${suiteId}_${users}`.toLowerCase();

  if (!/^mmorpg_zumbi_load_test_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Nome de banco temporario recusado: ${databaseName}.`);
  }

  const postgresContainer = `dead-idle-load-pg-${suiteId}-${users}`;
  const redisContainer = `dead-idle-load-redis-${suiteId}-${users}`;
  const backendPort = options.backendPortBase + scenarioIndex;
  const postgresPort = options.postgresPortBase + scenarioIndex;
  const redisPort = options.redisPortBase + scenarioIndex;
  const baseUrl = `http://127.0.0.1:${backendPort}`;
  const databaseUrl = `postgresql://zumbi:zumbi123@127.0.0.1:${postgresPort}/${databaseName}?schema=public`;
  const metricsToken = `load-metrics-${suiteId}-${users}`;
  const scenarioDir = resolve(options.outputDir, `${users}-characters`);
  const outputJson = resolve(scenarioDir, `scenario-${users}.json`);
  const stdoutPath = resolve(scenarioDir, 'backend.stdout.log');
  const stderrPath = resolve(scenarioDir, 'backend.stderr.log');
  const env = {
    ...process.env,
    NODE_ENV: 'load-test',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: `load-jwt-${suiteId}`,
    JWT_EXPIRES_IN: '2h',
    APP_PORT: String(backendPort),
    PORT: String(backendPort),
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: String(redisPort),
    REDIS_COORDINATION_ENABLED: 'true',
    SOCKET_REDIS_ADAPTER_ENABLED: 'true',
    REDIS_REQUIRED: 'true',
    METRICS_TOKEN: metricsToken,
    WORLD_BOSS_TEST_UNLOCK_ENABLED: 'false',
  };
  let backendProcess = null;
  let stdoutStream = null;
  let stderrStream = null;

  await mkdir(scenarioDir, { recursive: true });
  console.log(
    `\n[suite] Cenario ${users}: criando infraestrutura descartavel...`,
  );

  try {
    await runCommand('docker', [
      'run',
      '--rm',
      '-d',
      '--name',
      postgresContainer,
      '-e',
      'POSTGRES_USER=zumbi',
      '-e',
      'POSTGRES_PASSWORD=zumbi123',
      '-e',
      `POSTGRES_DB=${databaseName}`,
      '-p',
      `127.0.0.1:${postgresPort}:5432`,
      'postgres:16',
    ]);
    await runCommand('docker', [
      'run',
      '--rm',
      '-d',
      '--name',
      redisContainer,
      '-p',
      `127.0.0.1:${redisPort}:6379`,
      'redis:7',
    ]);
    await waitForPostgres(postgresContainer, databaseName);

    console.log(`[suite] Cenario ${users}: migrations e seed...`);
    await runCommand(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env, stdio: 'ignore' },
    );
    await runCommand(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'db', 'seed'],
      { env, stdio: 'ignore' },
    );

    stdoutStream = createWriteStream(stdoutPath, { flags: 'w' });
    stderrStream = createWriteStream(stderrPath, { flags: 'w' });
    backendProcess = spawn(process.execPath, ['dist/main.js'], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
    backendProcess.stdout.pipe(stdoutStream);
    backendProcess.stderr.pipe(stderrStream);
    await waitForBackend(baseUrl, backendProcess);
    console.log(`[suite] Cenario ${users}: backend pronto em ${baseUrl}.`);

    const runnerExitCode = await runCommand(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'scripts/load-test-auto-combat.ts',
        `--users=${users}`,
        `--duration-seconds=${options.durationSeconds}`,
        `--warmup-seconds=${options.warmupSeconds}`,
        `--base-url=${baseUrl}`,
        `--metrics-token=${metricsToken}`,
        `--output-json=${outputJson}`,
      ],
      { env, acceptedExitCodes: [0, 2] },
    );
    const report = JSON.parse(await readFile(outputJson, 'utf8'));
    report.runnerExitCode = runnerExitCode;
    return report;
  } finally {
    await stopBackend(backendProcess);
    stdoutStream?.end();
    stderrStream?.end();
    await removeContainer(redisContainer);
    await removeContainer(postgresContainer);
    console.log(`[suite] Cenario ${users}: ambiente descartavel removido.`);
  }
}

async function main() {
  const options = parseArgs();
  const suiteId = Date.now().toString(36).toLowerCase();
  const reports = [];

  await mkdir(options.outputDir, { recursive: true });
  await runCommand('docker', ['version'], { stdio: 'ignore' });

  if (!options.skipBuild) {
    console.log('[suite] Compilando backend antes do teste...');
    await runCommand('npm.cmd', ['run', 'build']);
  }

  for (let index = 0; index < options.users.length; index += 1) {
    reports.push(
      await runScenario(options, options.users[index], index, suiteId),
    );
  }

  const summary = {
    schemaVersion: 1,
    synthetic: true,
    generatedAt: new Date().toISOString(),
    passed: reports.every((report) => report.assessment.passed),
    scenarios: reports,
  };
  const summaryJson = resolve(options.outputDir, 'summary.json');
  const summaryMarkdown = resolve(options.outputDir, 'summary.md');

  await writeFile(summaryJson, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(summaryMarkdown, buildSummaryMarkdown(reports));
  console.log(`\n[suite] Resumo JSON: ${summaryJson}`);
  console.log(`[suite] Resumo Markdown: ${summaryMarkdown}`);
  console.log(
    `[suite] Resultado: ${summary.passed ? 'APROVADO' : 'REPROVADO'}.`,
  );

  if (!summary.passed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
