import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  getActivityTimelineCssAnimation,
  type ActivityTimeline,
} from './activityTimeline';
import './activity-timeline.css';

type ActivityTimelineFillElement = 'em' | 'i' | 'span';

type ActivityTimelineFillStyle = CSSProperties & {
  '--activity-timeline-from-scale': string;
  '--activity-timeline-to-scale': string;
};

interface ActivityTimelineFillProps {
  as?: ActivityTimelineFillElement;
  children?: ReactNode;
  className?: string;
  repeat?: boolean;
  style?: CSSProperties;
  timeline: ActivityTimeline;
}

export function ActivityTimelineFill({
  as = 'span',
  children,
  className,
  repeat = false,
  style,
  timeline,
}: ActivityTimelineFillProps) {
  const animation = useMemo(
    () => getActivityTimelineCssAnimation(timeline, undefined, { repeat }),
    [repeat, timeline],
  );
  const Element = as;
  const animationStyle = {
    ...style,
    '--activity-timeline-from-scale': String(animation.fromScale),
    '--activity-timeline-to-scale': String(animation.toScale),
    animationDelay: `${animation.delayMs}ms`,
    animationDuration: `${animation.durationMs}ms`,
    animationFillMode: 'both',
    animationIterationCount: repeat ? 'infinite' : 1,
    animationName: 'activityTimelineProgress',
    animationTimingFunction: 'linear',
    transform: `scaleX(${animation.currentScale})`,
  } satisfies ActivityTimelineFillStyle;

  return (
    <Element
      key={`${animation.key}:${repeat ? 'repeat' : 'once'}`}
      className={['activity-timeline-fill', className]
        .filter(Boolean)
        .join(' ')}
      data-activity-instance-id={timeline.activityInstanceId}
      data-cycle-id={timeline.cycleId}
      data-timeline-version={timeline.version}
      style={animationStyle}
      aria-hidden="true"
    >
      {children}
    </Element>
  );
}

export default ActivityTimelineFill;
