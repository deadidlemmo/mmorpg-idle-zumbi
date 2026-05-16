import { isAxiosError } from 'axios';
import { Clock, Coins, Lock, MapPin, PackageOpen, ShieldAlert, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type { CharacterOverviewResponse, DashboardCharacterViewModel } from '../../dashboard/types/dashboard.types';
import { claimIncursion, getAvailableIncursions, startIncursion } from '../api/incursions.api';
import '../styles/incursions.css';
import type { ClaimIncursionResponse, Incursion, IncursionLootPreview, IncursionSession, IncursionsAvailableResponse } from '../types/incursions.types';

function buildCharacterViewModel(overview: CharacterOverviewResponse): DashboardCharacterViewModel {
  const character = overview.character;
  const className = character.class?.name ?? character.gameClass?.name ?? 'Lutador';

  return {
    ...character,
    id: character.id,
    name: character.name,
    className,
    classId: character.classId ?? normalizeClassName(className),
    level: character.level ?? 1,
    xp: character.xp ?? 0,
    totalXp: character.totalXp ?? character.levelProgress?.totalXp ?? character.xp ?? 0,
    currentHp: character.currentHp ?? character.maxHp ?? 1,
    maxHp: character.maxHp ?? 1,
    status: character.status ?? 'ACTIVE',
  };
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function formatRemaining(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatReward(loot: IncursionLootPreview) {
  const quantity = loot.minQuantity === loot.maxQuantity ? `${loot.minQuantity}` : `${loot.minQuantity}-${loot.maxQuantity}`;
  const chance = loot.guaranteed ? 'Garantido' : `${loot.chance}%`;

  if (loot.rewardType === 'XP') return `${quantity} EXP • ${chance}`;
  if (loot.rewardType === 'GOLD') return `${quantity} gold • ${chance}`;

  return `${loot.item?.name ?? loot.rewardType} x${quantity} • ${chance}`;
}

function getDifficultyLabel(difficulty: string) {
  const labels: Record<string, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    EXTREME: 'Extrema',
  };

  return labels[difficulty] ?? difficulty;
}

function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(' ');
    if (data?.message) return data.message;
  }

  return 'Não foi possível executar a ação de incursão.';
}

export function IncursionsPage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(null);
  const [data, setData] = useState<IncursionsAvailableResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [claimSummary, setClaimSummary] = useState<ClaimIncursionResponse | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadData = useCallback(async () => {
    if (!characterId) return;

    const [overviewResponse, incursionsResponse] = await Promise.all([
      getCharacterOverview(characterId),
      getAvailableIncursions(characterId),
    ]);

    setOverview(overviewResponse);
    setData(incursionsResponse);
  }, [characterId]);

  useEffect(() => {
    if (!characterId) return;

    let disposed = false;

    async function load() {
      try {
        if (!disposed) setIsLoading(true);
        await loadData();
      } catch (error) {
        if (!disposed) setErrorMessage(getErrorMessage(error));
      } finally {
        if (!disposed) setIsLoading(false);
      }
    }

    load();
    const intervalId = window.setInterval(() => {
      loadData().catch(() => undefined);
    }, 5000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [characterId, loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const activeSession = data?.activeSession ?? null;
  const liveSession = useMemo<IncursionSession | null>(() => {
    if (!activeSession) return null;

    const endsAtMs = Date.parse(activeSession.endsAt);
    const startedAtMs = Date.parse(activeSession.startedAt);
    const totalMs = Math.max(1, endsAtMs - startedAtMs);
    const elapsedMs = Math.max(0, Math.min(totalMs, nowMs - startedAtMs));
    const isCompleted = nowMs >= endsAtMs;

    return {
      ...activeSession,
      status: activeSession.status === 'ACTIVE' && isCompleted ? 'COMPLETED' : activeSession.status,
      remainingSeconds: Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000)),
      progressPercent: Math.round((elapsedMs / totalMs) * 100),
      canClaim: activeSession.canClaim || isCompleted,
    };
  }, [activeSession, nowMs]);

  const incursionsByMap = useMemo(() => {
    const groups = new Map<string, Incursion[]>();

    for (const incursion of data?.incursions ?? []) {
      const key = incursion.map?.name ?? 'Sem mapa';
      groups.set(key, [...(groups.get(key) ?? []), incursion]);
    }

    return Array.from(groups.entries());
  }, [data?.incursions]);

  if (!characterId) return <Navigate to="/characters" replace />;

  if (!overview && isLoading) {
    return <div className="incursions-page incursions-page--loading">Carregando incursões...</div>;
  }

  if (!overview) return <Navigate to="/characters" replace />;

  const character = buildCharacterViewModel(overview);
  const gold = data?.character.gold ?? 0;

  async function handleStart(incursionId: string) {
    if (!characterId) return;

    setActionId(incursionId);
    setErrorMessage(null);
    setSuccessMessage(null);
    setClaimSummary(null);

    try {
      const response = await startIncursion(characterId, incursionId);
      setSuccessMessage(response.message);
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionId(null);
    }
  }

  async function handleClaim(sessionId: string) {
    if (!characterId) return;

    setActionId(sessionId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await claimIncursion(characterId, sessionId);
      setClaimSummary(response);
      setSuccessMessage(response.message);
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionId(null);
    }
  }

  return (
    <DashboardLayout character={character} hideHero>
      <main className="incursions-page">
        <section className="incursions-hero">
          <div>
            <span className="incursions-hero__eyebrow">Atividade especial por mapa</span>
            <h1>Incursões</h1>
            <p>
              Pague gold para enviar o personagem a áreas infestadas temporizadas. O loot, custo,
              duração e recompensas vêm do banco e podem ser rebalanceados pelo seed.
            </p>
          </div>

          <div className="incursions-wallet">
            <Coins size={20} />
            <span>Gold disponível</span>
            <strong>{gold.toLocaleString('pt-BR')}</strong>
          </div>
        </section>

        {errorMessage ? <div className="incursions-alert incursions-alert--error">{errorMessage}</div> : null}
        {successMessage ? <div className="incursions-alert incursions-alert--success">{successMessage}</div> : null}

        {liveSession ? (
          <section className="incursions-active">
            <div className="incursions-active__icon"><ShieldAlert size={26} /></div>
            <div>
              <span>{liveSession.status === 'COMPLETED' ? 'Incursão concluída' : 'Incursão ativa'}</span>
              <h2>{liveSession.incursion.name}</h2>
              <p>{liveSession.incursion.map.name} • custo pago: {liveSession.goldCostPaid.toLocaleString('pt-BR')} gold</p>
              <div className="incursions-active__progress"><i style={{ width: `${Math.min(100, Math.max(0, liveSession.progressPercent))}%` }} /></div>
            </div>
            <div className="incursions-active__actions">
              <strong>{liveSession.canClaim ? 'Recompensas pendentes' : `Termina em ${formatRemaining(liveSession.remainingSeconds)}`}</strong>
              <button type="button" disabled={!liveSession.canClaim || actionId === liveSession.id} onClick={() => handleClaim(liveSession.id)}>
                {actionId === liveSession.id ? 'Coletando...' : 'Coletar recompensas'}
              </button>
            </div>
          </section>
        ) : null}

        {claimSummary ? (
          <section className="incursions-claim-summary">
            <h2>Resumo da coleta</h2>
            <p>EXP: {claimSummary.xpGained.toLocaleString('pt-BR')} • Gold: {claimSummary.goldGained.toLocaleString('pt-BR')}</p>
            <div>
              {claimSummary.rewards.map((reward, index) => (
                <span key={`${reward.rewardType}-${reward.itemId ?? index}`}>
                  {reward.itemName ?? reward.rewardType} x{reward.quantity}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="incursions-map-list">
          {incursionsByMap.map(([mapName, incursions]) => (
            <div className="incursions-map-group" key={mapName}>
              <header>
                <MapPin size={18} />
                <div>
                  <h2>{mapName}</h2>
                  <span>Tier {incursions[0]?.tier ?? '—'} • {incursions.length} incursões</span>
                </div>
              </header>

              <div className="incursions-grid">
                {incursions.map((incursion) => {
                  const lockedReasons = incursion.lockedReasons ?? [];
                  const isLocked = !incursion.canStart;
                  const isRunningThis = liveSession?.incursionId === incursion.id;

                  return (
                    <article className={`incursion-card ${isLocked ? 'is-locked' : ''}`} key={incursion.id}>
                      <div className="incursion-card__top">
                        <span className="incursion-card__tier">Tier {incursion.tier}</span>
                        <span className={`incursion-card__difficulty incursion-card__difficulty--${incursion.difficulty.toLowerCase()}`}>
                          {getDifficultyLabel(incursion.difficulty)}
                        </span>
                      </div>

                      <h3>{incursion.name}</h3>
                      <p>{incursion.description}</p>

                      <div className="incursion-card__meta">
                        <span><Clock size={15} />{formatDuration(incursion.durationSeconds)}</span>
                        <span><Coins size={15} />{incursion.goldCost.toLocaleString('pt-BR')} gold</span>
                        <span><ShieldAlert size={15} />Risco {incursion.riskLevel}/10</span>
                      </div>

                      <div className="incursion-card__level">Nível {incursion.minLevel}–{incursion.maxLevel}</div>

                      <div className="incursion-card__rewards">
                        <strong><PackageOpen size={15} /> Recompensas possíveis</strong>
                        <ul>
                          {incursion.rewardsPreview.map((loot) => (
                            <li key={loot.id ?? `${loot.rewardType}-${loot.sortOrder}`}>
                              <Sparkles size={13} /> {formatReward(loot)}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {lockedReasons.length > 0 ? (
                        <div className="incursion-card__locked"><Lock size={14} /> {lockedReasons.join(' • ')}</div>
                      ) : null}

                      <button type="button" disabled={isLocked || Boolean(liveSession) || actionId === incursion.id} onClick={() => handleStart(incursion.id)}>
                        {isRunningThis ? 'Em andamento' : actionId === incursion.id ? 'Iniciando...' : 'Iniciar incursão'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </main>
    </DashboardLayout>
  );
}