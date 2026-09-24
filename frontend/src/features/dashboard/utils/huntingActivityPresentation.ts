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

export type HuntingActivityDefeatedSource = HuntingActivityMobSource & {
  mobId?: string | null;
  mobName?: string | null;
  mobLevel?: number | null;
  mobTier?: number | null;
  kills?: number | null;
  xpGained?: number | null;
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

export type HuntingActivityDefeatedEventSource = {
  id?: string | null;
  eventId?: string | null;
  eventKey?: string | null;
  sequence?: number | null;
  type?: string | null;
  mobId?: string | null;
  mobName?: string | null;
  mobLevel?: number | null;
  mobTier?: number | null;
  totalKills?: number | null;
  killsGained?: number | null;
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

export function buildHuntingDefeatedQueue(
  sources: ReadonlyArray<
    ReadonlyArray<HuntingActivityDefeatedSource> | null | undefined
  >,
) {
  const source = sources.find((candidate) => candidate && candidate.length > 0);

  if (!source) return [];

  const grouped = new Map<string, HuntingActivityQueueEntry>();

  source.forEach((defeatedMob, index) => {
    const count = toOptionalInteger(defeatedMob.kills) ?? 0;
    if (count <= 0) return;

    const name = resolveMobName(defeatedMob) ?? "Ameaça derrotada";
    const mobId = resolveMobId(defeatedMob);
    const identity = mobId || normalizeKey(name) || `defeated-${index}`;
    const existing = grouped.get(identity);

    if (existing) {
      existing.count += count;
      return;
    }

    grouped.set(identity, {
      key: identity,
      mobId,
      encounterId: null,
      name,
      level: toOptionalInteger(defeatedMob.mobLevel ?? defeatedMob.mob?.level),
      tier: toOptionalInteger(defeatedMob.mobTier ?? defeatedMob.mob?.tier),
      imageUrl: resolveImageUrl(defeatedMob),
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

export function mergeHuntingDefeatedRealtimeEvents(
  defeatedMobs: ReadonlyArray<HuntingActivityQueueEntry>,
  events: ReadonlyArray<HuntingActivityDefeatedEventSource>,
) {
  const grouped = new Map(
    defeatedMobs.map((entry) => [entry.key, { ...entry }]),
  );
  let releasedTotal = countHuntingActivityQueue(defeatedMobs);
  const processedKeys = new Set<string>();

  const orderedEvents = [...events].sort((left, right) => {
    const totalDifference =
      (toOptionalInteger(left.totalKills) ?? Number.MAX_SAFE_INTEGER) -
      (toOptionalInteger(right.totalKills) ?? Number.MAX_SAFE_INTEGER);
    if (totalDifference !== 0) return totalDifference;

    return (
      (toOptionalInteger(left.sequence) ?? Number.MAX_SAFE_INTEGER) -
      (toOptionalInteger(right.sequence) ?? Number.MAX_SAFE_INTEGER)
    );
  });

  for (const event of orderedEvents) {
    if (String(event.type ?? "").trim().toUpperCase() !== "MOB_DEFEATED") {
      continue;
    }

    const eventKey = String(
      event.eventKey ?? event.eventId ?? event.id ?? event.sequence ?? "",
    ).trim();
    if (eventKey && processedKeys.has(eventKey)) continue;
    if (eventKey) processedKeys.add(eventKey);

    const eventTotal = toOptionalInteger(event.totalKills);
    if (eventTotal === null || eventTotal <= releasedTotal) continue;

    const availableIncrease = eventTotal - releasedTotal;
    const explicitIncrease = toOptionalInteger(event.killsGained);
    const count = Math.min(
      availableIncrease,
      Math.max(1, explicitIncrease ?? 1),
    );
    const name = event.mobName?.trim() || "Ameaça derrotada";
    const mobId = event.mobId?.trim() || null;
    const identity = mobId || normalizeKey(name) || `realtime-${eventTotal}`;
    const existing = grouped.get(identity);

    if (existing) {
      existing.count += count;
    } else {
      grouped.set(identity, {
        key: identity,
        mobId,
        encounterId: null,
        name,
        level: toOptionalInteger(event.mobLevel),
        tier: toOptionalInteger(event.mobTier),
        imageUrl: null,
        count,
      });
    }

    releasedTotal += count;
  }

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
