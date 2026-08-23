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
      ...overrides,
    };
    return new BackupStatusService({
      get: jest.fn((key: string) => values[key as keyof typeof values]),
    } as never);
  }

  it('classifica backup recente e verificado como saudavel', () => {
    const now = Date.parse('2026-08-21T12:00:00.000Z');
    writeFileSync(
      statusPath,
      JSON.stringify({
        backup: {
          status: 'success',
          createdAt: '2026-08-21T10:00:00.000Z',
        },
        verification: {
          status: 'success',
          verifiedAt: '2026-08-21T11:00:00.000Z',
        },
      }),
    );

    expect(createService().getStatus(now)).toMatchObject({
      state: 'healthy',
      backupAgeHours: 2,
      verificationAgeHours: 1,
    });
  });

  it('classifica verificacao vencida como stale', () => {
    const now = Date.parse('2026-08-21T12:00:00.000Z');
    writeFileSync(
      statusPath,
      JSON.stringify({
        backup: {
          status: 'success',
          createdAt: '2026-08-21T10:00:00.000Z',
        },
        verification: {
          status: 'success',
          verifiedAt: '2026-08-10T10:00:00.000Z',
        },
      }),
    );

    expect(createService().getStatus(now).state).toBe('stale');
  });

  it('classifica uma restauracao com falha como failed', () => {
    writeFileSync(
      statusPath,
      JSON.stringify({ restore: { status: 'failed' } }),
    );

    expect(createService().getStatus().state).toBe('failed');
  });
});
