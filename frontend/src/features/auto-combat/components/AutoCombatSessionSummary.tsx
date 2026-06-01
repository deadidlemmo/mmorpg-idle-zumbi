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
  premiumTotalXp,
  isPremiumActive,
  totalLoot,
  potionsUsed,
}: AutoCombatSessionSummaryProps) {
  const premiumDisplayXp = isPremiumActive
    ? premiumBonusXp
    : premiumPotentialBonusXp;
  const premiumStatusText = isPremiumActive
    ? 'Bônus Premium ativo'
    : 'Premium bloqueado';
  const premiumBreakdownLabel = isPremiumActive ? 'Premium' : 'Potencial';
  const premiumNoteText = isPremiumActive
    ? `Premium: +${premiumBonusXp} EXP aplicado`
    : `Com Premium: ${premiumTotalXp} EXP total`;

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
          <span className="auto-combat-session-summary__xp-topline">
            <span>XP ganho</span>
            <small
              className={[
                'auto-combat-session-summary__premium-status',
                isPremiumActive
                  ? 'auto-combat-session-summary__premium-status--active'
                  : 'auto-combat-session-summary__premium-status--locked',
              ].join(' ')}
            >
              <PremiumPlaceholderIcon className="auto-combat-session-summary__premium-icon" />
              <span>{premiumStatusText}</span>
            </small>
          </span>

          <strong className="auto-combat-session-summary__xp-total">
            <span>{totalXpGained}</span>
            <em>EXP total</em>
          </strong>

          <span className="auto-combat-session-summary__xp-breakdown">
            <small className="auto-combat-session-summary__xp-chip auto-combat-session-summary__xp-chip--base">
              <span>Base</span>
              <strong>{baseXpGained}</strong>
              <em>EXP</em>
            </small>

            <small
              className={[
                'auto-combat-session-summary__xp-chip',
                'auto-combat-session-summary__xp-chip--premium',
                isPremiumActive
                  ? 'auto-combat-session-summary__xp-chip--premium-active'
                  : 'auto-combat-session-summary__xp-chip--premium-locked',
              ].join(' ')}
            >
              <span>{premiumBreakdownLabel}</span>
              <strong>+{premiumDisplayXp}</strong>
              <em>EXP</em>
            </small>
          </span>

          <small
            className={[
              'auto-combat-session-summary__premium-note',
              isPremiumActive
                ? 'auto-combat-session-summary__premium-note--active'
                : 'auto-combat-session-summary__premium-note--locked',
            ].join(' ')}
          >
            {premiumNoteText}
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
