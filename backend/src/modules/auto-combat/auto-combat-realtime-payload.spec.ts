import {
  buildAutoCombatRealtimeStatusPayload,
  getSerializedPayloadBytes,
} from './auto-combat-realtime-payload';

describe('auto-combat realtime payload', () => {
  it('preserva a timeline e remove detalhes repetidos do status', () => {
    const payload = {
      active: true,
      serverNow: '2026-08-24T12:00:00.000Z',
      character: {
        id: 'character-1',
        name: 'Lutador',
        currentHp: 120,
        maxHp: 150,
        inventoryItems: Array.from({ length: 100 }, (_, index) => ({
          id: `inventory-${index}`,
          item: { description: 'x'.repeat(500) },
        })),
      },
      session: {
        id: 'session-1',
        characterId: 'character-1',
        status: 'ACTIVE',
        phase: 'COMBAT_ACTIVE',
        totalKills: 12,
        battleProgress: {
          activityInstanceId: 'session-1',
          enemyInstanceId: 'enemy-13',
          cycleStartedAt: '2026-08-24T11:59:58.000Z',
          cycleEndsAt: '2026-08-24T12:00:01.000Z',
          cycleDurationMs: 2775,
          remainingMs: 1000,
          serverNow: '2026-08-24T12:00:00.000Z',
          estimatedKillTimeSeconds: 2.775,
          estimatedKillTimeMs: 2775,
          unmodifiedKillTimeMs: 3000,
          appliedPetBonus: {
            petDefinitionId: 'pet-auto-combat-t5',
            effectBasisPoints: 750,
            effectPercent: 7.5,
          },
        },
      },
      currentMob: {
        id: 'mob-1',
        name: 'Sindico Devorado',
        currentHp: 90,
        maxHp: 200,
        drops: Array.from({ length: 30 }, (_, index) => ({
          id: `drop-${index}`,
          item: { description: 'y'.repeat(500) },
        })),
      },
      trackedMonsters: [
        {
          mobId: 'mob-1',
          mobName: 'Sindico Devorado',
          foundCount: 200,
          remainingCount: 188,
          mob: { description: 'z'.repeat(10_000) },
        },
      ],
      hunting: {
        cycleStartedAt: '2026-08-24T11:59:55.450Z',
        cycleEndsAt: '2026-08-24T12:00:10.000Z',
        cycleDurationMs: 14550,
        cycleVersion: 13,
        baseSecondsPerEnemy: 15,
        secondsPerEnemy: 14.55,
        appliedPetBonus: {
          petDefinitionId: 'pet-hunting-t1',
          effectBasisPoints: 300,
          effectPercent: 3,
        },
        cycleTargetEncounterId: 'encounter-2',
        cycleTargetMobId: 'mob-2',
        targetEncounterId: 'encounter-2',
        targetMobId: 'mob-2',
        currentTarget: {
          id: 'encounter-2',
          mobId: 'mob-2',
          subMapId: 'sub-map-1',
          weight: 80,
          isActive: true,
          mob: {
            id: 'mob-2',
            name: 'Porteiro Infectado',
            level: 7,
            tier: 1,
            hp: 138,
            drops: Array.from({ length: 20 }, () => ({
              description: 'nao transportar'.repeat(500),
            })),
          },
        },
        targetEncounter: {
          id: 'encounter-2',
          mobId: 'mob-2',
          mob: {
            id: 'mob-2',
            name: 'Porteiro Infectado',
            level: 7,
            tier: 1,
          },
        },
        timeline: {
          activityInstanceId: 'hunt-1',
          cycleId: 'hunt-cycle-13',
          serverNow: '2026-08-24T12:00:00.000Z',
          startedAt: '2026-08-24T11:59:55.000Z',
          endsAt: '2026-08-24T12:00:10.000Z',
          durationMs: 15000,
          direction: 'fill',
          version: 13,
        },
        trackedMonsters: Array.from({ length: 30 }, () => ({
          description: 'duplicado'.repeat(500),
        })),
      },
      rewards: {
        loots: [
          {
            itemId: 'item-1',
            itemName: 'Residuo infecto',
            quantity: 4,
            rarity: 'COMMON',
            item: {
              id: 'item-1',
              slug: 'residuo-infecto-palido',
              tier: 1,
              rarity: 'COMMON',
              slot: 'MATERIAL',
              family: 'Biomaterial',
              materialOrigin: 'DROP_MOBS',
              imageUrl: '/assets/residuo-infecto.webp',
              description: 'detalhe que nao deve trafegar',
            },
            description: 'nao transportar'.repeat(1000),
          },
        ],
        trackedMonsters: Array.from({ length: 30 }, () => ({
          description: 'duplicado'.repeat(500),
        })),
      },
    };

    const compact = buildAutoCombatRealtimeStatusPayload(payload) as Record<
      string,
      unknown
    >;
    const compactCharacter = compact.character as Record<string, unknown>;
    const compactHunting = compact.hunting as Record<string, unknown>;
    const compactSession = compact.session as Record<string, unknown>;
    const compactBattleProgress = compactSession.battleProgress as Record<
      string,
      unknown
    >;
    const compactTracked = compact.trackedMonsters as Array<
      Record<string, unknown>
    >;
    const compactRewards = compact.rewards as {
      loots: Array<Record<string, unknown>>;
    };
    const compactLootItem = compactRewards.loots[0]?.item as Record<
      string,
      unknown
    >;

    expect(compactCharacter.inventoryItems).toBeUndefined();
    expect(compactHunting.timeline).toEqual(payload.hunting.timeline);
    expect(compactHunting).toMatchObject({
      cycleDurationMs: 14550,
      cycleVersion: 13,
      baseSecondsPerEnemy: 15,
      secondsPerEnemy: 14.55,
      appliedPetBonus: payload.hunting.appliedPetBonus,
      cycleTargetEncounterId: 'encounter-2',
      cycleTargetMobId: 'mob-2',
      currentTarget: {
        id: 'encounter-2',
        mobId: 'mob-2',
        mob: {
          id: 'mob-2',
          name: 'Porteiro Infectado',
        },
      },
    });
    expect(
      (compactHunting.currentTarget as Record<string, unknown>).drops,
    ).toBeUndefined();
    expect(
      (
        (compactHunting.currentTarget as Record<string, unknown>).mob as Record<
          string,
          unknown
        >
      ).drops,
    ).toBeUndefined();
    expect(compactHunting.trackedMonsters).toBeUndefined();
    expect(compactBattleProgress).toMatchObject({
      cycleDurationMs: 2775,
      estimatedKillTimeSeconds: 2.775,
      estimatedKillTimeMs: 2775,
      unmodifiedKillTimeMs: 3000,
      appliedPetBonus: payload.session.battleProgress.appliedPetBonus,
    });
    expect(compactTracked[0].remainingCount).toBe(188);
    expect(compactTracked[0].mob).toBeUndefined();
    expect(compactLootItem).toMatchObject({
      slug: 'residuo-infecto-palido',
      tier: 1,
      rarity: 'COMMON',
      slot: 'MATERIAL',
      family: 'Biomaterial',
      materialOrigin: 'DROP_MOBS',
      imageUrl: '/assets/residuo-infecto.webp',
    });
    expect(compactLootItem.description).toBeUndefined();
    expect(getSerializedPayloadBytes(compact)).toBeLessThan(
      getSerializedPayloadBytes(payload) * 0.1,
    );
  });

  it('preserva null canonico para limpar o estado visual encerrado', () => {
    const compact = buildAutoCombatRealtimeStatusPayload({
      active: true,
      currentMob: null,
      battleProgress: null,
      selectedEncounter: null,
      hunting: null,
      huntBatch: null,
      rewards: null,
    });

    expect(compact).toMatchObject({
      active: true,
      currentMob: null,
      battleProgress: null,
      selectedEncounter: null,
      hunting: null,
      huntBatch: null,
      rewards: null,
    });
  });
});
