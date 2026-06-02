import { PremiumPlaceholderIcon } from '../../../components/PremiumPlaceholderIcon';
import { formatSessionStatus } from '../utils/auto-combat-page.helpers';

type AutoCombatSessionSummaryProps = {
  status?: string | null;
  currentCombatIndex: number;
  totalCombats: number;
  totalKills: number;
  totalXpGained: number;
  baseXpGained: number;
  premiumBonusXp: number;
  premiumPotentialBonusXp: number;
  premiumTotalXp: number;
  isPremiumActive: boolean;
  totalLoot: number;
  potionsUsed: number;
};

export function AutoCombatSessionSummary({
  status,
  currentCombatIndex,
  totalCombats,
  totalKills,
  totalXpGained,
  baseXpGained,
  premiumBonusXp,
  premiumPotentialBonusXp,
  isPremiumActive,
  totalLoot,
  potionsUsed,
}: AutoCombatSessionSummaryProps) {
  const premiumDetailText = isPremiumActive
    ? `+${premiumBonusXp} EXP Premium`
    : `+${premiumPotentialBonusXp} EXP com Premium`;

  return (
    <article className="auto-combat-session-panel">
      <div className="auto-combat-session-panel__header">
        <span>Estatísticas da sessão</span>
        <strong>{formatSessionStatus(status)}</strong>
      </div>

      <div className="auto-combat-session-summary">
        <div className="auto-combat-session-summary__card">
          <span>Combate atual</span>
          <strong>{currentCombatIndex}</strong>
          <small>{totalCombats} luta(s) resolvida(s)</small>
        </div>

        <div className="auto-combat-session-summary__card">
          <span>Abates</span>
          <strong>{totalKills}</strong>
          <small>infectados derrotados</small>
        </div>

        <div
          className={[
            'auto-combat-session-summary__card',
            'auto-combat-session-summary__card--xp',
            isPremiumActive
              ? 'auto-combat-session-summary__card--xp-premium'
              : 'auto-combat-session-summary__card--xp-free',
          ].join(' ')}
        >
          <span>XP ganho</span>

          <strong className="auto-combat-session-summary__xp-value">
            {totalXpGained}
            <em>EXP total</em>
          </strong>

          <small className="auto-combat-session-summary__xp-details">
            <span>Base: {baseXpGained} EXP</span>
            <span
              className={[
                'auto-combat-session-summary__xp-premium-detail',
                isPremiumActive
                  ? 'auto-combat-session-summary__xp-premium-detail--active'
                  : 'auto-combat-session-summary__xp-premium-detail--locked',
              ].join(' ')}
            >
              <PremiumPlaceholderIcon className="auto-combat-session-summary__premium-icon auto-combat-session-summary__premium-icon--inline" />
              {premiumDetailText}
            </span>
          </small>
        </div>

        <div className="auto-combat-session-summary__card auto-combat-session-summary__card--loot">
          <span>Loot</span>
          <strong>{totalLoot}</strong>
          <small>itens coletados</small>
        </div>

        <div className="auto-combat-session-summary__card auto-combat-session-summary__card--potions">
          <span>Poções</span>
          <strong>{potionsUsed}</strong>
          <small>usadas automaticamente</small>
        </div>
      </div>
    </article>
  );
}
