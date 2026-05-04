import {
  ATTRIBUTE_STATS_CONFIG,
  getStatValue,
} from '../constants/stats-config';

type CharacterStatsSource = {
  strength?: number | null;
  vitality?: number | null;
  agility?: number | null;
  precision?: number | null;
  technique?: number | null;
  willpower?: number | null;
};

interface CharacterStatsPanelProps {
  stats?: CharacterStatsSource | null;
  currentHp?: number | null;
  maxHp?: number | null;
}

function normalizeStatValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return Number.isFinite(value) ? value : undefined;
}

export function CharacterStatsPanel({ stats }: CharacterStatsPanelProps) {
  const attributeValues: Record<string, number | undefined> = {
    strength: normalizeStatValue(stats?.strength),
    vitality: normalizeStatValue(stats?.vitality),
    agility: normalizeStatValue(stats?.agility),
    precision: normalizeStatValue(stats?.precision),
    technique: normalizeStatValue(stats?.technique),
    willpower: normalizeStatValue(stats?.willpower),
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