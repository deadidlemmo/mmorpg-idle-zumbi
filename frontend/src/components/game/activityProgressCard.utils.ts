export type ActivityProgressAnimation = 'none' | 'cycle' | 'value';

export function shouldResetCycleProgress(params: {
  animation: ActivityProgressAnimation;
  current: number;
  previous: number;
}) {
  return (
    params.animation === 'cycle' &&
    params.current < params.previous - 0.01
  );
}
