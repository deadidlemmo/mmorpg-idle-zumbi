import type { AutoCombatEncounterViewModel } from '../types/auto-combat.types';

type AutoCombatEnemyCardProps = {
  encounter: AutoCombatEncounterViewModel;
};

export function AutoCombatEnemyCard({ encounter }: AutoCombatEnemyCardProps) {
  const mob = encounter.mob;

  return (
    <article className="auto-combat-enemy-card">
      <div className="auto-combat-enemy-card__portrait">☣</div>

      <div className="auto-combat-enemy-card__content">
        <span>Ameaça próxima</span>

        <strong>{mob?.name ?? 'Infectado'}</strong>
      </div>
    </article>
  );
}
