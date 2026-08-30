import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function getWindowsPostgresCandidates(command) {
  const executable = `${command}.exe`;
  const candidates = [];
  const configuredDirectory = process.env.POSTGRES_BIN_DIR?.trim();

  if (configuredDirectory) {
    candidates.push(path.join(configuredDirectory, executable));
  }

  const postgresRoot = path.join(
    process.env.ProgramFiles || 'C:\\Program Files',
    'PostgreSQL',
  );

  if (existsSync(postgresRoot)) {
    const versions = readdirSync(postgresRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) =>
        right.localeCompare(left, undefined, { numeric: true }),
      );

    for (const version of versions) {
      candidates.push(path.join(postgresRoot, version, 'bin', executable));
    }
  }

  return candidates;
}

export function resolvePostgresCommand(command) {
  if (process.platform !== 'win32') {
    return command;
  }

  return (
    getWindowsPostgresCandidates(command).find((candidate) =>
      existsSync(candidate),
    ) || command
  );
}
