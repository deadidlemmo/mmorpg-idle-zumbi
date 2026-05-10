import type { DashboardStats } from '../../dashboard/types/dashboard.types';
import { STAT_CARDS } from '../constants/auto-combat-stat-cards';

type AutoCombatStatsTabProps = {
  totalStats: DashboardStats;
};

export function AutoCombatStatsTab({ totalStats }: AutoCombatStatsTabProps) {
  return (
    <div className="auto-combat-tab-panel auto-combat-tab-panel--stats">
      <div className="auto-combat-character-stats-panel character-stats-panel character-stats-panel--primary-only">
        <section className="character-stats-group character-stats-group--primary">
          <header className="character-stats-group__header">
            <span>Base do personagem</span>
            <h3>Atributos primários</h3>
          </header>

          <div className="character-stats-grid character-stats-grid--primary">
            {STAT_CARDS.map((stat) => {
              const value = totalStats[stat.key] ?? 0;

              return (
                <article
                  key={stat.key}
                  className={`character-stat-card character-stat-card--${stat.className}`}
                >
                  <div className="character-stat-card__icon">
                    <img src={stat.icon} alt="" aria-hidden="true" />
                  </div>

                  <div className="character-stat-card__content">
                    <strong>{stat.label}</strong>
                    <p>{stat.description}</p>
                  </div>

                  <div className="character-stat-card__value">{value}</div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
