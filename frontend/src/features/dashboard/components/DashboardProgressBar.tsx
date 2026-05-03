interface DashboardProgressBarProps {
  value: number;
  max: number;
  label?: string;
  variant?: 'hp' | 'xp' | 'neutral';
}

export function DashboardProgressBar({
  value,
  max,
  label,
  variant = 'neutral',
}: DashboardProgressBarProps) {
  const safeMax = max <= 0 ? 1 : max;
  const percent = Math.max(0, Math.min(100, (value / safeMax) * 100));

  return (
    <div className={`dashboard-progress dashboard-progress--${variant}`}>
      <div className="dashboard-progress__label">
        <span>{label}</span>
        <strong>
          {value}/{max}
        </strong>
      </div>

      <div className="dashboard-progress__track">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}