import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  shouldResetCycleProgress,
  type ActivityProgressAnimation,
} from './activityProgressCard.utils';
import { ActivityTimelineFill } from './ActivityTimelineFill';
import {
  getActivityTimelineFrame,
  type ActivityTimeline,
} from './activityTimeline';

export type { ActivityProgressAnimation } from './activityProgressCard.utils';

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
  progressAnimation?: ActivityProgressAnimation;
  progressPercent?: number | null;
  progressTitle?: string;
  style?: CSSProperties;
  timeline?: ActivityTimeline | null;
  timelineRepeats?: boolean;
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
  progressAnimation = 'none',
  progressLabel,
  progressPercent,
  progressTitle,
  style,
  timeline,
  timelineRepeats = false,
}: ActivityProgressCardProps) {
  const timelineFrame = timeline
    ? getActivityTimelineFrame(timeline, undefined, {
        repeat: timelineRepeats,
      })
    : null;
  const progress = timelineFrame?.fillPercent ?? clampProgress(progressPercent);
  const previousProgressRef = useRef(progress);
  const progressFillRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const previousProgress = previousProgressRef.current;
    const progressFill = progressFillRef.current;

    previousProgressRef.current = progress;

    if (
      timeline ||
      !progressFill ||
      !shouldResetCycleProgress({
        animation: progressAnimation,
        current: progress,
        previous: previousProgress,
      })
    ) {
      return undefined;
    }

    progressFill.classList.add('activity-progress-card__fill--resetting');

    const animationFrame = window.requestAnimationFrame(() => {
      progressFill.classList.remove('activity-progress-card__fill--resetting');
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      progressFill.classList.remove('activity-progress-card__fill--resetting');
    };
  }, [progress, progressAnimation, timeline]);

  const rootStyle =
    !timeline && (progressPercent === null || progressPercent === undefined)
      ? style
      : ({
          ...style,
          '--hunt-skill-progress': `${progress}%`,
        } as CSSProperties);
  const Root = as;

  return (
    <Root
      className={joinClassNames(
        'auto-combat-hunt-skill-card',
        progressAnimation !== 'none'
          ? `activity-progress-card--${progressAnimation}-progress`
          : '',
        timeline ? 'activity-progress-card--timeline-progress' : '',
        className,
      )}
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
            {timeline ? (
              <ActivityTimelineFill
                as="i"
                repeat={timelineRepeats}
                timeline={timeline}
              />
            ) : (
              <i ref={progressFillRef} aria-hidden="true" />
            )}
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
