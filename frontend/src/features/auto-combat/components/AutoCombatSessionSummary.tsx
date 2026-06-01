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
  const premiumLineText = isPremiumActive
    ? `Premium: +${premiumBonusXp} EXP`
    : `Com Premium: +${premiumPotentialBonusXp} EXP`;
  const premiumStatusText = isPremiumActive
    ? 'Bônus Premium ativo'
    : 'Premium bloqueado';

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

        <div className="auto-combat-session-summary__card auto-combat-session-summary__card--xp">
          <span>XP ganho</span>
          <strong>{totalXpGained}</strong>
          <small>Base: {baseXpGained} EXP</small>
          <small
            className={[
              'auto-combat-session-summary__premium-line',
              isPremiumActive
                ? 'auto-combat-session-summary__premium-line--active'
                : 'auto-combat-session-summary__premium-line--locked',
            ].join(' ')}
          >
            <PremiumPlaceholderIcon className="auto-combat-session-summary__premium-icon" />
            <span>{premiumLineText}</span>
          </small>
          <small
            className={[
              'auto-combat-session-summary__premium-status',
              isPremiumActive
                ? 'auto-combat-session-summary__premium-status--active'
                : 'auto-combat-session-summary__premium-status--locked',
            ].join(' ')}
          >
            {premiumStatusText}
            {premiumDisplayXp > 0 && !isPremiumActive
              ? ` (${premiumTotalXp} EXP potencial)`
              : ''}
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
