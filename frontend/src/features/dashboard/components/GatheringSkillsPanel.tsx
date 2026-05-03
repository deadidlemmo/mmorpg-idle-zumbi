import type { GatheringSkillViewModel } from '../constants/gathering-skills-config';

interface ActiveGatheringSummary {
  isActive: boolean;
  title: string;
  description: string;
  origin: string;
  estimatedQuantity: number;
  elapsedMinutes: number;
  progressPercent: number;
}

interface GatheringSkillsPanelProps {
  skills: GatheringSkillViewModel[];
  activeGathering: ActiveGatheringSummary;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function GatheringSkillsPanel({
  skills,
  activeGathering,
}: GatheringSkillsPanelProps) {
  const activeProgress = clampPercent(activeGathering.progressPercent);

  return (
    <div className="gathering-panel">
      <section
        className={`gathering-panel__active ${
          activeGathering.isActive ? 'is-active' : ''
        }`}
      >
        <div className="gathering-panel__active-main">
          <div>
            <strong>{activeGathering.title}</strong>
            <p>{activeGathering.description}</p>
          </div>

          <span className="gathering-panel__active-status">
            {activeGathering.isActive ? 'Ativo' : 'Parado'}
          </span>
        </div>

        <div className="gathering-panel__metrics">
          <div className="gathering-panel__metric">
            <span>Origem</span>
            <strong>{activeGathering.origin}</strong>
          </div>

          <div className="gathering-panel__metric">
            <span>Estimado</span>
            <strong>{activeGathering.estimatedQuantity}</strong>
          </div>

          <div className="gathering-panel__metric">
            <span>Decorrido</span>
            <strong>{activeGathering.elapsedMinutes}min</strong>
          </div>
        </div>

        <div className="gathering-panel__progress">
          <div className="gathering-panel__progress-label">
            <span>Próxima unidade</span>
            <strong>{activeProgress}/100</strong>
          </div>

          <div className="gathering-panel__track">
            <i style={{ width: `${activeProgress}%` }} />
          </div>
        </div>
      </section>

      <section className="gathering-panel__skills">
        <div className="gathering-panel__section-header">
          <span>Proficiências</span>
          <h3>Níveis de gathering</h3>
        </div>

        <div className="gathering-skills-grid">
          {skills.map((skill) => {
            const progress = clampPercent(skill.progressPercent);

            return (
              <article
                key={skill.key}
                className={`gathering-skill-card is-${skill.key}`}
              >
                <div className="gathering-skill-card__top">
                  <div className="gathering-skill-card__icon" aria-hidden="true">
                    <img src={skill.icon} alt="" />
                  </div>

                  <div className="gathering-skill-card__meta">
                    <strong>{skill.label}</strong>
                    <span>{skill.description}</span>
                  </div>

                  <div
                    className="gathering-skill-card__level"
                    aria-label={`Nível ${skill.level}`}
                  >
                    <span>Lv</span>
                    <strong>{skill.level}</strong>
                  </div>
                </div>

                <div className="gathering-skill-card__progress">
                  <div className="gathering-skill-card__progress-header">
                    <span>EXP</span>
                    <strong>
                      {skill.currentXp}/{skill.xpToNextLevel}
                    </strong>
                  </div>

                  <div className="gathering-skill-card__track">
                    <i style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}