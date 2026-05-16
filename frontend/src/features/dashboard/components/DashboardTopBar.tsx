import { useMemo, type ReactNode } from 'react';
import { useAutoCombatRealtimeState } from '../../auto-combat/realtime/useAutoCombatRealtime';
import { useGatheringRealtimeState } from '../../gathering/realtime/useGatheringRealtime';
import type { IncursionsRealtimeState } from '../../incursions/realtime/IncursionsRealtimeProvider';
import { useIncursionsRealtimeState } from '../../incursions/realtime/useIncursionsRealtime';
import type { GatheringMaterialViewModel } from '../../gathering/types/gathering.types';
import '../styles/dashboard-topbar.css';

type DashboardTopBarResourceTone = 'default' | 'gold' | 'cash';

export interface DashboardTopBarResource {
  key: string;
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: DashboardTopBarResourceTone;
  title?: string;
}

interface DashboardTopBarProps {
  characterId?: string | null;
  characterName?: string | null;
  characterClassName?: string | null;
  characterLevel?: number | null;
  characterCurrentHp?: number | null;
  characterMaxHp?: number | null;

  resources?: DashboardTopBarResource[];

  isSidebarCollapsed?: boolean;
  className?: string;

  onRefresh?: () => void | Promise<void>;
}

type LooseRecord = Record<string, unknown>;

interface DashboardTopBarActivityViewModel {
  kind: 'idle' | 'gathering' | 'auto-combat' | 'incursion';
  title: string;
  subtitle: string;
  icon: ReactNode;
  imageUrl?: string | null;
  progressPercent?: number | null;
  badge?: string | null;
  titleText?: string;
}

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function getNumber(value: unknown): number | null {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return null;

  return parsed;
}

function getRecordField(record: unknown, key: string): LooseRecord | null {
  if (!isRecord(record)) return null;

  const value = record[key];

  return isRecord(value) ? value : null;
}

function getStringField(record: unknown, key: string): string | null {
  if (!isRecord(record)) return null;

  return getString(record[key]);
}

function getNumberField(record: unknown, key: string): number | null {
  if (!isRecord(record)) return null;

  return getNumber(record[key]);
}

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function isTerminalStatus(value: unknown): boolean {
  const status = normalizeStatus(value);

  return [
    'STOPPED',
    'FINISHED',
    'COMPLETED',
    'DEFEATED',
    'EXPIRED',
    'CLAIMED',
    'CANCELLED',
    'CANCELED',
  ].includes(status);
}

function clampPercent(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;

  return Math.max(0, Math.min(100, parsed));
}

function calculateHpPercent(
  currentHp?: number | null,
  maxHp?: number | null,
): number {
  const safeCurrentHp = Number(currentHp);
  const safeMaxHp = Number(maxHp);

  if (!Number.isFinite(safeMaxHp) || safeMaxHp <= 0) {
    return 0;
  }

  const normalizedCurrentHp = Number.isFinite(safeCurrentHp)
    ? safeCurrentHp
    : 0;

  return Math.max(
    0,
    Math.min(100, (normalizedCurrentHp / safeMaxHp) * 100),
  );
}

function formatNumber(value?: number | null): string {
  const safeValue = Number(value ?? 0);

  if (!Number.isFinite(safeValue)) return '0';

  return Math.floor(safeValue).toLocaleString('pt-BR');
}

function formatCompactDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—';

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  return `${remainingSeconds}s`;
}

function getMaterialInitials(materialName?: string | null): string {
  const safeName = materialName?.trim();

  if (!safeName) return '?';

  const words = safeName.split(/\s+/).filter(Boolean);

  if (words.length <= 0) return '?';

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function getMaterialIconUrl(
  material?: GatheringMaterialViewModel | null,
): string | null {
  if (!material) return null;

  const materialWithOptionalIcon = material as GatheringMaterialViewModel & {
    icon?: unknown;
    iconUrl?: unknown;
    iconPath?: unknown;
    imageUrl?: unknown;
  };

  const possibleIcon =
    materialWithOptionalIcon.iconUrl ??
    materialWithOptionalIcon.imageUrl ??
    materialWithOptionalIcon.iconPath ??
    materialWithOptionalIcon.icon;

  if (typeof possibleIcon !== 'string') {
    return null;
  }

  const trimmedIcon = possibleIcon.trim();

  return trimmedIcon.length > 0 ? trimmedIcon : null;
}


function getAutoCombatMobRecord(autoCombatState: unknown): LooseRecord | null {
  const status = getRecordField(autoCombatState, 'status');
  const session = getRecordField(autoCombatState, 'session');
  const statusSession = getRecordField(status, 'session');
  const activeSession = getRecordField(status, 'activeSession');
  const autoCombatSession = getRecordField(status, 'autoCombatSession');

  return (
    getRecordField(autoCombatState, 'mob') ??
    getRecordField(autoCombatState, 'currentMob') ??
    getRecordField(status, 'mob') ??
    getRecordField(status, 'currentMob') ??
    getRecordField(session, 'currentMob') ??
    getRecordField(session, 'mob') ??
    getRecordField(statusSession, 'currentMob') ??
    getRecordField(activeSession, 'currentMob') ??
    getRecordField(autoCombatSession, 'currentMob') ??
    getRecordField(status, 'lastKnownMob')
  );
}

function getAutoCombatCurrentHpEvent(autoCombatState: unknown): LooseRecord | null {
  const activeEvent = getRecordField(autoCombatState, 'activeEvent');
  const displayedEvent = getRecordField(autoCombatState, 'displayedEvent');
  const displayedAutoCombatEvent = getRecordField(
    autoCombatState,
    'displayedAutoCombatEvent',
  );
  const currentEvent = getRecordField(autoCombatState, 'currentEvent');
  const lastProcessedEvent = getRecordField(autoCombatState, 'lastProcessedEvent');
  const lastEvent = getRecordField(autoCombatState, 'lastEvent');

  return (
    activeEvent ??
    displayedEvent ??
    displayedAutoCombatEvent ??
    currentEvent ??
    lastProcessedEvent ??
    lastEvent
  );
}

function getAutoCombatMonsterHpPercent(autoCombatState: unknown): number | null {
  const status = getRecordField(autoCombatState, 'status');
  const session = getRecordField(autoCombatState, 'session');
  const statusSession = getRecordField(status, 'session');
  const activeSession = getRecordField(status, 'activeSession');
  const autoCombatSession = getRecordField(status, 'autoCombatSession');
  const mob = getAutoCombatMobRecord(autoCombatState);
  const event = getAutoCombatCurrentHpEvent(autoCombatState);

  const maxHp =
    getNumberField(mob, 'maxHp') ??
    getNumberField(event, 'mobMaxHp') ??
    getNumberField(session, 'currentMobMaxHp') ??
    getNumberField(statusSession, 'currentMobMaxHp') ??
    getNumberField(activeSession, 'currentMobMaxHp') ??
    getNumberField(autoCombatSession, 'currentMobMaxHp') ??
    getNumberField(mob, 'hp');

  const currentHp =
    getNumberField(mob, 'currentHp') ??
    getNumberField(event, 'mobCurrentHp') ??
    getNumberField(session, 'currentMobHp') ??
    getNumberField(statusSession, 'currentMobHp') ??
    getNumberField(activeSession, 'currentMobHp') ??
    getNumberField(autoCombatSession, 'currentMobHp') ??
    maxHp;

  if (maxHp !== null) {
    return calculateHpPercent(currentHp, maxHp);
  }

  const explicitPercent =
    getNumberField(mob, 'hpPercent') ??
    getNumberField(event, 'mobHpPercent');

  return explicitPercent !== null ? clampPercent(explicitPercent) : null;
}

function getAutoCombatMobName(autoCombatState: unknown): string | null {
  const mob = getAutoCombatMobRecord(autoCombatState);

  return (
    getStringField(mob, 'name') ??
    getStringField(mob, 'mobName') ??
    getStringField(mob, 'displayName')
  );
}

function getRecordArrayField(record: unknown, key: string): LooseRecord[] {
  if (!isRecord(record)) return [];

  const value = record[key];

  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function sumNumberField(records: LooseRecord[], key: string): number | null {
  if (records.length <= 0) return null;

  const total = records.reduce((sum, record) => {
    return sum + (getNumberField(record, key) ?? 0);
  }, 0);

  return Number.isFinite(total) ? total : null;
}

function normalizeKillCount(value: number | null): number | null {
  if (value === null) return null;

  return Math.max(0, Math.floor(value));
}

function getAutoCombatKills(autoCombatState: unknown): number | null {
  const totals = getRecordField(autoCombatState, 'totals');
  const displayTotals = getRecordField(autoCombatState, 'displayTotals');
  const status = getRecordField(autoCombatState, 'status');
  const session = getRecordField(autoCombatState, 'session');
  const statusSession = getRecordField(status, 'session');
  const activeSession = getRecordField(status, 'activeSession');
  const autoCombatSession = getRecordField(status, 'autoCombatSession');
  const sessionSummary = getRecordField(status, 'sessionSummary');
  const summaryMobs = getRecordField(sessionSummary, 'mobs');
  const rewards = getRecordField(status, 'rewards');
  const rewardsKills = sumNumberField(getRecordArrayField(rewards, 'mobs'), 'kills');

  return normalizeKillCount(
    getNumberField(displayTotals, 'totalKills') ??
      getNumberField(displayTotals, 'kills') ??
      getNumberField(displayTotals, 'killCount') ??
      getNumberField(displayTotals, 'mobsDefeated') ??
      getNumberField(totals, 'totalKills') ??
      getNumberField(totals, 'kills') ??
      getNumberField(totals, 'killCount') ??
      getNumberField(totals, 'mobsDefeated') ??
      getNumberField(session, 'totalKills') ??
      getNumberField(session, 'totalCombatsResolved') ??
      getNumberField(session, 'totalCombats') ??
      getNumberField(statusSession, 'totalKills') ??
      getNumberField(statusSession, 'totalCombatsResolved') ??
      getNumberField(activeSession, 'totalKills') ??
      getNumberField(activeSession, 'totalCombatsResolved') ??
      getNumberField(autoCombatSession, 'totalKills') ??
      getNumberField(autoCombatSession, 'totalCombatsResolved') ??
      getNumberField(summaryMobs, 'totalKills') ??
      rewardsKills ??
      getNumberField(status, 'totalKills'),
  );
}

function isAutoCombatActive(autoCombatState: unknown): boolean {
  const status = getRecordField(autoCombatState, 'status');
  const session = getRecordField(autoCombatState, 'session');

  const statusActive = status?.active;
  const hasActiveAutoCombat = status?.hasActiveAutoCombat;

  const sessionStatus =
    getStringField(session, 'status') ??
    getStringField(getRecordField(status, 'session'), 'status') ??
    getStringField(getRecordField(status, 'activeSession'), 'status') ??
    getStringField(getRecordField(status, 'autoCombatSession'), 'status');

  if (statusActive === true || hasActiveAutoCombat === true) {
    return true;
  }

  if (statusActive === false || hasActiveAutoCombat === false) {
    return false;
  }

  if (session && !isTerminalStatus(sessionStatus)) {
    return true;
  }

  return false;
}

function buildAutoCombatActivity(
  autoCombatState: unknown,
): DashboardTopBarActivityViewModel | null {
  if (!isAutoCombatActive(autoCombatState)) return null;

  const mobName =
    getAutoCombatMobName(autoCombatState) ?? 'Combate automático';

  const kills = getAutoCombatKills(autoCombatState) ?? 0;
  const monsterHpPercent = getAutoCombatMonsterHpPercent(autoCombatState);

  return {
    kind: 'auto-combat',
    title: mobName,
    subtitle: `${formatNumber(kills)} monstros mortos`,
    icon: '☠',
    progressPercent: monsterHpPercent,
    badge: formatNumber(kills),
    titleText: `Combate automático em andamento • ${formatNumber(
      kills,
    )} monstros mortos`,
  };
}

function buildGatheringActivity(
  gatheringState: ReturnType<typeof useGatheringRealtimeState>,
): DashboardTopBarActivityViewModel | null {
  if (!gatheringState.isActive || !gatheringState.session) return null;

  const material = gatheringState.targetMaterial;
  const materialName = material?.name ?? 'Expedição ativa';
  const materialIconUrl = getMaterialIconUrl(material);

  const progressPercent = clampPercent(
    gatheringState.liveProduction?.progressPercent ?? 0,
  );

  const secondsToNextUnit =
    gatheringState.liveProduction?.secondsToNextUnit ?? null;

  const collectedQuantity = Number(gatheringState.collectedQuantity ?? 0);
  const readyQuantity = Number(gatheringState.liveProduction?.readyQuantity ?? 0);

  const badgeValue =
    Number.isFinite(collectedQuantity) && collectedQuantity > 0
      ? collectedQuantity
      : Number.isFinite(readyQuantity) && readyQuantity > 0
        ? readyQuantity
        : null;

  return {
    kind: 'gathering',
    title: materialName,
    subtitle: `+${formatNumber(collectedQuantity)} · ${formatCompactDuration(
      secondsToNextUnit,
    )}`,
    icon: materialIconUrl ? null : getMaterialInitials(materialName),
    imageUrl: materialIconUrl,
    progressPercent,
    badge: badgeValue !== null ? formatNumber(badgeValue) : null,
    titleText: 'Expedição ativa em tempo real',
  };
}

function buildIncursionActivity(
  incursionsState: IncursionsRealtimeState,
): DashboardTopBarActivityViewModel | null {
  const session = incursionsState.session;

  if (
    !session ||
    session.status === 'CANCELLED' ||
    session.status === 'CLAIMED' ||
    session.status === 'FAILED'
  ) {
    return null;
  }

  const incursionName = session.incursion?.name ?? 'Incursão ativa';
  const mapName = session.incursion?.map?.name ?? 'Mapa desconhecido';
  const remainingSeconds = Number(session.remainingSeconds ?? 0);
  const progressPercent = clampPercent(session.progressPercent ?? 0);
  const isCompleted =
    session.status === 'COMPLETED' || remainingSeconds <= 0 || session.canClaim;

  return {
    kind: 'incursion',
    title: incursionName,
    subtitle: isCompleted
      ? 'Recompensa automática'
      : `${mapName} · ${formatCompactDuration(remainingSeconds)}`,
    icon: '⌬',
    progressPercent: isCompleted ? 100 : progressPercent,
    badge: isCompleted ? 'Fim' : `${Math.floor(progressPercent)}%`,
    titleText: isCompleted
      ? 'Incursão concluída, recompensas automáticas em processamento'
      : `Incursão ativa em ${mapName}`,
  };
}

function buildIdleActivity(): DashboardTopBarActivityViewModel {
  return {
    kind: 'idle',
    title: 'Ocioso',
    subtitle: 'Sem atividade',
    icon: '⌂',
    progressPercent: null,
    badge: null,
    titleText: 'Nenhuma atividade ativa',
  };
}

function isGoldResource(resource: DashboardTopBarResource): boolean {
  const key = String(resource.key ?? '').trim().toLowerCase();
  const label = String(resource.label ?? '').trim().toLowerCase();

  return key === 'gold' || label === 'gold' || resource.tone === 'gold';
}

function isCashResource(resource: DashboardTopBarResource): boolean {
  const key = String(resource.key ?? '').trim().toLowerCase();
  const label = String(resource.label ?? '').trim().toLowerCase();

  return key === 'cash' || label === 'cash' || resource.tone === 'cash';
}

function buildVisibleResources(
  resources: DashboardTopBarResource[],
): DashboardTopBarResource[] {
  const goldResource =
    resources.find(isGoldResource) ??
    ({
      key: 'gold',
      label: 'Gold',
      value: 0,
      icon: '●',
      tone: 'gold',
      title: 'Gold disponível',
    } satisfies DashboardTopBarResource);

  const cashResource =
    resources.find(isCashResource) ??
    ({
      key: 'cash',
      label: 'Cash',
      value: 0,
      icon: '◆',
      tone: 'cash',
      title: 'Cash disponível',
    } satisfies DashboardTopBarResource);

  return [
    {
      ...goldResource,
      key: 'gold',
      label: goldResource.label || 'Gold',
      tone: 'gold',
      icon: goldResource.icon ?? '●',
    },
    {
      ...cashResource,
      key: 'cash',
      label: cashResource.label || 'Cash',
      tone: 'cash',
      icon: cashResource.icon ?? '◆',
    },
  ];
}

function getResourceClassName(resource: DashboardTopBarResource): string {
  const tone = resource.tone ?? 'default';

  return ['dashboard-topbar__resource', `dashboard-topbar__resource--${tone}`]
    .filter(Boolean)
    .join(' ');
}

export function DashboardTopBar({
  characterId,
  resources = [],
  isSidebarCollapsed = false,
  className,
  onRefresh,
}: DashboardTopBarProps) {
  const autoCombatState = useAutoCombatRealtimeState();
  const gatheringState = useGatheringRealtimeState();
  const incursionsState = useIncursionsRealtimeState();

  const activity = useMemo(() => {
    return (
      buildAutoCombatActivity(autoCombatState) ??
      buildGatheringActivity(gatheringState) ??
      buildIncursionActivity(incursionsState) ??
      buildIdleActivity()
    );
  }, [autoCombatState, gatheringState, incursionsState]);

  const visibleResources = useMemo(() => {
    return buildVisibleResources(resources);
  }, [resources]);

  const rootClassName = [
    'dashboard-topbar',
    `dashboard-topbar--${activity.kind}`,
    isSidebarCollapsed ? 'dashboard-topbar--sidebar-collapsed' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  function handleRefresh() {
    if (!onRefresh) return;

    void onRefresh();
  }

  return (
    <header
      className={rootClassName}
      data-character-id={characterId ?? undefined}
      aria-label="Barra superior do dashboard"
    >
      <section
        className="dashboard-topbar__activity"
        aria-label="Atividade atual"
        title={activity.titleText}
      >
        {activity.progressPercent !== null &&
        activity.progressPercent !== undefined ? (
          <span className="dashboard-topbar__activity-progress" aria-hidden="true">
            <span
              style={{
                width: `${clampPercent(activity.progressPercent)}%`,
              }}
            />
          </span>
        ) : null}

        <span className="dashboard-topbar__activity-icon" aria-hidden="true">
          {activity.imageUrl ? (
            <img
              src={activity.imageUrl}
              alt=""
              draggable={false}
              className="dashboard-topbar__activity-image"
            />
          ) : (
            <span>{activity.icon}</span>
          )}
        </span>

        <span className="dashboard-topbar__activity-copy">
          <strong title={activity.title}>{activity.title}</strong>
          <small>{activity.subtitle}</small>
        </span>

        <span className="dashboard-topbar__activity-status" aria-hidden="true">
          <span className="dashboard-topbar__activity-status-ring" />
          <span className="dashboard-topbar__activity-status-core" />

          {activity.badge ? (
            <span className="dashboard-topbar__activity-status-bubble">
              {activity.badge}
            </span>
          ) : null}
        </span>
      </section>

      <nav className="dashboard-topbar__resources" aria-label="Recursos rápidos">
        {visibleResources.map((resource) => (
          <span
            key={resource.key}
            className={getResourceClassName(resource)}
            title={resource.title ?? resource.label}
          >
            {resource.icon ? (
              <span className="dashboard-topbar__resource-icon">
                {resource.icon}
              </span>
            ) : null}

            <span className="dashboard-topbar__resource-value">
              {resource.value}
            </span>
          </span>
        ))}

        {onRefresh ? (
          <button
            type="button"
            className="dashboard-topbar__refresh"
            onClick={handleRefresh}
            aria-label="Atualizar painel"
            title="Atualizar painel"
          >
            ↻
          </button>
        ) : null}
      </nav>
    </header>
  );
}

export default DashboardTopBar;