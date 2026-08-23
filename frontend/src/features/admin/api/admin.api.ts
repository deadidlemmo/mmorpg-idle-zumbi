import { apiClient } from "../../../services/api/apiClient";
import { API_ENDPOINTS } from "../../../services/api/endpoints";

export interface AdminAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor: { id: string; email: string; role: string } | null;
}

export interface AdminSummary {
  generatedAt: string;
  counts: {
    users: number;
    suspendedUsers: number;
    characters: number;
    activeAutoCombats: number;
    activeGathering: number;
    activeCrafting: number;
    activeIncursions: number;
    activeWorldBossParticipants: number;
  };
  recentAuditLogs: AdminAuditLog[];
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  premiumUntil: string | null;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  lastLoginAt: string | null;
  termsVersion: string | null;
  privacyVersion: string | null;
  createdAt: string;
  _count: { characters: number };
}

export interface AdminCosmeticEntitlement {
  id: string;
  source: "PURCHASE" | "BUNDLE" | "SEASON_PASS" | "EVENT" | "ACHIEVEMENT" | "ADMIN";
  sourceReference: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  isActive: boolean;
  cosmetic: {
    key: string;
    name: string;
    type: string;
    collection: { key: string; name: string } | null;
  };
}

interface PageResponse {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AdminUsersResponse extends PageResponse {
  users: AdminUser[];
}

export interface AdminAuditLogsResponse extends PageResponse {
  logs: AdminAuditLog[];
}

export interface AdminOperations {
  generatedAt: string;
  health: {
    status: "ok" | "degraded";
    ready: boolean;
    checkedAt: string;
    uptimeSeconds: number;
    dependencies: {
      database: "up" | "down";
      redis: "up" | "down" | "disabled";
    };
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
    };
    backup: {
      state: "healthy" | "stale" | "failed" | "unknown";
      maxAgeHours: number;
      verificationMaxAgeHours: number;
      backupAgeHours: number | null;
      verificationAgeHours: number | null;
      lastBackup: {
        status: "success" | "failed";
        file?: string;
        createdAt?: string;
        failedAt?: string;
      } | null;
      lastVerification: {
        status: "success" | "failed";
        verifiedAt?: string;
        failedAt?: string;
      } | null;
      lastRestore: {
        status: "success" | "failed";
        targetDatabase?: string;
        restoredAt?: string;
        failedAt?: string;
      } | null;
    };
    alerts: Array<{
      code: string;
      severity: "warning" | "critical";
      message: string;
    }>;
  };
  http: {
    inFlightRequests: number;
    requests: number;
    errors: number;
    errorRatePercent: number;
    averageDurationMs: number;
    maxDurationMs: number;
    routes: Array<{
      route: string;
      requests: number;
      errors: number;
      errorRatePercent: number;
      averageDurationMs: number;
      maxDurationMs: number;
    }>;
  };
}

export interface AdminProductMetrics {
  generatedAt: string;
  period: {
    days: number;
    startedAt: string;
    endedAt: string;
  };
  funnel: {
    windowHours: number;
    cohortUsers: number;
    steps: Array<{
      key: string;
      label: string;
      count: number;
      rateFromStartPercent: number;
      rateFromPreviousPercent: number;
    }>;
  };
  retention: {
    definition: string;
    d1: {
      eligibleUsers: number;
      retainedUsers: number;
      retentionPercent: number;
    };
    d7: {
      eligibleUsers: number;
      retainedUsers: number;
      retentionPercent: number;
    };
  };
  timeToFirstEquipment: {
    definition: string;
    samples: number;
    exactTrackedSamples: number;
    averageSeconds: number | null;
    p50Seconds: number | null;
    p90Seconds: number | null;
  };
  economy: {
    definition: string;
    tiers: Array<{
      tier: number;
      gatheredUnits: number;
      consumedUnits: number;
      craftedUnits: number;
      materialStock: number;
      netMaterialFlow: number;
    }>;
  };
  coverage: {
    milestoneTrackingStartedAt: string | null;
    usesHistoricalFallback: boolean;
  };
}

export async function getAdminSummary() {
  const response = await apiClient.get<AdminSummary>(
    API_ENDPOINTS.admin.summary,
  );
  return response.data;
}

export async function getAdminOperations() {
  const response = await apiClient.get<AdminOperations>(
    API_ENDPOINTS.admin.operations,
  );
  return response.data;
}

export async function getAdminProductMetrics(days = 30) {
  const response = await apiClient.get<AdminProductMetrics>(
    API_ENDPOINTS.admin.product,
    { params: { days } },
  );
  return response.data;
}

export async function getAdminUsers(search = "", page = 1, pageSize = 25) {
  const response = await apiClient.get<AdminUsersResponse>(
    API_ENDPOINTS.admin.users,
    { params: { search, page, pageSize } },
  );
  return response.data;
}

export async function getAdminAuditLogs(page = 1, pageSize = 25) {
  const response = await apiClient.get<AdminAuditLogsResponse>(
    API_ENDPOINTS.admin.auditLogs,
    { params: { page, pageSize } },
  );
  return response.data;
}

export async function setAdminUserSuspension(
  userId: string,
  suspended: boolean,
  reason?: string,
) {
  const response = await apiClient.patch<{ user: AdminUser }>(
    API_ENDPOINTS.admin.userSuspension(userId),
    { suspended, reason },
  );
  return response.data;
}

export async function getAdminUserCosmetics(userId: string) {
  const response = await apiClient.get<{
    user: { id: string; email: string };
    entitlements: AdminCosmeticEntitlement[];
  }>(API_ENDPOINTS.admin.userCosmetics(userId));
  return response.data;
}

export async function grantAdminCosmetics(payload: {
  userId: string;
  collectionKey: string;
  source: AdminCosmeticEntitlement["source"];
  sourceReference?: string;
  expiresAt?: string;
}) {
  const response = await apiClient.post<{ message: string }>(
    API_ENDPOINTS.admin.cosmeticsGrant,
    payload,
  );
  return response.data;
}

export async function revokeAdminCosmetic(entitlementId: string) {
  const response = await apiClient.post<{ message: string }>(
    API_ENDPOINTS.admin.cosmeticsRevoke,
    { entitlementId },
  );
  return response.data;
}
