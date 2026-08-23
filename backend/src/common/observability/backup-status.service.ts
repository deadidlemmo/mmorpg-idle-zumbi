import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
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
};

export type BackupOperationalStatus = {
  state: 'healthy' | 'stale' | 'failed' | 'unknown';
  maxAgeHours: number;
  verificationMaxAgeHours: number;
  backupAgeHours: number | null;
  verificationAgeHours: number | null;
  lastBackup: BackupRunStatus | null;
  lastVerification: BackupRunStatus | null;
  lastRestore: BackupStatusFile['restore'] | null;
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

    const maxAgeHours = this.getPositiveConfig('BACKUP_MAX_AGE_HOURS', 26);
    const verificationMaxAgeHours = this.getPositiveConfig(
      'BACKUP_VERIFICATION_MAX_AGE_HOURS',
      168,
    );
    const statusFile = this.readStatusFile();
    const lastBackup = statusFile?.backup ?? null;
    const lastVerification = statusFile?.verification ?? null;
    const lastRestore = statusFile?.restore ?? null;
    const backupAgeHours = this.getAgeHours(lastBackup?.createdAt, now);
    const verificationAgeHours = this.getAgeHours(
      lastVerification?.verifiedAt,
      now,
    );
    const hasFailure =
      lastBackup?.status === 'failed' ||
      lastVerification?.status === 'failed' ||
      lastRestore?.status === 'failed';
    const hasSuccessfulBackup =
      lastBackup?.status === 'success' && backupAgeHours !== null;
    const hasSuccessfulVerification =
      lastVerification?.status === 'success' && verificationAgeHours !== null;
    let state: BackupOperationalStatus['state'] = 'unknown';

    if (hasFailure) {
      state = 'failed';
    } else if (hasSuccessfulBackup && hasSuccessfulVerification) {
      state =
        backupAgeHours <= maxAgeHours &&
        verificationAgeHours <= verificationMaxAgeHours
          ? 'healthy'
          : 'stale';
    }

    const status = {
      state,
      maxAgeHours,
      verificationMaxAgeHours,
      backupAgeHours,
      verificationAgeHours,
      lastBackup,
      lastVerification,
      lastRestore,
    } satisfies BackupOperationalStatus;
    this.cache = { expiresAt: now + 5_000, status };

    return status;
  }

  private readStatusFile(): BackupStatusFile | null {
    const configuredPath = this.configService
      .get<string>('BACKUP_STATUS_PATH')
      ?.trim();
    const statusPath = path.resolve(
      configuredPath || path.join('backups', 'status.json'),
    );

    try {
      return JSON.parse(readFileSync(statusPath, 'utf8')) as BackupStatusFile;
    } catch {
      return null;
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
