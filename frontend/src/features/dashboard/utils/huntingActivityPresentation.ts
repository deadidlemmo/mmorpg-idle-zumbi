export type HuntingActivityMobSource = {
  id?: string | null;
  name?: string | null;
  level?: number | null;
  tier?: number | null;
  imageUrl?: string | null;
  iconUrl?: string | null;
};

export type HuntingActivityTargetSource = HuntingActivityMobSource & {
  mobId?: string | null;
  mob?: HuntingActivityMobSource | null;
};

export type HuntingActivityTrackedSource = HuntingActivityMobSource & {
  mobId?: string | null;
  mobName?: string | null;
  mobLevel?: number | null;
  mobTier?: number | null;
  encounterId?: string | null;
  foundCount?: number | null;
  remainingCount?: number | null;
  mob?: HuntingActivityMobSource | null;
};

export type HuntingActivityTarget = {
  mobId: string | null;
  encounterId: string | null;
  name: string;
  level: number | null;
  tier: number | null;
  imageUrl: string | null;
};

export type HuntingActivityQueueEntry = HuntingActivityTarget & {
  key: string;
  count: number;
};

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalInteger(value: unknown) {
  const parsed = toFiniteNumber(value);

  return parsed === null ? null : Math.max(0, Math.floor(parsed));
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveMobName(
  source: HuntingActivityTrackedSource | HuntingActivityTargetSource,
) {
  if ("mobName" in source && source.mobName?.trim()) {
    return source.mobName.trim();
  }

  if (source.mob?.name?.trim()) {
    return source.mob.name.trim();
  }

  return source.name?.trim() || null;
}

function resolveMobId(
  source: HuntingActivityTrackedSource | HuntingActivityTargetSource,
) {
  return source.mobId?.trim() || source.mob?.id?.trim() || source.id?.trim() || null;
}

function resolveImageUrl(
  source: HuntingActivityTrackedSource | HuntingActivityTargetSource,
) {
  return (
    source.mob?.imageUrl?.trim() ||
    source.mob?.iconUrl?.trim() ||
    source.imageUrl?.trim() ||
    source.iconUrl?.trim() ||
    null
  );
}

export function resolveHuntingActivityTarget(
  sources: ReadonlyArray<HuntingActivityTargetSource | null | undefined>,
): HuntingActivityTarget | null {
  for (const source of sources) {
    if (!source) continue;

    const name = resolveMobName(source);

    if (!name) continue;

    const hasNestedMob = Boolean(source.mob);

    return {
      mobId: resolveMobId(source),
      encounterId: hasNestedMob ? source.id?.trim() || null : null,
      name,
      level: toOptionalInteger(source.mob?.level ?? source.level),
      tier: toOptionalInteger(source.mob?.tier ?? source.tier),
      imageUrl: resolveImageUrl(source),
    };
  }

  return null;
}

export function buildHuntingActivityQueue(
  sources: ReadonlyArray<
    ReadonlyArray<HuntingActivityTrackedSource> | null | undefined
  >,
) {
  const source = sources.find((candidate) => candidate && candidate.length > 0);

  if (!source) return [];

  const grouped = new Map<string, HuntingActivityQueueEntry>();

  source.forEach((trackedMonster, index) => {
    const remainingCount = toOptionalInteger(trackedMonster.remainingCount);
    const count =
      remainingCount ?? toOptionalInteger(trackedMonster.foundCount) ?? 0;

    if (count <= 0) return;

    const name = resolveMobName(trackedMonster) ?? "Ameaça rastreada";
    const mobId = resolveMobId(trackedMonster);
    const encounterId = trackedMonster.encounterId?.trim() || null;
    const identity =
      mobId || normalizeKey(name) || encounterId || `tracked-${index}`;
    const existing = grouped.get(identity);

    if (existing) {
      existing.count += count;
      return;
    }

    grouped.set(identity, {
      key: identity,
      mobId,
      encounterId,
      name,
      level: toOptionalInteger(
        trackedMonster.mobLevel ?? trackedMonster.mob?.level,
      ),
      tier: toOptionalInteger(
        trackedMonster.mobTier ?? trackedMonster.mob?.tier,
      ),
      imageUrl: resolveImageUrl(trackedMonster),
      count,
    });
  });

  return Array.from(grouped.values()).sort((left, right) => {
    const tierDifference =
      (left.tier ?? Number.MAX_SAFE_INTEGER) -
      (right.tier ?? Number.MAX_SAFE_INTEGER);

    if (tierDifference !== 0) return tierDifference;

    const levelDifference =
      (left.level ?? Number.MAX_SAFE_INTEGER) -
      (right.level ?? Number.MAX_SAFE_INTEGER);

    if (levelDifference !== 0) return levelDifference;

    return left.name.localeCompare(right.name, "pt-BR");
  });
}

export function countHuntingActivityQueue(
  entries: ReadonlyArray<HuntingActivityQueueEntry>,
) {
  return entries.reduce((total, entry) => total + entry.count, 0);
}
