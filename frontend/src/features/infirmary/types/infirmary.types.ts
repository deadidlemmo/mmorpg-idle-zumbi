export type InfirmaryCharacterStatus = 'ACTIVE' | 'DEAD' | 'BLOCKED' | 'DELETED';

export interface InfirmaryCharacterSnapshot {
  id: string;
  name: string;
  status: InfirmaryCharacterStatus;
  level: number;
  xp: number;
  currentHp: number;
  maxHp: number;
  gold: number;
  cash: number;
}

export interface InfirmaryTreatmentState {
  active: boolean;
  startedAt: string | null;
  endsAt: string | null;
  remainingSeconds: number;
  elapsedSeconds: number;
  progressPercent: number;
}

export interface InfirmaryCostViewModel {
  type: string;
  amount: number;
  currency?: 'GOLD' | 'CASH' | string;
  durationSeconds?: number;
}

export interface InfirmaryAutoCombatRecoveryViewModel {
  hasPreservedTrackedEnemies?: boolean | null;
  preservedTrackedEnemiesCount?: number | null;
  huntBatchId?: string | null;
  sessionId?: string | null;
  mapId?: string | null;
  subMapId?: string | null;
  mapName?: string | null;
  mapTier?: number | null;
  defeatedAt?: string | null;
}

export interface InfirmaryStatusViewModel {
  canUse: boolean;
  canHeal: boolean;
  canStartTreatment: boolean;
  canClaimTreatment: boolean;
  canInstantTreatment: boolean;
  reason: string;
  currentHp: number;
  maxHp: number;
  missingHp: number;
  isDefeated: boolean;
  treatment: InfirmaryTreatmentState;
  durationSeconds: number;
  hasActiveAutoCombat: boolean;
  hasActiveGathering: boolean;
  hasActiveCrafting?: boolean;
  hasActiveIncursion?: boolean;
  hasActiveWorldBoss: boolean;
  hasPreservedTrackedEnemies?: boolean | null;
  preservedTrackedEnemiesCount?: number | null;
  autoCombatRecovery?: InfirmaryAutoCombatRecoveryViewModel | null;
  costs: {
    free: InfirmaryCostViewModel;
    instant: InfirmaryCostViewModel;
  };
  cost?: InfirmaryCostViewModel;
}

export interface InfirmaryStatusResponse {
  message?: string;
  character: InfirmaryCharacterSnapshot;
  infirmary: InfirmaryStatusViewModel;
  autoCombatRecovery?: InfirmaryAutoCombatRecoveryViewModel | null;
  cost?: InfirmaryCostViewModel;
}
