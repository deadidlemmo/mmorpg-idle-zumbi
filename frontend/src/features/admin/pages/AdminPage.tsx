import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Gauge,
  HardDrive,
  PackagePlus,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAdminAuditLogs,
  getAdminOperations,
  getAdminProductMetrics,
  getAdminSummary,
  getAdminUserCosmetics,
  getAdminUsers,
  grantAdminCosmetics,
  revokeAdminCosmetic,
  setAdminUserSuspension,
  startAdminAutoCombatCapture,
  type AdminCosmeticEntitlement,
  type AdminAuditLog,
  type AdminMetricSeries,
  type AdminOperations,
  type AdminProductMetrics,
  type AdminSummary,
  type AdminUser,
} from "../api/admin.api";
import "../styles/admin.css";

function formatDate(value?: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "Sem dados";
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}min`
      : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatDependencyStatus(status?: "up" | "down" | "disabled") {
  if (status === "up") return "Ativo";
  if (status === "down") return "Indisponível";
  if (status === "disabled") return "Desativado";
  return "...";
}

function formatBackupState(state?: "healthy" | "stale" | "failed" | "unknown") {
  if (state === "healthy") return "Saudável";
  if (state === "stale") return "Desatualizado";
  if (state === "failed") return "Falhou";
  return "Sem dados";
}

function formatMetricNumber(value: number) {
  return value.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
}

function formatMetricSampleCount(series?: AdminMetricSeries) {
  return series?.samples ?? 0;
}

function formatMetricPercentile(
  series: AdminMetricSeries | undefined,
  percentile: "p50" | "p95" | "p99" | "max",
  suffix = " ms",
) {
  if (!series?.samples) return "Sem amostras";
  return `${formatMetricNumber(series[percentile])}${suffix}`;
}

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="admin-pagination" aria-label="Paginação">
      <button
        type="button"
        title="Página anterior"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={17} />
      </button>
      <span>
        {page} / {pageCount}
      </span>
      <button
        type="button"
        title="Próxima página"
        aria-label="Próxima página"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

export function AdminPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [operations, setOperations] = useState<AdminOperations | null>(null);
  const [productMetrics, setProductMetrics] =
    useState<AdminProductMetrics | null>(null);
  const [productPeriodDays, setProductPeriodDays] = useState(30);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageCount, setUsersPageCount] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageCount, setAuditPageCount] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedCosmeticUser, setSelectedCosmeticUser] =
    useState<AdminUser | null>(null);
  const [cosmeticEntitlements, setCosmeticEntitlements] = useState<
    AdminCosmeticEntitlement[]
  >([]);
  const [cosmeticCollectionKey, setCosmeticCollectionKey] = useState(
    "premium-ultimo-abrigo",
  );
  const [cosmeticGrantSource, setCosmeticGrantSource] =
    useState<AdminCosmeticEntitlement["source"]>("ADMIN");
  const [cosmeticSourceReference, setCosmeticSourceReference] = useState("");
  const [cosmeticExpiresAt, setCosmeticExpiresAt] = useState("");
  const [cosmeticMessage, setCosmeticMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingCapture, setIsStartingCapture] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [
        summaryResponse,
        operationsResponse,
        productResponse,
        usersResponse,
        auditResponse,
      ] = await Promise.all([
        getAdminSummary(),
        getAdminOperations(),
        getAdminProductMetrics(productPeriodDays),
        getAdminUsers(appliedSearch, usersPage),
        getAdminAuditLogs(auditPage),
      ]);
      setSummary(summaryResponse);
      setOperations(operationsResponse);
      setProductMetrics(productResponse);
      setUsers(usersResponse.users);
      setUsersPageCount(usersResponse.pageCount);
      setAuditLogs(auditResponse.logs);
      setAuditPageCount(auditResponse.pageCount);
    } catch {
      setError("Não foi possível carregar os dados administrativos.");
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, auditPage, productPeriodDays, usersPage]);

  useEffect(() => {
    // A sincronizacao inicial e executada pelo carregador assincrono da pagina.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const metricCards = useMemo(() => {
    if (!summary) return [];
    const counts = summary.counts;
    return [
      { label: "Contas", value: counts.users, icon: Users },
      { label: "Personagens", value: counts.characters, icon: ShieldCheck },
      {
        label: "Atividades ativas",
        value:
          counts.activeAutoCombats +
          counts.activeGathering +
          counts.activeCrafting +
          counts.activeIncursions +
          counts.activeWorldBossParticipants,
        icon: Activity,
      },
      { label: "Suspensas", value: counts.suspendedUsers, icon: ShieldOff },
    ];
  }, [summary]);

  async function saveSuspension() {
    if (!selectedUser) return;
    setIsSaving(true);
    setError(null);

    try {
      await setAdminUserSuspension(
        selectedUser.id,
        !selectedUser.isSuspended,
        reason,
      );
      setSelectedUser(null);
      setReason("");
      await load();
    } catch {
      setError("Não foi possível atualizar a conta.");
    } finally {
      setIsSaving(false);
    }
  }

  async function openCosmetics(user: AdminUser) {
    setSelectedCosmeticUser(user);
    setCosmeticMessage(null);
    setIsSaving(true);
    try {
      const response = await getAdminUserCosmetics(user.id);
      setCosmeticEntitlements(response.entitlements);
    } catch {
      setError("Não foi possível carregar os cosméticos da conta.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCosmeticGrant() {
    if (!selectedCosmeticUser) return;
    setIsSaving(true);
    setError(null);
    setCosmeticMessage(null);
    try {
      const response = await grantAdminCosmetics({
        userId: selectedCosmeticUser.id,
        collectionKey: cosmeticCollectionKey,
        source: cosmeticGrantSource,
        sourceReference: cosmeticSourceReference.trim() || undefined,
        expiresAt: cosmeticExpiresAt
          ? new Date(cosmeticExpiresAt).toISOString()
          : undefined,
      });
      setCosmeticMessage(response.message);
      const refreshed = await getAdminUserCosmetics(selectedCosmeticUser.id);
      setCosmeticEntitlements(refreshed.entitlements);
    } catch {
      setError("Não foi possível conceder o pacote cosmético.");
    } finally {
      setIsSaving(false);
    }
  }

  async function revokeCosmetic(entitlementId: string) {
    if (!selectedCosmeticUser) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await revokeAdminCosmetic(entitlementId);
      setCosmeticMessage(response.message);
      const refreshed = await getAdminUserCosmetics(selectedCosmeticUser.id);
      setCosmeticEntitlements(refreshed.entitlements);
    } catch {
      setError("Não foi possível revogar o cosmético.");
    } finally {
      setIsSaving(false);
    }
  }

  async function startCleanAutoCombatCapture() {
    setIsStartingCapture(true);
    setError(null);

    try {
      await startAdminAutoCombatCapture();
      setOperations(await getAdminOperations());
    } catch {
      setError("Não foi possível iniciar uma nova coleta de auto-combate.");
    } finally {
      setIsStartingCapture(false);
    }
  }

  const backup = operations?.health.backup;
  const backupTimestamp =
    backup?.lastVerification?.verifiedAt ?? backup?.lastVerification?.failedAt;
  const autoCombatMetrics = operations?.autoCombat;
  const autoCombatCapture = operations?.capture;
  const autoCombatCoverage = autoCombatMetrics?.coverage;
  const autoCombatRates = autoCombatMetrics?.rates;
  const autoCombatContexts = autoCombatMetrics?.telemetryByContext;

  return (
    <main className="admin-page" aria-busy={isLoading}>
      <header className="admin-header">
        <div>
          <Link className="admin-back" to="/characters">
            <ArrowLeft size={17} /> Personagens
          </Link>
          <h1>Operação do jogo</h1>
          <p>Contas, infraestrutura e auditoria.</p>
        </div>
        <button
          className="admin-icon-button"
          type="button"
          onClick={() => void load()}
          title="Atualizar"
          aria-label="Atualizar"
        >
          <RefreshCw size={18} className={isLoading ? "is-spinning" : ""} />
        </button>
      </header>

      {error ? <div className="form-error-box">{error}</div> : null}

      <section className="admin-metrics" aria-label="Resumo operacional">
        {metricCards.map(({ label, value, icon: Icon }) => (
          <article className="admin-metric" key={label}>
            <Icon size={18} />
            <strong>{new Intl.NumberFormat("pt-BR").format(value)}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      <section className="admin-section admin-product-section">
        <div className="admin-section-heading">
          <div>
            <h2>Produto e primeira hora</h2>
            <p>Ativação, retenção e circulação econômica T1-T5.</p>
          </div>
          <div
            className="admin-period-control"
            role="group"
            aria-label="Período das métricas"
          >
            {[7, 30, 90].map((days) => (
              <button
                className={productPeriodDays === days ? "is-active" : ""}
                key={days}
                type="button"
                aria-pressed={productPeriodDays === days}
                onClick={() => setProductPeriodDays(days)}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        <div className="admin-product-kpis">
          <article>
            <span>Retenção D1</span>
            <strong>
              {productMetrics?.retention.d1.retentionPercent ?? 0}%
            </strong>
            <small>
              {productMetrics?.retention.d1.retainedUsers ?? 0} de{" "}
              {productMetrics?.retention.d1.eligibleUsers ?? 0} elegíveis
            </small>
          </article>
          <article>
            <span>Retenção D7</span>
            <strong>
              {productMetrics?.retention.d7.retentionPercent ?? 0}%
            </strong>
            <small>
              {productMetrics?.retention.d7.retainedUsers ?? 0} de{" "}
              {productMetrics?.retention.d7.eligibleUsers ?? 0} elegíveis
            </small>
          </article>
          <article>
            <span>Primeiro T1 equipado</span>
            <strong>
              {formatDuration(productMetrics?.timeToFirstEquipment.p50Seconds)}
            </strong>
            <small>
              Mediana de {productMetrics?.timeToFirstEquipment.samples ?? 0}{" "}
              personagens
            </small>
          </article>
          <article>
            <span>P90 até o primeiro T1</span>
            <strong>
              {formatDuration(productMetrics?.timeToFirstEquipment.p90Seconds)}
            </strong>
            <small>
              {productMetrics?.timeToFirstEquipment.exactTrackedSamples ?? 0}{" "}
              amostras com marco exato
            </small>
          </article>
        </div>

        <div className="admin-product-grid">
          <div className="admin-funnel" aria-label="Funil da primeira hora">
            <header>
              <div>
                <strong>Funil da primeira hora</strong>
                <span>
                  Coorte de {productMetrics?.funnel.cohortUsers ?? 0} contas
                </span>
              </div>
              <time>
                {productMetrics
                  ? formatDate(productMetrics.generatedAt)
                  : "Carregando"}
              </time>
            </header>
            <ol>
              {productMetrics?.funnel.steps.map((step) => (
                <li key={step.key}>
                  <div>
                    <span>{step.label}</span>
                    <strong>{step.count}</strong>
                  </div>
                  <i aria-hidden="true">
                    <em style={{ width: `${step.rateFromStartPercent}%` }} />
                  </i>
                  <small>
                    {step.rateFromStartPercent}% da coorte ·{" "}
                    {step.rateFromPreviousPercent}% da etapa anterior
                  </small>
                </li>
              )) ?? null}
            </ol>
          </div>

          <div className="admin-economy" aria-label="Economia por tier">
            <header>
              <strong>Economia por tier</strong>
              <span>Fluxo no período e estoque atual</span>
            </header>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Coletado</th>
                    <th>Consumido</th>
                    <th>Criado</th>
                    <th>Estoque</th>
                    <th>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {productMetrics?.economy.tiers.map((tier) => (
                    <tr key={tier.tier}>
                      <td>
                        <strong>T{tier.tier}</strong>
                      </td>
                      <td>{tier.gatheredUnits.toLocaleString("pt-BR")}</td>
                      <td>{tier.consumedUnits.toLocaleString("pt-BR")}</td>
                      <td>{tier.craftedUnits.toLocaleString("pt-BR")}</td>
                      <td>{tier.materialStock.toLocaleString("pt-BR")}</td>
                      <td
                        className={
                          tier.netMaterialFlow < 0
                            ? "is-negative"
                            : "is-positive"
                        }
                      >
                        {tier.netMaterialFlow > 0 ? "+" : ""}
                        {tier.netMaterialFlow.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  )) ?? null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <p className="admin-product-note">
          D1 e D7 consideram login na janela exata de 24 horas. Marcos
          anteriores ao rastreamento dedicado usam o histórico operacional
          disponível.
        </p>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div>
            <h2>Infraestrutura</h2>
            <p>Estado atual da API e das dependências.</p>
          </div>
          {operations ? (
            <time>Atualizado {formatDate(operations.generatedAt)}</time>
          ) : null}
        </div>

        <div className="admin-operations-grid">
          <article className="admin-operation-panel">
            <header>
              <Server size={18} />
              <strong>Serviços</strong>
              <span
                className={operations?.health.ready ? "is-ok" : "is-critical"}
              >
                {operations?.health.ready ? "Operacional" : "Degradado"}
              </span>
            </header>
            <dl>
              <div>
                <dt>
                  <Database size={15} /> PostgreSQL
                </dt>
                <dd>
                  {formatDependencyStatus(
                    operations?.health.dependencies.database,
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Gauge size={15} /> Redis
                </dt>
                <dd>
                  {formatDependencyStatus(
                    operations?.health.dependencies.redis,
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Clock3 size={15} /> Uptime
                </dt>
                <dd>
                  {operations
                    ? formatUptime(operations.health.uptimeSeconds)
                    : "..."}
                </dd>
              </div>
              <div>
                <dt>Heap / RSS</dt>
                <dd>
                  {operations
                    ? `${formatBytes(operations.health.memory.heapUsedBytes)} / ${formatBytes(operations.health.memory.rssBytes)}`
                    : "..."}
                </dd>
              </div>
            </dl>
          </article>

          <article className="admin-operation-panel">
            <header>
              <HardDrive size={18} />
              <strong>Backups</strong>
              <span
                className={
                  backup?.state === "healthy"
                    ? "is-ok"
                    : backup?.state === "failed"
                      ? "is-critical"
                      : "is-warning"
                }
              >
                {formatBackupState(backup?.state)}
              </span>
            </header>
            <dl>
              <div>
                <dt>Último arquivo</dt>
                <dd>{backup?.lastBackup?.file ?? "Não registrado"}</dd>
              </div>
              <div>
                <dt>Idade</dt>
                <dd>
                  {backup?.backupAgeHours === null ||
                  backup?.backupAgeHours === undefined
                    ? "Sem dado"
                    : `${backup.backupAgeHours.toFixed(1)}h`}
                </dd>
              </div>
              <div>
                <dt>Verificação</dt>
                <dd>{formatDate(backupTimestamp)}</dd>
              </div>
              <div>
                <dt>Último restore</dt>
                <dd>{formatDate(backup?.lastRestore?.restoredAt)}</dd>
              </div>
            </dl>
          </article>

          <article className="admin-operation-panel">
            <header>
              <Activity size={18} />
              <strong>HTTP</strong>
              <span>{operations?.http.inFlightRequests ?? 0} em curso</span>
            </header>
            <dl>
              <div>
                <dt>Requisições</dt>
                <dd>{operations?.http.requests ?? 0}</dd>
              </div>
              <div>
                <dt>Erros 5xx</dt>
                <dd>{operations?.http.errors ?? 0}</dd>
              </div>
              <div>
                <dt>Taxa de erro</dt>
                <dd>{operations?.http.errorRatePercent ?? 0}%</dd>
              </div>
              <div>
                <dt>Latência média / pico</dt>
                <dd>
                  {operations
                    ? `${operations.http.averageDurationMs} / ${operations.http.maxDurationMs} ms`
                    : "..."}
                </dd>
              </div>
              <div>
                <dt>
                  Amostras recentes (
                  {operations?.http.sampleWindowMinutes ?? 15}
                  min)
                </dt>
                <dd>{operations?.http.recentLatency?.samples ?? 0}</dd>
              </div>
              <div>
                <dt>p50 / p95 / p99</dt>
                <dd>
                  {operations?.http.recentLatency?.samples
                    ? `${formatMetricNumber(operations.http.recentLatency.p50)} / ${formatMetricNumber(operations.http.recentLatency.p95)} / ${formatMetricNumber(operations.http.recentLatency.p99)} ms`
                    : "Sem amostras"}
                </dd>
              </div>
            </dl>
          </article>
        </div>

        <div className="admin-alerts" aria-label="Alertas ativos">
          {operations?.health.alerts.length ? (
            operations.health.alerts.map((alert) => (
              <div key={alert.code} className={`is-${alert.severity}`}>
                <AlertTriangle size={16} />
                <strong>{alert.code}</strong>
                <span>{alert.message}</span>
              </div>
            ))
          ) : (
            <div className="is-clear">
              <CheckCircle2 size={16} />
              <strong>Sem alertas ativos</strong>
            </div>
          )}
        </div>

        <div
          className="admin-autocombat-observability"
          aria-label="Linha de base do auto-combate"
        >
          <header>
            <div>
              <Activity size={18} />
              <div>
                <strong>Auto-combate</strong>
                <span>
                  Percentis em janela móvel de{" "}
                  {autoCombatMetrics?.sampleWindowMinutes ?? 15} min; contadores
                  desde o último boot.
                </span>
              </div>
            </div>
            <div className="admin-autocombat-header-actions">
              <div className="admin-autocombat-capture">
                <strong title={autoCombatCapture?.id}>
                  Coleta {autoCombatCapture?.id.slice(0, 8) ?? "..."}
                </strong>
                <span>
                  {autoCombatCapture
                    ? `${formatDate(autoCombatCapture.startedAt)} · ${formatDuration(autoCombatCapture.elapsedSeconds)}`
                    : "Aguardando dados"}
                </span>
              </div>
              <button
                type="button"
                className="admin-capture-button"
                disabled={isStartingCapture}
                onClick={() => void startCleanAutoCombatCapture()}
              >
                <Play size={15} />
                {isStartingCapture ? "Iniciando..." : "Iniciar coleta limpa"}
              </button>
            </div>
          </header>

          <dl>
            <div>
              <dt>Loops / sockets ativos</dt>
              <dd>
                {autoCombatMetrics
                  ? `${autoCombatMetrics.activeLoops} / ${autoCombatMetrics.activeSockets}`
                  : "Sem dados"}
              </dd>
              <span>Processadores e clientes conectados</span>
            </div>
            <div>
              <dt>Ticks / erros</dt>
              <dd>
                {autoCombatMetrics
                  ? `${autoCombatMetrics.ticks.toLocaleString("pt-BR")} / ${autoCombatMetrics.tickErrors.toLocaleString("pt-BR")}`
                  : "Sem dados"}
              </dd>
              <span>
                p95{" "}
                {formatMetricPercentile(autoCombatMetrics?.tickDuration, "p95")}
              </span>
            </div>
            <div>
              <dt>Locks não adquiridos</dt>
              <dd>
                {autoCombatMetrics?.distributedLockMisses.toLocaleString(
                  "pt-BR",
                ) ?? "Sem dados"}
              </dd>
              <span>
                Espera p95{" "}
                {formatMetricPercentile(
                  autoCombatMetrics?.processingLockWait,
                  "p95",
                )}
              </span>
            </div>
            <div>
              <dt>Emissão de eventos p95</dt>
              <dd>
                {formatMetricPercentile(
                  autoCombatMetrics?.eventEmissionDelay,
                  "p95",
                )}
              </dd>
              <span>
                {formatMetricSampleCount(autoCombatMetrics?.eventEmissionDelay)}{" "}
                amostras · {autoCombatMetrics?.realtimeEventsEmitted ?? 0}{" "}
                eventos ·{" "}
                {autoCombatMetrics?.realtimeEventsByType?.MOB_DEFEATED ?? 0}{" "}
                derrotas
              </span>
            </div>
            <div>
              <dt>Trânsito cliente p50 / p95</dt>
              <dd>
                {autoCombatMetrics?.clientEventTransitDelay.samples
                  ? `${formatMetricNumber(autoCombatMetrics.clientEventTransitDelay.p50)} / ${formatMetricNumber(autoCombatMetrics.clientEventTransitDelay.p95)} ms`
                  : "Sem amostras"}
              </dd>
              <span>
                {autoCombatMetrics?.clientEventReports ?? 0} recebidos ·{" "}
                {autoCombatMetrics?.clientEventsByType?.MOB_DEFEATED ?? 0}{" "}
                derrotas
              </span>
            </div>
            <div>
              <dt>Fila visual p95</dt>
              <dd>
                {formatMetricPercentile(
                  autoCombatMetrics?.clientQueueDepth,
                  "p95",
                  " eventos",
                )}
              </dd>
              <span>
                {autoCombatMetrics?.sequenceGaps ?? 0} lacunas ·{" "}
                {autoCombatMetrics?.outOfOrderEvents ?? 0} fora de ordem
              </span>
            </div>
            <div>
              <dt>Duração visual p50</dt>
              <dd>
                {formatMetricPercentile(
                  autoCombatMetrics?.visualCycleDuration,
                  "p50",
                )}
              </dd>
              <span>
                Relação p50{" "}
                {formatMetricPercentile(
                  autoCombatMetrics?.visualCycleRatioPercent,
                  "p50",
                  "%",
                )}
              </span>
            </div>
            <div>
              <dt>Ciclos comprimidos</dt>
              <dd>{autoCombatMetrics?.compressedVisualCycles ?? 0}</dd>
              <span>Duração observada abaixo de 90% da prevista</span>
            </div>
            <div>
              <dt>Duplicados / suprimidos</dt>
              <dd>
                {autoCombatMetrics
                  ? `${autoCombatMetrics.duplicateEvents} / ${autoCombatMetrics.suppressedEvents}`
                  : "Sem dados"}
              </dd>
              <span>Transporte repetido / apresentação descartada</span>
            </div>
            <div>
              <dt>Reconciliações / eventos</dt>
              <dd>
                {autoCombatMetrics
                  ? `${autoCombatMetrics.reconciliationRuns} / ${autoCombatMetrics.reconciledEvents}`
                  : "Sem dados"}
              </dd>
              <span>
                {autoCombatMetrics?.realSequenceGaps ?? 0} lacunas reais ·{" "}
                {autoCombatMetrics?.candidateSequenceGaps ?? 0} candidatas
              </span>
            </div>
            <div>
              <dt>Retornos / reconexões</dt>
              <dd>
                {autoCombatMetrics
                  ? `${autoCombatMetrics.visibilityReturns} / ${autoCombatMetrics.reconnects}`
                  : "Sem dados"}
              </dd>
              <span>
                Aba oculta p50{" "}
                {formatMetricPercentile(
                  autoCombatMetrics?.hiddenDuration,
                  "p50",
                )}
              </span>
            </div>
            <div>
              <dt>Ciclos após alt-tab</dt>
              <dd>
                {autoCombatMetrics?.visualCyclesAfterVisibilityReturn ?? 0}
              </dd>
              <span>
                p50{" "}
                {formatMetricPercentile(
                  autoCombatMetrics?.visualCycleAfterVisibilityDuration,
                  "p50",
                )}{" "}
                ·{" "}
                {formatMetricPercentile(
                  autoCombatMetrics?.visualCycleAfterVisibilityRatioPercent,
                  "p50",
                  "%",
                )}
              </span>
            </div>
            <div>
              <dt>Cobertura emissão / trânsito</dt>
              <dd>
                {autoCombatCoverage
                  ? `${autoCombatCoverage.eventEmissionDelay.percent}% / ${autoCombatCoverage.clientTransitDelay.percent}%`
                  : "Sem dados"}
              </dd>
              <span>
                {autoCombatCoverage
                  ? `${autoCombatCoverage.eventEmissionDelay.sampled}/${autoCombatCoverage.eventEmissionDelay.eligible} · ${autoCombatCoverage.clientTransitDelay.sampled}/${autoCombatCoverage.clientTransitDelay.eligible}`
                  : "Amostras / eventos elegíveis"}
              </span>
            </div>
            <div>
              <dt>Ticks / eventos por segundo</dt>
              <dd>
                {autoCombatRates
                  ? `${formatMetricNumber(autoCombatRates.ticksPerSecond)} / ${formatMetricNumber(autoCombatRates.eventsPerSecond)}`
                  : "Sem dados"}
              </dd>
              <span>
                Cliente{" "}
                {formatMetricNumber(
                  autoCombatRates?.clientReportsPerSecond ?? 0,
                )}{" "}
                relatórios/s
              </span>
            </div>
          </dl>

          {autoCombatContexts ? (
            <div className="admin-autocombat-contexts">
              <h3>Contextos da coleta</h3>
              <div className="admin-autocombat-context-grid">
                {(
                  [
                    ["combat-page", "Tela de combate"],
                    ["other-page", "Outras páginas"],
                    ["tab-hidden", "Aba oculta"],
                    ["reconnected", "Reconectado"],
                  ] as const
                ).map(([context, label]) => {
                  const metrics = autoCombatContexts[context];

                  return (
                    <article key={context}>
                      <strong>{label}</strong>
                      <span>{metrics.reports} relatórios</span>
                      <span>{metrics.eventsReceived} recebidos</span>
                      <span>{metrics.duplicateEvents} duplicados</span>
                      <span>{metrics.suppressedEvents} suprimidos</span>
                      <span>{metrics.reconciledEvents} reconciliados</span>
                      <span>{metrics.realSequenceGaps} lacunas reais</span>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {operations?.http.routes.length ? (
          <div className="admin-route-list">
            <h3>
              Rotas com maior latência recente (
              {operations.http.sampleWindowMinutes ?? 15}
              min)
            </h3>
            {operations.http.routes.slice(0, 5).map((route) => (
              <div key={route.route}>
                <code>{route.route}</code>
                <span>{route.recentLatency?.samples ?? 0} amostras</span>
                <span>
                  p95 {formatMetricPercentile(route.recentLatency, "p95")}
                </span>
                <span>
                  máx {formatMetricPercentile(route.recentLatency, "max")}
                </span>
                <span>{route.errorRatePercent}% erro</span>
              </div>
            ))}
          </div>
        ) : null}

        {operations?.http.recentErrors?.length ? (
          <div className="admin-http-error-list">
            <h3>Erros 5xx desta coleta</h3>
            {operations.http.recentErrors.map((httpError) => (
              <div
                key={`${httpError.recordedAt}:${httpError.method}:${httpError.route}`}
              >
                <code>
                  {httpError.method} {httpError.route}
                </code>
                <strong>{httpError.statusCode}</strong>
                <span>{formatMetricNumber(httpError.durationMs)} ms</span>
                <time dateTime={httpError.recordedAt}>
                  {formatDate(httpError.recordedAt)}
                </time>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div>
            <h2>Contas</h2>
            <p>Suspensões revogam imediatamente os tokens ativos.</p>
          </div>
          <form
            className="admin-search"
            onSubmit={(event) => {
              event.preventDefault();
              setUsersPage(1);
              setAppliedSearch(search.trim());
            }}
          >
            <Search size={17} />
            <input
              value={search}
              placeholder="Buscar e-mail"
              aria-label="Buscar e-mail"
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Personagens</th>
                <th>Último acesso</th>
                <th>Status</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.email}</strong>
                    <span>{user.role}</span>
                  </td>
                  <td>{user._count.characters}</td>
                  <td>{formatDate(user.lastLoginAt)}</td>
                  <td>
                    <span
                      className={
                        user.isSuspended
                          ? "admin-status is-suspended"
                          : "admin-status"
                      }
                    >
                      {user.isSuspended ? "Suspensa" : "Ativa"}
                    </span>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="admin-row-action"
                        type="button"
                        onClick={() => void openCosmetics(user)}
                      >
                        <PackagePlus size={14} /> Cosméticos
                      </button>
                      <button
                        className="admin-row-action"
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setReason(user.suspensionReason ?? "");
                        }}
                      >
                        {user.isSuspended ? "Restaurar" : "Suspender"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && users.length === 0 ? (
            <p className="admin-empty">Nenhuma conta encontrada.</p>
          ) : null}
        </div>
        <Pagination
          page={usersPage}
          pageCount={usersPageCount}
          onChange={setUsersPage}
        />
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div>
            <h2>Auditoria</h2>
            <p>Mutações sensíveis registradas no backend.</p>
          </div>
        </div>
        <div className="admin-audit-list">
          {auditLogs.map((log) => (
            <article key={log.id}>
              <strong>{log.action}</strong>
              <span>{log.actor?.email ?? "Sistema"}</span>
              <time>{formatDate(log.createdAt)}</time>
            </article>
          ))}
        </div>
        <Pagination
          page={auditPage}
          pageCount={auditPageCount}
          onChange={setAuditPage}
        />
      </section>

      {selectedUser ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-modal-title"
          >
            <h2 id="admin-modal-title">
              {selectedUser.isSuspended ? "Restaurar conta" : "Suspender conta"}
            </h2>
            <p>{selectedUser.email}</p>
            {!selectedUser.isSuspended ? (
              <label>
                Motivo
                <textarea
                  value={reason}
                  maxLength={300}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            ) : null}
            <div className="admin-modal-actions">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => void saveSuspension()}
                disabled={
                  isSaving || (!selectedUser.isSuspended && !reason.trim())
                }
              >
                Confirmar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedCosmeticUser ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section
            className="admin-modal admin-modal--cosmetics"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-cosmetics-title"
          >
            <h2 id="admin-cosmetics-title">Cosméticos da conta</h2>
            <p>{selectedCosmeticUser.email}</p>

            <div className="admin-cosmetic-grant">
              <label>
                Coleção
                <select
                  value={cosmeticCollectionKey}
                  onChange={(event) =>
                    setCosmeticCollectionKey(event.target.value)
                  }
                >
                  <option value="premium-ultimo-abrigo">Último Abrigo</option>
                  <option value="premium-nucleo-helix">
                    Núcleo Helix (pacote)
                  </option>
                  <option value="premium-protocolo-carmesim">
                    Protocolo Carmesim (pacote)
                  </option>
                </select>
              </label>
              <label>
                Origem
                <select
                  value={cosmeticGrantSource}
                  onChange={(event) =>
                    setCosmeticGrantSource(
                      event.target.value as AdminCosmeticEntitlement["source"],
                    )
                  }
                >
                  <option value="ADMIN">Admin</option>
                  <option value="PURCHASE">Compra</option>
                  <option value="BUNDLE">Pacote</option>
                  <option value="SEASON_PASS">Passe</option>
                  <option value="EVENT">Evento</option>
                  <option value="ACHIEVEMENT">Conquista</option>
                </select>
              </label>
              <label>
                Referência
                <input
                  value={cosmeticSourceReference}
                  maxLength={120}
                  placeholder="pedido, passe ou campanha"
                  onChange={(event) =>
                    setCosmeticSourceReference(event.target.value)
                  }
                />
              </label>
              <label>
                Expira em
                <input
                  type="datetime-local"
                  value={cosmeticExpiresAt}
                  onChange={(event) => setCosmeticExpiresAt(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => void saveCosmeticGrant()}
                disabled={isSaving}
              >
                <PackagePlus size={15} /> Conceder coleção
              </button>
            </div>

            {cosmeticMessage ? (
              <p className="admin-cosmetic-message">{cosmeticMessage}</p>
            ) : null}

            <div className="admin-cosmetic-list">
              {cosmeticEntitlements.length ? (
                cosmeticEntitlements.map((entitlement) => (
                  <div key={entitlement.id}>
                    <span>
                      <strong>{entitlement.cosmetic.name}</strong>
                      <small>
                        {entitlement.cosmetic.collection?.name ?? "Sem coleção"}{" "}
                        · {entitlement.source}
                      </small>
                    </span>
                    <em className={entitlement.isActive ? "is-active" : ""}>
                      {entitlement.isActive ? "Ativo" : "Inativo"}
                    </em>
                    {entitlement.isActive ? (
                      <button
                        type="button"
                        title="Revogar cosmético"
                        aria-label={`Revogar ${entitlement.cosmetic.name}`}
                        disabled={isSaving}
                        onClick={() => void revokeCosmetic(entitlement.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="admin-empty">Nenhum direito concedido.</p>
              )}
            </div>

            <div className="admin-modal-actions">
              <button
                type="button"
                onClick={() => setSelectedCosmeticUser(null)}
                disabled={isSaving}
              >
                Fechar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
