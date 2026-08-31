import { Biohazard, Box, MapPinned, Skull } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  WikiEntityKind,
  WikiEntitySummary,
} from "../types/wiki.types";
import {
  getWikiEntityDescription,
  getWikiEntityImage,
  getWikiEntityMeta,
  getWikiEntityPath,
} from "../utils/wikiFormatters";

const FALLBACK_ICONS = {
  items: Box,
  monsters: Skull,
  maps: MapPinned,
  bosses: Biohazard,
} satisfies Record<WikiEntityKind, typeof Box>;

function getMetaTone(kind: WikiEntityKind, index: number, value: string) {
  if (index === 0) return "tier";
  if (kind === "items" && index === 1) {
    return `rarity-${value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()}`;
  }
  if ((kind === "monsters" || kind === "bosses") && index === 2) return "location";
  return "neutral";
}

export function WikiEntityCard({
  kind,
  entity,
  compact = false,
}: {
  kind: WikiEntityKind;
  entity: WikiEntitySummary;
  compact?: boolean;
}) {
  const imageUrl = getWikiEntityImage(kind, entity);
  const FallbackIcon = FALLBACK_ICONS[kind];
  const meta = getWikiEntityMeta(kind, entity);

  return (
    <Link
      className={`wiki-entity-card${compact ? " wiki-entity-card--compact" : ""}`}
      to={getWikiEntityPath(kind, entity)}
    >
      <div className={`wiki-entity-card__visual wiki-entity-card__visual--${kind}`}>
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <FallbackIcon size={30} aria-hidden="true" />
        )}
      </div>
      <div className="wiki-entity-card__body">
        <div className="wiki-entity-card__meta">
          {meta.map((value, index) => (
            <span key={value} data-tone={getMetaTone(kind, index, value)}>{value}</span>
          ))}
        </div>
        <strong>{entity.name}</strong>
        {!compact ? <p>{getWikiEntityDescription(kind, entity)}</p> : null}
      </div>
    </Link>
  );
}
