import type { ImgHTMLAttributes, ReactNode } from "react";
import {
  getEquipmentEnhancementLevel,
  type EquipmentEnhancementSource,
} from "../utils/equipmentEnhancement";
import "../styles/equipment-item-artwork.css";

interface EquipmentItemArtworkProps {
  item?: EquipmentEnhancementSource | null;
  imageUrl?: string | null;
  alt?: string;
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
  size?: "compact" | "regular" | "large";
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  draggable?: boolean;
}

export function EquipmentItemArtwork({
  item,
  imageUrl,
  alt = "",
  className = "",
  imageClassName,
  fallback = null,
  size = "regular",
  loading,
  draggable,
}: EquipmentItemArtworkProps) {
  const enhancementLevel = getEquipmentEnhancementLevel(item);
  const classNames = [
    "equipment-item-artwork",
    `equipment-item-artwork--${size}`,
    enhancementLevel > 0
      ? `is-enhanced equipment-item-artwork--level-${enhancementLevel}`
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classNames}
      data-enhancement-level={enhancementLevel || undefined}
    >
      {enhancementLevel > 0 ? (
        <span className="equipment-item-artwork__rays" aria-hidden="true" />
      ) : null}

      {imageUrl ? (
        <img
          className={imageClassName}
          src={imageUrl}
          alt={alt}
          loading={loading}
          draggable={draggable}
        />
      ) : (
        <span className="equipment-item-artwork__fallback">{fallback}</span>
      )}

      {enhancementLevel > 0 ? (
        <span
          className="equipment-item-artwork__badge"
          aria-hidden="true"
        >
          +{enhancementLevel}
        </span>
      ) : null}
    </span>
  );
}
