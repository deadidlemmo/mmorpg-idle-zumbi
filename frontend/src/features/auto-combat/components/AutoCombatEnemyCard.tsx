import type { AutoCombatEncounterViewModel } from '../types/auto-combat.types';

type AutoCombatEnemyCardProps = {
  encounter: AutoCombatEncounterViewModel;
  chance: number;
};

export function AutoCombatEnemyCard({
  encounter,
  chance,
}: AutoCombatEnemyCardProps) {
  const mob = encounter.mob;

  return (
    <article className="auto-combat-enemy-card">
      <div className="auto-combat-enemy-card__level">
        Nv. {mob?.level ?? '—'}
      </div>

      <div className="auto-combat-enemy-card__xp">
        XP {mob?.xpReward ?? '—'}
      </div>

      <div className="auto-combat-enemy-card__portrait">☣</div>

      <div className="auto-combat-enemy-card__content">
        <span>Ameaça próxima</span>

        <strong>{mob?.name ?? 'Infectado'}</strong>

        <div className="auto-combat-enemy-card__hp">
          <div className="auto-combat-enemy-card__hp-header">
            <span>HP</span>
            <strong>{mob?.hp ?? '—'}</strong>
          </div>

          <i className="auto-combat-enemy-card__hp-track">
            <b
              style={{
                width: mob?.hp ? '100%' : '0%',
              }}
            />
          </i>
        </div>

        <div className="auto-combat-enemy-card__stats">
          <span>ATQ {mob?.attack ?? '—'}</span>
          <span>DEF {mob?.defense ?? '—'}</span>
          <span>VEL {mob?.speed ?? '—'}</span>
          <span>Chance {chance}%</span>
        </div>
      </div>
    </article>
  );
}
