import { AutoCombatSessionPhase, Prisma } from '@prisma/client';

const EQUIPMENT_SLOTS = [
  'mainHand',
  'offHand',
  'head',
  'armor',
  'pants',
  'boots',
] as const;

type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

type SnapshotItemSource = {
  id?: unknown;
  name?: unknown;
  tier?: unknown;
  rarity?: unknown;
  family?: unknown;
  enhancementLevel?: unknown;
  strengthBonus?: unknown;
  vitalityBonus?: unknown;
  agilityBonus?: unknown;
  precisionBonus?: unknown;
  techniqueBonus?: unknown;
  willpowerBonus?: unknown;
};

type PetDefinitionSnapshotSource = {
  id?: unknown;
  key?: unknown;
  name?: unknown;
  tier?: unknown;
  specialization?: unknown;
  effectType?: unknown;
  effectBasisPoints?: unknown;
};

type CharacterPetSnapshotSource = {
  id?: unknown;
  status?: unknown;
  petDefinitionId?: unknown;
  petDefinition?: PetDefinitionSnapshotSource | null;
};

type CharacterSnapshotSource = {
  level?: unknown;
  classId?: unknown;
  class?: { id?: unknown; name?: unknown } | null;
  user?: { premiumUntil?: unknown } | null;
  equipment?: Partial<Record<EquipmentSlot, SnapshotItemSource | null>> | null;
  equippedPet?: CharacterPetSnapshotSource | null;
};

type HuntingSkillSnapshotSource = {
  level?: unknown;
  xp?: unknown;
  totalXp?: unknown;
};

type AutoCombatTimingSession = {
  phase?: AutoCombatSessionPhase | null;
  characterLevelSnapshot?: unknown;
  lastProcessedAt?: unknown;
  lastHuntProcessedAt?: unknown;
};

function finiteInteger(value: unknown, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalIsoDate(value: unknown) {
  if (!value) return null;
  if (
    !(value instanceof Date) &&
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safeString(value: unknown) {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : '';
}

function optionalDate(value: unknown) {
  const isoDate = optionalIsoDate(value);
  return isoDate ? new Date(isoDate) : null;
}

function snapshotItem(
  slot: EquipmentSlot,
  item: SnapshotItemSource | null | undefined,
) {
  if (!item) return { slot, equipped: false };

  return {
    slot,
    equipped: true,
    itemId: safeString(item.id),
    name: safeString(item.name),
    tier: finiteInteger(item.tier, 1),
    rarity: safeString(item.rarity),
    family: safeString(item.family),
    enhancementLevel: finiteInteger(item.enhancementLevel),
    bonuses: {
      strength: finiteInteger(item.strengthBonus),
      vitality: finiteInteger(item.vitalityBonus),
      agility: finiteInteger(item.agilityBonus),
      precision: finiteInteger(item.precisionBonus),
      technique: finiteInteger(item.techniqueBonus),
      willpower: finiteInteger(item.willpowerBonus),
    },
  };
}

export function buildAutoCombatSessionTelemetrySnapshot(params: {
  character: CharacterSnapshotSource;
  huntingSkill: HuntingSkillSnapshotSource | null | undefined;
  mapId: string;
  mapTier: number;
  premiumActive: boolean;
}) {
  const { character, huntingSkill } = params;
  const equipmentSlots = EQUIPMENT_SLOTS.map((slot) =>
    snapshotItem(slot, character.equipment?.[slot]),
  );
  const equippedPet = character.equippedPet;
  const petDefinition = equippedPet?.petDefinition;

  return {
    characterLevelSnapshot: Math.max(1, finiteInteger(character.level, 1)),
    classIdSnapshot: safeString(character.classId ?? character.class?.id ?? ''),
    classNameSnapshot: safeString(character.class?.name ?? ''),
    equipmentSnapshot: {
      equippedPieceCount: equipmentSlots.filter((slot) => slot.equipped).length,
      slots: equipmentSlots,
    },
    huntingSnapshot: {
      level: Math.max(1, finiteInteger(huntingSkill?.level, 1)),
      xp: Math.max(0, finiteInteger(huntingSkill?.xp)),
      totalXp: Math.max(0, finiteInteger(huntingSkill?.totalXp)),
      mapId: params.mapId,
      mapTier: Math.max(1, finiteInteger(params.mapTier, 1)),
    },
    petSnapshot: equippedPet
      ? {
          equipped: true,
          characterPetId: safeString(equippedPet.id),
          status: safeString(equippedPet.status),
          definitionId: safeString(
            petDefinition?.id ?? equippedPet.petDefinitionId ?? '',
          ),
          key: safeString(petDefinition?.key ?? ''),
          name: safeString(petDefinition?.name ?? ''),
          tier: Math.max(1, finiteInteger(petDefinition?.tier, 1)),
          specialization: safeString(petDefinition?.specialization ?? ''),
          effectType: safeString(petDefinition?.effectType ?? ''),
          effectBasisPoints: Math.max(
            0,
            finiteInteger(petDefinition?.effectBasisPoints),
          ),
        }
      : { equipped: false },
    premiumSnapshot: params.premiumActive,
    premiumUntilSnapshot: optionalDate(character.user?.premiumUntil),
  };
}

function dateFromUpdateValue(value: unknown): Date | null {
  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    'set' in value
  ) {
    return optionalDate((value as { set?: unknown }).set);
  }

  return optionalDate(value);
}

function elapsedMs(from: unknown, to: unknown) {
  const fromDate = optionalDate(from);
  const toDate = dateFromUpdateValue(to);

  if (!fromDate || !toDate) return 0;
  return Math.max(0, Math.floor(toDate.getTime() - fromDate.getTime()));
}

export function buildAutoCombatPhaseDurationIncrement(
  session: AutoCombatTimingSession,
  data: Prisma.AutoCombatSessionUncheckedUpdateManyInput,
): Prisma.AutoCombatSessionUncheckedUpdateManyInput {
  if (finiteInteger(session.characterLevelSnapshot) < 1) {
    return {};
  }

  if (session.phase === AutoCombatSessionPhase.HUNTING) {
    const durationMs = elapsedMs(
      session.lastHuntProcessedAt ?? session.lastProcessedAt,
      data.lastHuntProcessedAt ?? data.lastProcessedAt,
    );

    return durationMs > 0
      ? { huntingDurationMs: { increment: durationMs } }
      : {};
  }

  if (session.phase === AutoCombatSessionPhase.COMBAT_ACTIVE) {
    const durationMs = elapsedMs(session.lastProcessedAt, data.lastProcessedAt);

    return durationMs > 0
      ? { combatDurationMs: { increment: durationMs } }
      : {};
  }

  return {};
}

export function withAutoCombatPhaseDurationIncrement(
  session: AutoCombatTimingSession,
  data: Prisma.AutoCombatSessionUncheckedUpdateManyInput,
): Prisma.AutoCombatSessionUncheckedUpdateManyInput {
  return {
    ...data,
    ...buildAutoCombatPhaseDurationIncrement(session, data),
  };
}
