import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronDown, ChevronUp, Gauge } from "lucide-react";
import { previewAutoCombat } from "../api/auto-combat.api";
import type { HuntingPerformanceProjection } from "../utils/hunting-performance";
import {
  buildHuntingPerformance,
  formatHuntingDuration,
} from "../utils/hunting-performance";

type HuntingPerformancePanelProps = {
  characterId: string;
  currentMapId: string | null;
  currentSubMapId: string | null;
  characterLevel: number;
  huntingLevel: number;
  secondsPerFind: number;
  isCombatActive: boolean;
  currentCombatDurationMs: number;
};

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function HuntingPerformancePanel({
  characterId,
  currentMapId,
  currentSubMapId,
  characterLevel,
  huntingLevel,
  secondsPerFind,
  isCombatActive,
  currentCombatDurationMs,
}: HuntingPerformancePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(
    () => window.matchMedia("(max-width: 620px)").matches,
  );
  const [preview, setPreview] = useState<{
    key: string;
    projection: HuntingPerformanceProjection | null;
  } | null>(null);
  const previewKey = `${characterId}:${currentSubMapId ?? currentMapId ?? ""}:${characterLevel}:${huntingLevel}`;

  useEffect(() => {
    if (!currentSubMapId && !currentMapId) return;

    let cancelled = false;
    void previewAutoCombat({
      characterId,
      ...(currentSubMapId
        ? { subMapId: currentSubMapId }
        : { mapId: currentMapId ?? undefined }),
      projectionSeconds: 300,
      iterations: 1,
    })
      .then((response) => {
        if (!cancelled) {
          setPreview({ key: previewKey, projection: response.combatPreview ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) setPreview({ key: previewKey, projection: null });
      });

    return () => {
      cancelled = true;
    };
  }, [characterId, characterLevel, currentMapId, currentSubMapId, huntingLevel, previewKey]);

  const projection = preview?.key === previewKey ? preview.projection : null;
  const metrics = useMemo(
    () => buildHuntingPerformance(secondsPerFind, projection),
    [secondsPerFind, projection],
  );
  const isLoading = preview?.key !== previewKey && Boolean(currentSubMapId || currentMapId);
  const bottleneck =
    metrics.averageTtkSeconds === null || metrics.trackingSeconds === null
      ? null
      : metrics.averageTtkSeconds > metrics.trackingSeconds
        ? "combate"
        : "rastreio";
  const currentTtk =
    isCombatActive && currentCombatDurationMs > 0
      ? formatHuntingDuration(currentCombatDurationMs / 1000)
      : null;

  return (
    <aside
      className={`auto-combat-hunting-scene__session-panel auto-combat-hunting-scene__performance${isCollapsed ? " is-collapsed" : ""}`}
      aria-label="Ritmo da caça"
    >
      <div className="auto-combat-hunting-scene__tracked-heading">
        <span><Gauge aria-hidden="true" /> Ritmo</span>
        <strong>{metrics.averageTtkSeconds === null ? "TTK —" : `TTK ~${formatHuntingDuration(metrics.averageTtkSeconds)}`}</strong>
        <button
          type="button"
          onClick={() => setIsCollapsed((current) => !current)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expandir métricas da caça" : "Minimizar métricas da caça"}
          title={isCollapsed ? "Expandir" : "Minimizar"}
        >
          {isCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </button>
      </div>

      {!isCollapsed ? (
        <div className="auto-combat-hunting-scene__performance-body">
          <dl className="auto-combat-hunting-scene__performance-metrics">
            <div><dt>Rastreio</dt><dd>{formatHuntingDuration(metrics.trackingSeconds)}</dd></div>
            <div><dt>TTK médio</dt><dd>{metrics.averageTtkSeconds === null ? "—" : `~${formatHuntingDuration(metrics.averageTtkSeconds)}`}</dd></div>
            {currentTtk ? <div><dt>Alvo atual</dt><dd>{currentTtk}</dd></div> : null}
            <div><dt>Ciclo</dt><dd>{metrics.cycleSeconds === null ? "—" : `~${formatHuntingDuration(metrics.cycleSeconds)}`}</dd></div>
            <div><dt>Ameaças/h</dt><dd>{metrics.encountersPerHour === null ? "—" : `~${numberFormatter.format(metrics.encountersPerHour)}`}</dd></div>
            <div><dt>EXP combate/h</dt><dd>{metrics.xpPerHour === null ? "—" : `~${numberFormatter.format(metrics.xpPerHour)}`}</dd></div>
          </dl>
          {isLoading ? <span className="auto-combat-hunting-scene__performance-note">Calculando estimativa…</span> : null}
          {!isLoading && !projection ? <span className="auto-combat-hunting-scene__performance-note">Estimativa indisponível</span> : null}
          <div className="auto-combat-hunting-scene__performance-upgrades">
            <strong>{bottleneck === "rastreio" ? "Rastreio limita o ritmo" : bottleneck === "combate" ? "Combate limita o ritmo" : "Melhore seu ritmo"}</strong>
            <span>Caça Nv. {huntingLevel} · evolui ao rastrear</span>
            <nav aria-label="Melhorar o ritmo da caça">
              <Link to={`/dashboard/${characterId}/equipment`} title="Equipamento para reduzir o TTK">Equipamento <ArrowUpRight aria-hidden="true" /></Link>
              <Link to={`/dashboard/${characterId}/crafting`} title="Criar equipamentos melhores">Criação <ArrowUpRight aria-hidden="true" /></Link>
              <Link to={`/dashboard/${characterId}/gathering`} title="Coleta concede bônus de atributos">Coleta <ArrowUpRight aria-hidden="true" /></Link>
              <Link to={`/dashboard/${characterId}/pets`} title="Mascotes concedem bônus de atributos">Mascotes <ArrowUpRight aria-hidden="true" /></Link>
            </nav>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
