import type { CSSProperties, ReactNode } from 'react';
import './activity-timeline.css';

type ActivityStateProgressFillElement = 'em' | 'i' | 'span';

interface ActivityStateProgressFillProps {
  as?: ActivityStateProgressFillElement;
  children?: ReactNode;
  className?: string;
  progressPercent: number;
  style?: CSSProperties;
  transitionMs?: number;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export function ActivityStateProgressFill({
  as = 'span',
  children,
  className,
  progressPercent,
  style,
  transitionMs = 240,
}: ActivityStateProgressFillProps) {
  const Element = as;
  const fillScale = clampProgress(progressPercent) / 100;

  return (
    <Element
      className={['activity-state-progress-fill', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...style,
        transform: `scaleX(${fillScale})`,
        transitionDuration: `${Math.max(0, transitionMs)}ms`,
      }}
      aria-hidden="true"
    >
      {children}
    </Element>
  );
}

export default ActivityStateProgressFill;
