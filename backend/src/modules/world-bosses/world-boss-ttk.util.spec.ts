import {
  calculateProjectedWorldBossTtkSeconds,
  calculateWorldBossDamageTick,
  calculateWorldBossHpFromTtk,
  calculateWorldBossReadinessRatio,
  getWorldBossTargetTtkSeconds,
} from './world-boss-ttk.util';

function equipmentProgression(effectiveTier: number) {
  return {
    craftedPieces: effectiveTier > 0 ? 6 : 0,
    coherentPieces: effectiveTier > 0 ? 6 : 0,
    coherentTier: Math.floor(effectiveTier),
    averageTier: effectiveTier,
    effectiveTier,
    averageEnhancementLevel: 0,
    activeMilestone: effectiveTier > 0 ? 6 : 0,
    nextMilestone: null,
    bonusPercent: effectiveTier > 0 ? 12 : 0,
  };
}

describe('world boss TTK balance', () => {
  it('define alvos menores para grupos sem tornar solo inviavel', () => {
    expect(getWorldBossTargetTtkSeconds('CONTENCAO', 1)).toBe(45 * 60);
    expect(getWorldBossTargetTtkSeconds('CONTENCAO', 2)).toBe(35 * 60);
    expect(getWorldBossTargetTtkSeconds('CONTENCAO', 5)).toBe(30 * 60);
    expect(getWorldBossTargetTtkSeconds('CONTENCAO', 10)).toBe(25 * 60);
    expect(getWorldBossTargetTtkSeconds('EXTERMINIO', 1)).toBe(60 * 60);
    expect(getWorldBossTargetTtkSeconds('EXTERMINIO', 10)).toBe(35 * 60);
  });

  it('faz o set anterior ficar 25% mais lento sem normalizar equipamento ausente', () => {
    const current = calculateWorldBossReadinessRatio({
      bossTier: 3,
      bossLevel: 25,
      characterLevel: 25,
      equipmentProgression: equipmentProgression(3),
      equippedPieceCount: 6,
    });
    const previous = calculateWorldBossReadinessRatio({
      bossTier: 3,
      bossLevel: 25,
      characterLevel: 25,
      equipmentProgression: equipmentProgression(2),
      equippedPieceCount: 6,
    });
    const naked = calculateWorldBossReadinessRatio({
      bossTier: 3,
      bossLevel: 25,
      characterLevel: 25,
      equipmentProgression: equipmentProgression(0),
      equippedPieceCount: 0,
    });

    expect(current).toBe(1);
    expect(previous).toBe(0.8);
    expect(naked).toBeLessThan(previous);
  });

  it('deriva HP do TTK e preserva a vantagem de readiness', () => {
    const targetTtkSeconds = 45 * 60;
    const actualDps = 20;
    const currentHp = calculateWorldBossHpFromTtk({
      targetTtkSeconds,
      scalingDamagePerSecond: [actualDps],
    });
    const previousHp = calculateWorldBossHpFromTtk({
      targetTtkSeconds,
      scalingDamagePerSecond: [actualDps / 0.8],
    });

    expect(
      calculateProjectedWorldBossTtkSeconds({
        hp: currentHp,
        damagePerSecond: [actualDps],
      }),
    ).toBe(targetTtkSeconds);
    expect(
      calculateProjectedWorldBossTtkSeconds({
        hp: previousHp,
        damagePerSecond: [actualDps],
      }),
    ).toBe(targetTtkSeconds / 0.8);
  });

  it('carrega fracao entre ticks e limita overkill ao HP restante', () => {
    const first = calculateWorldBossDamageTick({
      participants: [
        { id: 'a', damagePerSecond: 0.6, damageRemainder: 0 },
        { id: 'b', damagePerSecond: 0.6, damageRemainder: 0 },
      ],
      elapsedSeconds: 1,
      currentHp: 10,
    });
    expect(first).toEqual([
      { id: 'a', damage: 0, damageRemainder: 0.6 },
      { id: 'b', damage: 0, damageRemainder: 0.6 },
    ]);

    const second = calculateWorldBossDamageTick({
      participants: first.map((row) => ({
        id: row.id,
        damagePerSecond: 10,
        damageRemainder: row.damageRemainder,
      })),
      elapsedSeconds: 1,
      currentHp: 7,
    });

    expect(second.reduce((total, row) => total + row.damage, 0)).toBe(7);
    expect(second.every((row) => row.damageRemainder === 0)).toBe(true);
  });
});
