import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";

export interface WikiBreadcrumbItem {
  label: string;
  to?: string;
}

export function WikiBreadcrumbs({ items }: { items: WikiBreadcrumbItem[] }) {
  return (
    <nav className="wiki-breadcrumbs" aria-label="Navegação hierárquica">
      <Link to="/wiki" aria-label="Início da Wiki">
        <Home size={14} aria-hidden="true" />
        <span>Wiki</span>
      </Link>
      {items.map((item) => (
        <span className="wiki-breadcrumbs__step" key={`${item.label}-${item.to ?? "current"}`}>
          <ChevronRight size={13} aria-hidden="true" />
          {item.to ? <Link to={item.to}>{item.label}</Link> : <strong>{item.label}</strong>}
        </span>
      ))}
    </nav>
  );
}
