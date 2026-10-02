export const COMBAT_CLASS_KEYS = [
  "lutador",
  "atirador",
  "medico",
  "assassino",
] as const;

export type CombatClassKey = (typeof COMBAT_CLASS_KEYS)[number];
const COMBAT_ANIMATION_NAMES = ["attack", "hurt", "death"] as const;
type SurvivorCombatAnimation = (typeof COMBAT_ANIMATION_NAMES)[number];

export function getCombatClassKey(className: string | null | undefined): CombatClassKey | null {
  const normalized = className
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return COMBAT_CLASS_KEYS.find((key) => key === normalized) ?? null;
}

export function getCombatClassLungeDistance(className: string | null | undefined): number {
  switch (getCombatClassKey(className)) {
    case "atirador":
      return 0;
    case "medico":
      return 10;
    case "assassino":
      return 18;
    default:
      return 20;
  }
}

export function getSurvivorCombatAnimationKey(
  animation: SurvivorCombatAnimation,
  direction: "down" | "left" | "right" | "up",
  className?: string | null,
): string {
  const classKey = getCombatClassKey(className);
  return `suburbio-survivor-${animation}-${classKey ? `${classKey}-` : ""}${direction}`;
}

export function isSurvivorCombatAnimationKey(key: string): boolean {
  return COMBAT_ANIMATION_NAMES.some((animation) =>
    key.startsWith(`suburbio-survivor-${animation}-`),
  );
}
