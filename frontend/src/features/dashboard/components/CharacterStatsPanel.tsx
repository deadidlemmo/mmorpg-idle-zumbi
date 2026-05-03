import {
    ATTRIBUTE_STATS_CONFIG,
    getStatValue,
} from '../constants/stats-config';
import type { DashboardPrimaryStats } from '../types/dashboard.types';

interface CharacterStatsPanelProps {
  stats?: DashboardPrimaryStats;
}

export function CharacterStatsPanel({ stats }: CharacterStatsPanelProps) {
  const attributeValues: Record<string, number | undefined> = {
    strength: stats?.strength,
    vitality: stats?.vitality,
    agility: stats?.agility,
    precision: stats?.precision,
    technique: stats?.technique,
    willpower: stats?.willpower,
  };

  return (
    <div className="character-stats-panel character-stats-panel--primary-only">
      <section className="character-stats-group character-stats-group--primary">
        <header className="character-stats-group__header">
          <span>Base do personagem</span>
          <h3>Atributos primários</h3>
        </header>

        <div className="character-stats-grid character-stats-grid--primary">
          {ATTRIBUTE_STATS_CONFIG.map((stat) => (
            <article
              key={stat.key}
              className={`character-stat-card character-stat-card--${stat.tone}`}
            >
              <div className="character-stat-card__icon" aria-hidden="true">
                <img src={stat.icon} alt="" draggable={false} />
              </div>

              <div className="character-stat-card__content">
                <strong>{stat.label}</strong>
                <p>{stat.description}</p>
              </div>

              <div className="character-stat-card__value">
                {getStatValue(attributeValues, stat.key)}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}