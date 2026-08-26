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
  const destination = isIncursion
    ? `/dashboard/${characterId}/resources?currency=INCURSION_TOKEN`
    : `/dashboard/${characterId}/pets`;

  return (
    <Link
      className={`resource-center-shortcut resource-center-shortcut--${source.toLowerCase()}`}
      to={destination}
    >
      <span className="resource-center-shortcut__icon" aria-hidden="true">
        {isIncursion ? <Ticket size={18} /> : <Dna size={18} />}
      </span>
      <span className="resource-center-shortcut__copy">
        <small>{isIncursion ? "Fichas obtidas" : "Drops da Ameaça Global"}</small>
        <strong>{isIncursion ? "Central de trocas" : "Companheiros"}</strong>
      </span>
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  );
}
