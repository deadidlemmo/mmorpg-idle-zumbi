import type { ReactNode } from 'react';

interface DashboardCardProps {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DashboardCard({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: DashboardCardProps) {
  return (
    <section className={`dashboard-card ${className}`}>
      {(title || eyebrow || action) && (
        <header className="dashboard-card__header">
          <div>
            {eyebrow ? <span className="dashboard-card__eyebrow">{eyebrow}</span> : null}
            {title ? <h2>{title}</h2> : null}
          </div>

          {action ? <div className="dashboard-card__action">{action}</div> : null}
        </header>
      )}

      <div className="dashboard-card__body">{children}</div>
    </section>
  );
}