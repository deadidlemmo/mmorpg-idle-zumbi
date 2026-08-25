import { ArrowRight, Dna, Ticket } from "lucide-react";
import { Link } from "react-router-dom";
import "../styles/resource-center.css";

interface ResourceCenterShortcutProps {
  characterId: string;
  source: "INCURSION" | "WORLD_BOSS";
}

export function ResourceCenterShortcut({
  characterId,
  source,
}: ResourceCenterShortcutProps) {
  const isIncursion = source === "INCURSION";
  const query = isIncursion
    ? "tab=exchanges&currency=INCURSION_TOKEN"
    : "tab=incubator&currency=WORLD_BOSS_FRAGMENT";

  return (
    <Link
      className={`resource-center-shortcut resource-center-shortcut--${source.toLowerCase()}`}
      to={`/dashboard/${characterId}/resources?${query}`}
    >
      <span className="resource-center-shortcut__icon" aria-hidden="true">
        {isIncursion ? <Ticket size={18} /> : <Dna size={18} />}
      </span>
      <span className="resource-center-shortcut__copy">
        <small>{isIncursion ? "Fichas obtidas" : "Casulos e fragmentos"}</small>
        <strong>Central de recursos</strong>
      </span>
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  );
}
