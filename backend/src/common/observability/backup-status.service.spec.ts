import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BackupStatusService } from './backup-status.service';

describe('BackupStatusService', () => {
  let directory: string;
  let statusPath: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'dead-idle-backup-'));
    statusPath = path.join(directory, 'status.json');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function createService(overrides: Record<string, string> = {}) {
    const values = {
      BACKUP_STATUS_PATH: statusPath,
      BACKUP_MAX_AGE_HOURS: '26',
      BACKUP_VERIFICATION_MAX_AGE_HOURS: '168',
      BACKUP_OFFSITE_MAX_AGE_HOURS: '4',
      BACKUP_OFFSITE_REQUIRED: 'true',
      ...overrides,
    };
    return new BackupStatusService({
      get: jest.fn((key: string) => values[key as keyof typeof values]),
    } as never);
  }

  function writeSuccessfulBackupStatus(params: {
    createdAt?: string;
    verifiedAt?: string;
    uploadedAt?: string;
  }) {
    const file = 'dead-idle-test.dump';
    const bytes = Buffer.from('backup PostgreSQL valido');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(path.join(directory, file), bytes);
    writeFileSync(
      path.join(directory, `${file}.sha256.json`),
      JSON.stringify({ file, sizeBytes: bytes.length, sha256 }),
    );
    writeFileSync(
      statusPath,
      JSON.stringify({
        backup: {
          status: 'success',
          file,
          createdAt: params.createdAt,
          sizeBytes: bytes.length,
          sha256,
        },
        verification: {
          status: 'success',
          verifiedAt: params.verifiedAt,
        },
        offsite: {
          status: 'success',
          uploadedAt: params.uploadedAt,
        },
      }),
    );
  }

  it('classifica backup recente e verificado como saudavel', () => {
    const now = Date.parse('2026-08-21T12:00:00.000Z');
    writeSuccessfulBackupStatus({
      createdAt: '2026-08-21T10:00:00.000Z',
      verifiedAt: '2026-08-21T11:00:00.000Z',
      uploadedAt: '2026-08-21T10:01:00.000Z',
    });

    expect(createService().getStatus(now)).toMatchObject({
      state: 'healthy',
      backupAgeHours: 2,
      verificationAgeHours: 1,
      integrity: { state: 'valid' },
    });
  });

  it('classifica verificacao vencida como stale', () => {
    const now = Date.parse('2026-08-21T12:00:00.000Z');
    writeSuccessfulBackupStatus({
      createdAt: '2026-08-21T10:00:00.000Z',
      verifiedAt: '2026-08-10T10:00:00.000Z',
      uploadedAt: '2026-08-21T10:01:00.000Z',
    });

    expect(createService().getStatus(now).state).toBe('stale');
  });

  it('classifica uma restauracao com falha como failed', () => {
    writeFileSync(
      statusPath,
      JSON.stringify({ restore: { status: 'failed' } }),
    );

    expect(createService().getStatus().state).toBe('failed');
  });

  it('falha quando o dump real nao corresponde ao checksum informado', () => {
    const now = Date.parse('2026-08-21T12:00:00.000Z');
    writeSuccessfulBackupStatus({
      createdAt: '2026-08-21T10:00:00.000Z',
      verifiedAt: '2026-08-21T11:00:00.000Z',
      uploadedAt: '2026-08-21T10:01:00.000Z',
    });
    writeFileSync(
      path.join(directory, 'dead-idle-test.dump'),
      'conteudo adulterado',
    );

    expect(createService().getStatus(now)).toMatchObject({
      state: 'failed',
      integrity: { state: 'invalid' },
    });
  });

  it('falha quando o arquivo apontado pelo status nao existe', () => {
    writeFileSync(
      statusPath,
      JSON.stringify({
        backup: {
          status: 'success',
          file: 'ausente.dump',
          createdAt: new Date().toISOString(),
          sizeBytes: 1,
          sha256: 'invalido',
        },
      }),
    );

    expect(createService().getStatus()).toMatchObject({
      state: 'failed',
      integrity: { state: 'missing' },
    });
  });
});
