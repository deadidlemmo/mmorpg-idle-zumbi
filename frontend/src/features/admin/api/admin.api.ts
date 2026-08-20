import { apiClient } from '../../../services/api/apiClient';
import { API_ENDPOINTS } from '../../../services/api/endpoints';

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

export async function getAdminSummary() {
  const response = await apiClient.get<AdminSummary>(API_ENDPOINTS.admin.summary);
  return response.data;
}
export async function getAdminUsers(search = '') {
  const response = await apiClient.get<{
    users: AdminUser[];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  }>(API_ENDPOINTS.admin.users, { params: { search, pageSize: 50 } });
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
