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
          cycleDurationMs: 3000,
          remainingMs: 1000,
          serverNow: '2026-08-24T12:00:00.000Z',
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
    expect(compactHunting.trackedMonsters).toBeUndefined();
    expect(compactTracked[0].remainingCount).toBe(188);
    expect(compactTracked[0].mob).toBeUndefined();
    expect(compactLootItem.imageUrl).toBe('/assets/residuo-infecto.webp');
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
