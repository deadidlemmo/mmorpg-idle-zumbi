import { getWikiSystemPresentation } from "../content/wikiSystemPresentation";

export function WikiSystemArtwork({
  slug,
  size = "card",
}: {
  slug: string;
  size?: "card" | "header";
}) {
  const presentation = getWikiSystemPresentation(slug);
  if (!presentation) return null;

  const {
    icon: Icon,
    customIcon: CustomIcon,
    image,
    fit = "contain",
    tone,
  } = presentation;

  return (
    <span
      className={`wiki-system-artwork wiki-system-artwork--${size}`}
      data-fit={fit}
      data-tone={tone}
      aria-hidden="true"
    >
      {image ? (
        <img src={image} alt="" />
      ) : CustomIcon ? (
        <CustomIcon className="wiki-system-artwork__custom-icon" />
      ) : (
        <Icon size={size === "header" ? 34 : 25} strokeWidth={1.7} />
      )}
    </span>
  );
}
