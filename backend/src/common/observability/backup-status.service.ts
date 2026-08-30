import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

type BackupRunStatus = {
  status: 'success' | 'failed';
  file?: string;
  createdAt?: string;
  verifiedAt?: string;
  restoredAt?: string;
  failedAt?: string;
  sizeBytes?: number;
  sha256?: string;
  error?: string;
};

type BackupStatusFile = {
  updatedAt?: string;
  backup?: BackupRunStatus;
  verification?: BackupRunStatus;
  restore?: BackupRunStatus & { targetDatabase?: string };
  offsite?: BackupRunStatus & {
    provider?: string;
    bucket?: string;
    objectKey?: string;
    uploadedAt?: string;
  };
};

type BackupIntegrityStatus = {
  state: 'valid' | 'invalid' | 'missing' | 'unknown';
  checkedAt: string;
  sizeBytes: number | null;
  sha256: string | null;
};

export type BackupOperationalStatus = {
  state: 'healthy' | 'stale' | 'failed' | 'unknown';
  maxAgeHours: number;
  verificationMaxAgeHours: number;
  offsiteMaxAgeHours: number;
  backupAgeHours: number | null;
  verificationAgeHours: number | null;
  offsiteAgeHours: number | null;
  integrity: BackupIntegrityStatus;
  lastBackup: BackupRunStatus | null;
  lastVerification: BackupRunStatus | null;
  lastRestore: BackupStatusFile['restore'] | null;
  lastOffsite: BackupStatusFile['offsite'] | null;
};

@Injectable()
export class BackupStatusService {
  private cache:
    | { expiresAt: number; status: BackupOperationalStatus }
    | undefined;

  constructor(private readonly configService: ConfigService) {}

  getStatus(now = Date.now()): BackupOperationalStatus {
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.status;
    }

    const maxAgeHours = this.getPositiveConfig('BACKUP_MAX_AGE_HOURS', 4);
    const verificationMaxAgeHours = this.getPositiveConfig(
      'BACKUP_VERIFICATION_MAX_AGE_HOURS',
      168,
    );
    const offsiteMaxAgeHours = this.getPositiveConfig(
      'BACKUP_OFFSITE_MAX_AGE_HOURS',
      4,
    );
    const offsiteRequired =
      this.configService
        .get<string>('BACKUP_OFFSITE_REQUIRED')
        ?.trim()
        .toLowerCase() !== 'false';
    const { statusFile, statusPath } = this.readStatusFile();
    const lastBackup = statusFile?.backup ?? null;
    const lastVerification = statusFile?.verification ?? null;
    const lastRestore = statusFile?.restore ?? null;
    const lastOffsite = statusFile?.offsite ?? null;
    const backupAgeHours = this.getAgeHours(lastBackup?.createdAt, now);
    const verificationAgeHours = this.getAgeHours(
      lastVerification?.verifiedAt,
      now,
    );
    const offsiteAgeHours = this.getAgeHours(lastOffsite?.uploadedAt, now);
    const integrity = this.verifyBackupIntegrity(statusPath, lastBackup, now);
    const hasFailure =
      lastBackup?.status === 'failed' ||
      lastVerification?.status === 'failed' ||
      lastRestore?.status === 'failed' ||
      lastOffsite?.status === 'failed' ||
      integrity.state === 'invalid' ||
      integrity.state === 'missing';
    const hasSuccessfulBackup =
      lastBackup?.status === 'success' && backupAgeHours !== null;
    const hasSuccessfulVerification =
      lastVerification?.status === 'success' && verificationAgeHours !== null;
    const hasSuccessfulOffsite =
      lastOffsite?.status === 'success' && offsiteAgeHours !== null;
    let state: BackupOperationalStatus['state'] = 'unknown';

    if (hasFailure) {
      state = 'failed';
    } else if (
      hasSuccessfulBackup &&
      hasSuccessfulVerification &&
      integrity.state === 'valid' &&
      (!offsiteRequired || hasSuccessfulOffsite)
    ) {
      state =
        backupAgeHours <= maxAgeHours &&
        verificationAgeHours <= verificationMaxAgeHours &&
        (!offsiteRequired || offsiteAgeHours! <= offsiteMaxAgeHours)
          ? 'healthy'
          : 'stale';
    }

    const status = {
      state,
      maxAgeHours,
      verificationMaxAgeHours,
      offsiteMaxAgeHours,
      backupAgeHours,
      verificationAgeHours,
      offsiteAgeHours,
      integrity,
      lastBackup,
      lastVerification,
      lastRestore,
      lastOffsite,
    } satisfies BackupOperationalStatus;
    this.cache = { expiresAt: now + 30_000, status };

    return status;
  }

  private readStatusFile(): {
    statusFile: BackupStatusFile | null;
    statusPath: string;
  } {
    const configuredPath = this.configService
      .get<string>('BACKUP_STATUS_PATH')
      ?.trim();
    const statusPath = path.resolve(
      configuredPath || path.join('backups', 'status.json'),
    );

    try {
      return {
        statusFile: JSON.parse(
          readFileSync(statusPath, 'utf8'),
        ) as BackupStatusFile,
        statusPath,
      };
    } catch {
      return { statusFile: null, statusPath };
    }
  }

  private verifyBackupIntegrity(
    statusPath: string,
    backup: BackupRunStatus | null,
    now: number,
  ): BackupIntegrityStatus {
    const checkedAt = new Date(now).toISOString();
    if (backup?.status !== 'success' || !backup.file) {
      return {
        state: 'unknown',
        checkedAt,
        sizeBytes: null,
        sha256: null,
      };
    }

    const backupPath = path.join(
      path.dirname(statusPath),
      path.basename(backup.file),
    );
    const manifestPath = `${backupPath}.sha256.json`;

    try {
      const fileStats = statSync(backupPath);
      const manifest = JSON.parse(
        readFileSync(manifestPath, 'utf8'),
      ) as BackupRunStatus;
      const sha256 = createHash('sha256')
        .update(readFileSync(backupPath))
        .digest('hex');
      const valid =
        manifest.file === path.basename(backupPath) &&
        manifest.sizeBytes === fileStats.size &&
        manifest.sha256 === sha256 &&
        backup.sizeBytes === fileStats.size &&
        backup.sha256 === sha256;

      return {
        state: valid ? 'valid' : 'invalid',
        checkedAt,
        sizeBytes: fileStats.size,
        sha256,
      };
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;
      return {
        state: errorCode === 'ENOENT' ? 'missing' : 'invalid',
        checkedAt,
        sizeBytes: null,
        sha256: null,
      };
    }
  }

  private getAgeHours(value: string | undefined, now: number) {
    if (!value) return null;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return null;

    return Math.max(0, (now - timestamp) / (60 * 60 * 1000));
  }

  private getPositiveConfig(key: string, fallback: number) {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
