import type { CSSProperties, ReactNode } from 'react';

export type ActivityProgressCardPill = {
  className?: string;
  content: ReactNode;
  key?: string;
  title?: string;
};

type ActivityProgressCardClassNames = {
  body?: string;
  heading?: string;
  icon?: string;
  pills?: string;
  top?: string;
  track?: string;
};

type ActivityProgressCardProps = {
  ariaLabel?: string;
  as?: 'aside' | 'div' | 'section';
  badge?: ReactNode;
  badgeClassName?: string;
  cardTitle?: string;
  children?: ReactNode;
  className?: string;
  classNames?: ActivityProgressCardClassNames;
  controls?: ReactNode;
  icon: ReactNode;
  iconAriaLabel?: string;
  label: ReactNode;
  overlay?: ReactNode;
  pills?: ActivityProgressCardPill[];
  progressLabel?: string;
  progressPercent?: number | null;
  progressTitle?: string;
  style?: CSSProperties;
};

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

function clampProgress(value?: number | null) {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) return 0;

  return Math.max(0, Math.min(100, parsed));
}

export function ActivityProgressCard({
  ariaLabel,
  as = 'div',
  badge,
  badgeClassName,
  cardTitle,
  children,
  className,
  classNames,
  controls,
  icon,
  iconAriaLabel,
  label,
  overlay,
  pills = [],
  progressLabel,
  progressPercent,
  progressTitle,
  style,
}: ActivityProgressCardProps) {
  const progress = clampProgress(progressPercent);
  const rootStyle =
    progressPercent === null || progressPercent === undefined
      ? style
      : ({
          ...style,
          '--hunt-skill-progress': `${progress}%`,
        } as CSSProperties);
  const Root = as;

  return (
    <Root
      className={joinClassNames('auto-combat-hunt-skill-card', className)}
      aria-label={ariaLabel}
      title={cardTitle}
      style={rootStyle}
    >
      {controls}

      <div
        className={joinClassNames(
          'auto-combat-hunt-skill-card__top',
          classNames?.top,
        )}
      >
        <div
          className={joinClassNames(
            'auto-combat-hunt-skill-card__icon',
            classNames?.icon,
          )}
          aria-label={iconAriaLabel}
          aria-hidden={iconAriaLabel ? undefined : true}
        >
          {icon}
        </div>

        <div
          className={joinClassNames(
            'auto-combat-hunt-skill-card__body',
            classNames?.body,
          )}
        >
          <div
            className={joinClassNames(
              'auto-combat-hunt-skill-card__heading',
              classNames?.heading,
            )}
          >
            <span>
              <strong title={typeof label === 'string' ? label : undefined}>
                {label}
              </strong>
              {badge ? <em className={badgeClassName}>{badge}</em> : null}
            </span>
          </div>

          <div
            className={joinClassNames(
              'auto-combat-hunt-skill-card__track',
              classNames?.track,
            )}
            role={progressLabel ? 'progressbar' : undefined}
            aria-label={progressLabel}
            aria-valuemin={progressLabel ? 0 : undefined}
            aria-valuemax={progressLabel ? 100 : undefined}
            aria-valuenow={progressLabel ? Math.round(progress) : undefined}
            title={progressTitle}
          >
            <i aria-hidden="true" />
          </div>

          {pills.length > 0 ? (
            <div
              className={joinClassNames(
                'auto-combat-hunt-skill-card__pills',
                classNames?.pills,
              )}
            >
              {pills.map((pill, index) => (
                <span
                  key={pill.key ?? index}
                  className={pill.className}
                  title={pill.title}
                >
                  {pill.content}
                </span>
              ))}
            </div>
          ) : null}

          {children}
        </div>
      </div>

      {overlay}
    </Root>
  );
}

export default ActivityProgressCard;
