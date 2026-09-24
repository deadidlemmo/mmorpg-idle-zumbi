import { getCosmeticEffectMedia } from "../constants/cosmetic-assets";

interface CosmeticEffectLayerProps {
  effectPreset?: string | null;
}

export function CosmeticEffectLayer({
  effectPreset,
}: CosmeticEffectLayerProps) {
  const media = getCosmeticEffectMedia(effectPreset);

  return (
    <span className="cosmetic-effect-layer" aria-hidden="true">
      {media ? (
        <picture>
          <source
            media="(prefers-reduced-motion: reduce)"
            srcSet={media.poster}
          />
          <img
            className="cosmetic-effect-layer__media"
            src={media.animated}
            alt=""
            draggable={false}
            decoding="async"
          />
        </picture>
      ) : null}
    </span>
  );
}
