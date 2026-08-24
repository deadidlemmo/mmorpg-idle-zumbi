import { useMemo, type CSSProperties } from 'react';
import {
  getActivityTimelineCssAnimation,
  type ActivityTimeline,
} from './activityTimeline';
import './activity-timeline.css';

type ActivityTimelineFillElement = 'i' | 'span';

type ActivityTimelineFillStyle = CSSProperties & {
  '--activity-timeline-from-scale': string;
  '--activity-timeline-to-scale': string;
};

interface ActivityTimelineFillProps {
  as?: ActivityTimelineFillElement;
  className?: string;
  style?: CSSProperties;
  timeline: ActivityTimeline;
}

export function ActivityTimelineFill({
  as = 'span',
  className,
  style,
  timeline,
}: ActivityTimelineFillProps) {
  const animation = useMemo(
    () => getActivityTimelineCssAnimation(timeline),
    [timeline],
  );
  const Element = as;
  const animationStyle = {
    ...style,
    '--activity-timeline-from-scale': String(animation.fromScale),
    '--activity-timeline-to-scale': String(animation.toScale),
    animationDelay: `${animation.delayMs}ms`,
    animationDuration: `${animation.durationMs}ms`,
    animationFillMode: 'both',
    animationIterationCount: 1,
    animationName: 'activityTimelineProgress',
    animationTimingFunction: 'linear',
    transform: `scaleX(${animation.currentScale})`,
  } satisfies ActivityTimelineFillStyle;

  return (
    <Element
      key={animation.key}
      className={['activity-timeline-fill', className]
        .filter(Boolean)
        .join(' ')}
      data-activity-instance-id={timeline.activityInstanceId}
      data-cycle-id={timeline.cycleId}
      data-timeline-version={timeline.version}
      style={animationStyle}
      aria-hidden="true"
    />
  );
}

export default ActivityTimelineFill;
