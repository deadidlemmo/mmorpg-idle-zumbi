import { AutoCombatSessionPhase } from '@prisma/client';
import {
  buildAutoCombatPhaseDurationIncrement,
  buildAutoCombatSessionTelemetrySnapshot,
} from './auto-combat-session-telemetry';

describe('auto-combat session telemetry', () => {
  it('freezes character, equipment, hunting, pet and premium state', () => {
    const premiumUntil = new Date('2026-09-15T12:00:00.000Z');
    const snapshot = buildAutoCombatSessionTelemetrySnapshot({
      character: {
        level: 34,
        classId: 'class-atirador',
        class: { id: 'class-atirador', name: 'Atirador' },
        user: { premiumUntil },
        equipment: {
          mainHand: {
            id: 'rifle-t4',
            name: 'Rifle T4',
            tier: 4,
            rarity: 'UNCOMMON',
            family: 'Rifle',
            enhancementLevel: 2,
            precisionBonus: 18,
          },
        },
        equippedPet: {
          id: 'character-pet-1',
          status: 'AVAILABLE',
          petDefinitionId: 'pet-definition-1',
          petDefinition: {
            id: 'pet-definition-1',
            key: 'combate-t4',
            name: 'Predador do Terminal',
            tier: 4,
            specialization: 'AUTO_COMBAT_TTK',
            effectType: 'AUTO_COMBAT_TTK_REDUCTION',
            effectBasisPoints: 600,
          },
        },
      },
      huntingSkill: { level: 31, xp: 120, totalXp: 9_800 },
      mapId: 'map-t4',
      mapTier: 4,
      premiumActive: true,
    });

    expect(snapshot).toMatchObject({
      characterLevelSnapshot: 34,
      classIdSnapshot: 'class-atirador',
      classNameSnapshot: 'Atirador',
      equipmentSnapshot: {
        equippedPieceCount: 1,
      },
      huntingSnapshot: {
        level: 31,
        xp: 120,
        totalXp: 9_800,
        mapId: 'map-t4',
        mapTier: 4,
      },
      petSnapshot: {
        equipped: true,
        definitionId: 'pet-definition-1',
        tier: 4,
        effectBasisPoints: 600,
      },
      premiumSnapshot: true,
      premiumUntilSnapshot: premiumUntil,
    });
    expect(snapshot.equipmentSnapshot.slots).toHaveLength(6);
    expect(snapshot.equipmentSnapshot.slots[0]).toMatchObject({
      slot: 'mainHand',
      equipped: true,
      itemId: 'rifle-t4',
      enhancementLevel: 2,
      bonuses: { precision: 18 },
    });
  });

  it('records elapsed hunting time only while hunting', () => {
    expect(
      buildAutoCombatPhaseDurationIncrement(
        {
          phase: AutoCombatSessionPhase.HUNTING,
          characterLevelSnapshot: 20,
          lastProcessedAt: new Date('2026-08-30T12:00:00.000Z'),
          lastHuntProcessedAt: new Date('2026-08-30T12:00:00.000Z'),
        },
        {
          lastProcessedAt: new Date('2026-08-30T12:00:15.000Z'),
          lastHuntProcessedAt: new Date('2026-08-30T12:00:15.000Z'),
        },
      ),
    ).toEqual({ huntingDurationMs: { increment: 15_000 } });
  });

  it('records elapsed combat time and ignores waiting in encounter ready', () => {
    const data = {
      lastProcessedAt: new Date('2026-08-30T12:00:03.250Z'),
    };

    expect(
      buildAutoCombatPhaseDurationIncrement(
        {
          phase: AutoCombatSessionPhase.COMBAT_ACTIVE,
          characterLevelSnapshot: 20,
          lastProcessedAt: new Date('2026-08-30T12:00:00.000Z'),
        },
        data,
      ),
    ).toEqual({ combatDurationMs: { increment: 3_250 } });
    expect(
      buildAutoCombatPhaseDurationIncrement(
        {
          phase: AutoCombatSessionPhase.ENCOUNTER_READY,
          characterLevelSnapshot: 20,
          lastProcessedAt: new Date('2026-08-30T12:00:00.000Z'),
        },
        data,
      ),
    ).toEqual({});
  });

  it('never records negative or duplicate elapsed time', () => {
    expect(
      buildAutoCombatPhaseDurationIncrement(
        {
          phase: AutoCombatSessionPhase.COMBAT_ACTIVE,
          characterLevelSnapshot: 20,
          lastProcessedAt: new Date('2026-08-30T12:00:03.000Z'),
        },
        { lastProcessedAt: new Date('2026-08-30T12:00:03.000Z') },
      ),
    ).toEqual({});
  });

  it('does not mix legacy sessions without a start snapshot into telemetry', () => {
    expect(
      buildAutoCombatPhaseDurationIncrement(
        {
          phase: AutoCombatSessionPhase.COMBAT_ACTIVE,
          characterLevelSnapshot: null,
          lastProcessedAt: new Date('2026-08-30T12:00:00.000Z'),
        },
        { lastProcessedAt: new Date('2026-08-30T12:00:10.000Z') },
      ),
    ).toEqual({});
  });
});
