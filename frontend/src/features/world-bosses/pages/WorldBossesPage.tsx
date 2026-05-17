import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import type { CharacterOverviewResponse, DashboardCharacterViewModel } from '../../dashboard/types/dashboard.types';
import { getActiveWorldBoss, joinWorldBoss, leaveWorldBoss } from '../api/world-bosses.api';
import type { WorldBossStatusResponse } from '../types/world-bosses.types';
import '../styles/world-bosses.css';

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(Math.max(0, Math.floor(value)));
}

function formatRemaining(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function buildCharacterViewModel(overview: CharacterOverviewResponse): DashboardCharacterViewModel {
  return {
    ...overview.character,
    id: overview.character.id,
    name: overview.character.name,
    level: overview.character.level ?? 1,
    className: overview.character.class?.name ?? overview.character.gameClass?.name ?? 'Sobrevivente',
    classId: overview.character.class?.name ?? overview.character.gameClass?.name ?? 'sobrevivente',
    currentMap: overview.character.currentMap ?? overview.character.map ?? overview.progression?.currentMap ?? null,
    map: overview.character.map ?? overview.character.currentMap ?? overview.progression?.currentMap ?? null,
  } as DashboardCharacterViewModel;
}

export function WorldBossesPage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(null);
  const [status, setStatus] = useState<WorldBossStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!characterId) return;
    let disposed = false;

    async function load() {
      try {
        const [overviewResponse, bossResponse] = await Promise.all([
          getCharacterOverview(characterId!),
          getActiveWorldBoss(characterId!),
        ]);
        if (disposed) return;
        setOverview(overviewResponse);
        setStatus(bossResponse);
        setError(null);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err.message : 'Não foi possível carregar as Ameaças Globais.');
      } finally {
        if (!disposed) setIsLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(() => void load(), 5000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [characterId]);

  const character = useMemo(() => (overview ? buildCharacterViewModel(overview) : null), [overview]);

  if (!characterId) return <Navigate to="/characters" replace />;

  async function handleJoin() {
    if (!characterId || !status?.event) return;
    setIsBusy(true);
    try {
      const next = await joinWorldBoss(characterId, status.event.id);
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar na ameaça.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLeave() {
    if (!characterId || !status?.event) return;
    setIsBusy(true);
    try {
      const next = await leaveWorldBoss(characterId, status.event.id);
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível sair da ameaça.');
    } finally {
      setIsBusy(false);
    }
  }

  if (!character) {
    return <main className="world-bosses-loading">Carregando Ameaças Globais...</main>;
  }

  const event = status?.event ?? null;
  const boss = event?.worldBoss ?? null;
  const participant = status?.participant ?? null;
  const canJoin = !participant && event?.status === 'ACTIVE';

  return (
    <DashboardLayout character={character} hideHero>
      <main className="world-bosses-page">
        <section className="world-bosses-hero">
          <div>
            <span className="world-bosses-eyebrow">Alerta de contenção coletiva</span>
            <h1>Ameaças Globais</h1>
            <p>
              Enfrente uma ameaça compartilhada do mapa atual. O dano é acumulado em modo idle e as recompensas escalam com o progresso coletivo e sua participação.
            </p>
          </div>
          <div className="world-bosses-hero__badge">World Boss por mapa/tier</div>
        </section>

        {error ? <div className="world-bosses-alert">{error}</div> : null}

        {isLoading ? (
          <section className="world-bosses-card world-bosses-empty">Sincronizando sinais da zona...</section>
        ) : !event || !boss ? (
          <section className="world-bosses-card world-bosses-empty">
            <strong>Nenhuma ameaça global ativa neste mapa.</strong>
            <span>Aguarde o próximo alerta de contenção.</span>
          </section>
        ) : (
          <section className="world-bosses-card world-bosses-boss">
            <div className="world-bosses-boss__portrait" aria-hidden="true">
              {boss.imageUrl ? <img src={boss.imageUrl} alt="" /> : <span>☣</span>}
            </div>

            <div className="world-bosses-boss__content">
              <header className="world-bosses-boss__header">
                <div>
                  <span>Tier {boss.tier} • {boss.map.name}</span>
                  <h2>{boss.name}</h2>
                  <p>{boss.description}</p>
                </div>
                <strong className={`world-bosses-status world-bosses-status--${event.status.toLowerCase()}`}>{event.status}</strong>
              </header>

              <div className="world-bosses-hp">
                <div className="world-bosses-hp__top">
                  <span>HP global</span>
                  <strong>{formatNumber(event.currentHp)} / {formatNumber(event.maxHp)}</strong>
                </div>
                <div className="world-bosses-hp__track"><i style={{ width: `${Math.max(0, Math.min(100, event.hpPercent))}%` }} /></div>
                <small>{Math.floor(event.progressPercent)}% de progresso coletivo</small>
              </div>

              <div className="world-bosses-metrics">
                <span><small>Tempo restante</small><strong>{formatRemaining(event.remainingSeconds)}</strong></span>
                <span><small>Participantes</small><strong>{event.participantCount}</strong></span>
                <span><small>Seu dano</small><strong>{formatNumber(participant?.damageDealt ?? 0)}</strong></span>
                <span><small>Sua contribuição</small><strong>{(participant?.contributionPercent ?? 0).toFixed(2)}%</strong></span>
              </div>

              <div className="world-bosses-actions">
                {canJoin ? <button type="button" onClick={handleJoin} disabled={isBusy}>Participar</button> : null}
                {participant && event.status === 'ACTIVE' ? <button type="button" className="world-bosses-actions__ghost" onClick={handleLeave} disabled={isBusy}>Sair da sala</button> : null}
                {participant?.eligibleForReward ? <span className="world-bosses-eligible">Participação mínima atingida</span> : <span className="world-bosses-eligible world-bosses-eligible--pending">Participe por 5 min ou cause dano mínimo</span>}
              </div>
            </div>
          </section>
        )}

        {boss ? (
          <section className="world-bosses-card world-bosses-rewards">
            <h2>Recompensas possíveis</h2>
            <div className="world-bosses-rewards__grid">
              {boss.rewards.map((reward) => (
                <article key={reward.id}>
                  <strong>{reward.item?.name ?? reward.rewardType}</strong>
                  <span>{reward.minQuantity === reward.maxQuantity ? formatNumber(reward.minQuantity) : `${formatNumber(reward.minQuantity)}–${formatNumber(reward.maxQuantity)}`}</span>
                  <small>{reward.guaranteed ? 'Garantido' : `${reward.chance}% de chance`}{reward.onlyIfDefeated ? ' • só se derrotar' : ''}</small>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </DashboardLayout>
  );
}