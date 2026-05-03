interface DashboardStatCardProps {
  label: string;
  value: number | string;
  hint?: string;
}

export function DashboardStatCard({ label, value, hint }: DashboardStatCardProps) {
  return (
    <div className="dashboard-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}