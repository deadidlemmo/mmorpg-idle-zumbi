import { formatSessionStatus } from '../utils/auto-combat-page.helpers';

type AutoCombatSessionSummaryProps = {
  status?: string | null;
  currentCombatIndex: number;
  totalCombats: number;
  totalKills: number;
  totalXpGained: number;
  totalLoot: number;
  potionsUsed: number;
};

export function AutoCombatSessionSummary({
  status,
  currentCombatIndex,
  totalCombats,
  totalKills,
  totalXpGained,
  totalLoot,
  potionsUsed,
}: AutoCombatSessionSummaryProps) {
  return (
    <article className="auto-combat-session-panel">
      <div className="auto-combat-session-panel__header">
        <span>Estatísticas da sessão</span>
        <strong>{formatSessionStatus(status)}</strong>
      </div>

      <div className="auto-combat-session-summary">
        <div>
          <span>Combate atual</span>
          <strong>{currentCombatIndex}</strong>
          <small>{totalCombats} luta(s) resolvida(s)</small>
        </div>

        <div>
          <span>Abates</span>
          <strong>{totalKills}</strong>
          <small>infectados derrotados</small>
        </div>

        <div>
          <span>XP ganho</span>
          <strong>{totalXpGained}</strong>
          <small>progressão obtida</small>
        </div>

        <div>
          <span>Loot</span>
          <strong>{totalLoot}</strong>
          <small>itens coletados</small>
        </div>

        <div>
          <span>Poções</span>
          <strong>{potionsUsed}</strong>
          <small>usadas automaticamente</small>
        </div>
      </div>
    </article>
  );
}
