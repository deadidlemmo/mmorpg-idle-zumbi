const MINUTE_IN_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

const expirationFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export type PremiumTimePresentation = {
  isActive: boolean;
  remainingLabel: string;
  expirationLabel: string | null;
};

function formatDurationUnit(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatRemainingTime(totalMinutes: number) {
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor(
    (totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR,
  );
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  const parts = [
    days > 0
      ? { value: days, label: formatDurationUnit(days, "dia", "dias") }
      : null,
    hours > 0
      ? { value: hours, label: formatDurationUnit(hours, "hora", "horas") }
      : null,
    minutes > 0
      ? {
          value: minutes,
          label: formatDurationUnit(minutes, "minuto", "minutos"),
        }
      : null,
  ].filter((part): part is { value: number; label: string } => Boolean(part));

  const visibleParts = parts.slice(0, 2);

  return {
    label: visibleParts.map(({ label }) => label).join(" e "),
    isSingular: visibleParts.length === 1 && visibleParts[0].value === 1,
  };
}

export function buildPremiumTimePresentation(
  premiumUntil?: string | null,
  nowMs = Date.now(),
): PremiumTimePresentation {
  const expirationMs = premiumUntil ? Date.parse(premiumUntil) : Number.NaN;

  if (!Number.isFinite(expirationMs) || expirationMs <= nowMs) {
    return {
      isActive: false,
      remainingLabel: "Nenhum tempo Premium ativo",
      expirationLabel: null,
    };
  }

  const totalMinutes = Math.max(
    1,
    Math.ceil((expirationMs - nowMs) / MINUTE_IN_MS),
  );

  const remainingTime = formatRemainingTime(totalMinutes);

  return {
    isActive: true,
    remainingLabel: `${remainingTime.label} ${
      remainingTime.isSingular ? "restante" : "restantes"
    }`,
    expirationLabel: expirationFormatter.format(new Date(expirationMs)),
  };
}
