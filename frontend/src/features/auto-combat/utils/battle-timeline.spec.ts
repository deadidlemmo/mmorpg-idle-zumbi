import assert from "node:assert/strict";
import test from "node:test";
import {
  getBattleBatchCountdown,
  getBattleTimelineRecoveryDelayMs,
  getBattleTimelineProgress,
  getBattleTopBarProgressPercent,
  getBattleTargetDisplayCounts,
  getBattleVisualTimelineProgress,
  getCountdownTimeline,
  getCycleProgress,
  getDisplayBattleBatchCountdown,
  getHuntDisplayCounts,
  getNextSecondTickDelayMs,
  getRepeatingBattleTimelineProgress,
  getRepeatingCycleProgress,
  getRepeatingSecondTickFillPercent,
  getServerClientOffsetMs,
  getSecondTickCycleProgress,
  getStableBattleTargetDisplayCounts,
  getVisibleBattleCycleRemainingPercent,
} from "./battle-timeline.ts";

test("barra superior do combate usa o ciclo visual em vez dos saltos de HP", () => {
  assert.equal(
    getBattleTopBarProgressPercent({
      timelineRemainingPercent: 80,
      mobHpPercent: 37,
    }),
    80,
  );
  assert.equal(
    getBattleTopBarProgressPercent({
      timelineRemainingPercent: 40,
      mobHpPercent: 12,
      isMobSpawnAwaitingImpact: true,
    }),
    100,
  );
  assert.equal(
    getBattleTopBarProgressPercent({
      timelineRemainingPercent: 20,
      mobHpPercent: 12,
      isMobDefeated: true,
    }),
    0,
  );
  assert.equal(getBattleTopBarProgressPercent({ mobHpPercent: 64 }), 64);
});

test("novo alvo entra com barra cheia sem perder o fim autoritativo do ciclo", () => {
  const cycleStartedAtMs = Date.parse("2026-08-22T12:00:00.000Z");
  const cycleDurationMs = 16_000;
  const serverClientOffsetMs = 2_000;
  const visualCycleStartedAtServerMs = cycleStartedAtMs + 1_300;
  const visualCycleStartedAtClientMs =
    visualCycleStartedAtServerMs - serverClientOffsetMs;
  const progress = getBattleVisualTimelineProgress({
    source: { cycleStartedAt: cycleStartedAtMs, cycleDurationMs },
    nowMs: visualCycleStartedAtServerMs,
  });

  assert.equal(
    getVisibleBattleCycleRemainingPercent({
      progress,
      visualCycleStartedAtMs: visualCycleStartedAtClientMs,
      clientNowMs: visualCycleStartedAtClientMs,
      serverClientOffsetMs,
    }),
    100,
  );
  assert.equal(
    getVisibleBattleCycleRemainingPercent({
      progress,
      visualCycleStartedAtMs: visualCycleStartedAtClientMs,
      clientNowMs: visualCycleStartedAtClientMs + 7_350,
      serverClientOffsetMs,
    }),
    50,
  );
  assert.equal(
    getVisibleBattleCycleRemainingPercent({
      progress,
      visualCycleStartedAtMs: visualCycleStartedAtClientMs,
      clientNowMs: visualCycleStartedAtClientMs + 14_700,
      serverClientOffsetMs,
    }),
    0,
  );
});

test("agenda reconciliacao depois que o snapshot visual ultrapassa o fim", () => {
  const snapshotReceivedAtMs = Date.parse("2026-08-21T12:00:04.000Z");
  const source = {
    cycleStartedAt: "2026-08-21T12:00:00.000Z",
    cycleDurationMs: 5_000,
    progressUpdatedAt: "2026-08-21T12:00:04.000Z",
    serverNow: "2026-08-21T12:00:04.000Z",
  };

  assert.equal(
    getBattleTimelineRecoveryDelayMs({
      source,
      snapshotReceivedAtMs,
      nowMs: snapshotReceivedAtMs,
      graceMs: 1_750,
    }),
    2_750,
  );

  assert.equal(
    getBattleTimelineRecoveryDelayMs({
      source,
      snapshotReceivedAtMs,
      nowMs: snapshotReceivedAtMs + 3_000,
      graceMs: 1_750,
    }),
    0,
  );
});

test("calcula progresso de ciclo por timestamp absoluto", () => {
  const progress = getCycleProgress({
    nowMs: 8_000,
    cycleStartedAtMs: 2_000,
    cycleDurationMs: 10_000,
  });

  assert.equal(progress.progress, 0.6);
  assert.equal(progress.progressPercent, 60);
  assert.equal(progress.elapsedMs, 6_000);
  assert.equal(progress.remainingMs, 4_000);
});

test("clampa ciclo concluido sem reiniciar para zero", () => {
  const progress = getCycleProgress({
    nowMs: 15_000,
    cycleStartedAtMs: 2_000,
    cycleDurationMs: 10_000,
  });

  assert.equal(progress.progress, 1);
  assert.equal(progress.progressPercent, 100);
  assert.equal(progress.remainingMs, 0);
  assert.equal(progress.isComplete, true);
});

test("calcula ciclo repetido com ciclos completos separados do progresso atual", () => {
  const progress = getRepeatingCycleProgress({
    nowMs: 27_000,
    cycleStartedAtMs: 2_000,
    cycleDurationMs: 10_000,
  });

  assert.equal(progress.completedCycles, 2);
  assert.equal(progress.progress, 0.5);
  assert.equal(progress.progressPercent, 50);
  assert.equal(progress.cycleElapsedMs, 5_000);
  assert.equal(progress.remainingMs, 5_000);
});

test("deriva progresso de batalha por cycleStartedAt e duration", () => {
  const progress = getBattleTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:08.000Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.000Z",
      cycleDurationMs: 10_000,
    },
  });

  assert.equal(progress?.progressPercent, 60);
  assert.equal(progress?.cycleElapsedMs, 6_000);
  assert.equal(progress?.remainingMs, 4_000);
});

test("deriva inicio do ciclo de progressSeconds ancorado no serverNow", () => {
  const progress = getBattleTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:08.000Z"),
    source: {
      progressSeconds: 3,
      estimatedKillTimeSeconds: 10,
      serverNow: "2026-06-05T12:00:05.000Z",
    },
  });

  assert.equal(
    progress?.cycleStartedAtMs,
    Date.parse("2026-06-05T12:00:02.000Z"),
  );
  assert.equal(progress?.progressPercent, 60);
});

test("deriva progresso visual repetido para ciclos de batalha", () => {
  const cycleStartedAt = "2026-06-05T12:00:02.000Z";
  const progress = getRepeatingBattleTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:27.000Z"),
    source: {
      cycleStartedAt,
      cycleDurationMs: 10_000,
    },
  });
  const timeline = getCountdownTimeline(progress);

  assert.equal(progress?.completedCycles, 2);
  assert.equal(progress?.progressPercent, 50);
  assert.equal(progress?.cycleElapsedMs, 5_000);
  assert.equal(progress?.remainingMs, 5_000);
  assert.equal(timeline?.elapsedSeconds, 5);
  assert.equal(timeline?.remainingPercent, 50);
  assert.equal(timeline?.animationKey, `${Date.parse(cycleStartedAt)}:10000:2`);
});

test("mantem o ciclo concluido enquanto o abate visual aguarda impacto", () => {
  const progress = getBattleVisualTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:07.600Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.000Z",
      cycleDurationMs: 5_000,
    },
  });
  const tickProgress = getSecondTickCycleProgress(progress);

  assert.equal(progress?.isComplete, true);
  assert.equal(progress?.completedCycles, 1);
  assert.equal(tickProgress?.elapsedSeconds, 5);
  assert.equal(tickProgress?.remainingPercent, 0);
});

test("nao reinicia o ciclo antigo antes da confirmacao do proximo mob", () => {
  const progress = getBattleVisualTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:08.200Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.000Z",
      cycleDurationMs: 5_000,
    },
  });
  const tickProgress = getSecondTickCycleProgress(progress);

  assert.equal(progress?.completedCycles, 1);
  assert.equal(progress?.isComplete, true);
  assert.equal(tickProgress?.elapsedSeconds, 5);
  assert.equal(tickProgress?.remainingPercent, 0);
});

test("nao antecipa o fim visual quando o abate chega antes do ultimo segundo", () => {
  const progress = getBattleVisualTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:05.200Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.000Z",
      cycleDurationMs: 5_000,
    },
  });
  const tickProgress = getSecondTickCycleProgress(progress);

  assert.equal(progress?.isComplete, false);
  assert.equal(tickProgress?.elapsedSeconds, 3);
  assert.equal(tickProgress?.remainingPercent, 40);
});

test("inicia o cronometro quando a nova instancia e liberada", () => {
  const progress = getBattleVisualTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:08.200Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:08.000Z",
      cycleDurationMs: 5_000,
    },
  });
  const tickProgress = getSecondTickCycleProgress(progress);

  assert.equal(progress?.completedCycles, 0);
  assert.equal(progress?.isComplete, false);
  assert.equal(tickProgress?.elapsedSeconds, 0);
  assert.equal(tickProgress?.remainingPercent, 100);
});

test("deriva contador visual de abates por ciclos completos", () => {
  const counts = getBattleTargetDisplayCounts({
    total: 15,
    remaining: 15,
    defeated: 0,
    completedCycles: 3,
  });

  assert.equal(counts.defeated, 3);
  assert.equal(counts.remaining, 12);
});

test("contador visual de abates respeita snapshot confirmado e limite do lote", () => {
  const counts = getBattleTargetDisplayCounts({
    total: 9,
    remaining: 4,
    completedCycles: 8,
  });

  assert.equal(counts.snapshotDefeated, 5);
  assert.equal(counts.defeated, 9);
  assert.equal(counts.remaining, 0);
});

test("contador estavel de batalha nao volta em snapshot antigo do mesmo lote", () => {
  const counts = getStableBattleTargetDisplayCounts({
    current: {
      total: 5,
      remaining: 4,
      defeated: 1,
      snapshotRemaining: 4,
      snapshotDefeated: 1,
    },
    previous: {
      total: 5,
      remaining: 3,
      defeated: 2,
      snapshotRemaining: 3,
      snapshotDefeated: 2,
    },
  });

  assert.equal(counts.defeated, 2);
  assert.equal(counts.remaining, 3);
});

test("contador estavel de batalha aceita progresso confirmado mais novo", () => {
  const counts = getStableBattleTargetDisplayCounts({
    current: {
      total: 5,
      remaining: 3,
      defeated: 2,
      snapshotRemaining: 3,
      snapshotDefeated: 2,
    },
    previous: {
      total: 5,
      remaining: 4,
      defeated: 1,
      snapshotRemaining: 4,
      snapshotDefeated: 1,
    },
  });

  assert.equal(counts.defeated, 2);
  assert.equal(counts.remaining, 3);
});

test("calcula timer regressivo total do lote de batalha", () => {
  const countdown = getBattleBatchCountdown({
    total: 10,
    defeated: 0,
    cycleDurationSeconds: 20,
    currentCycleRemainingSeconds: 20,
  });

  assert.equal(countdown.totalSeconds, 200);
  assert.equal(countdown.remainingSeconds, 200);
  assert.equal(countdown.elapsedSeconds, 0);
});

test("timer total do lote diminui com abates e progresso do monstro atual", () => {
  const countdown = getBattleBatchCountdown({
    total: 10,
    defeated: 1,
    cycleDurationSeconds: 20,
    currentCycleRemainingSeconds: 10,
  });

  assert.equal(countdown.totalSeconds, 200);
  assert.equal(countdown.remainingSeconds, 170);
  assert.equal(countdown.elapsedSeconds, 30);
});

test("timer total do lote zera quando todos os monstros foram abatidos", () => {
  const countdown = getBattleBatchCountdown({
    total: 10,
    defeated: 10,
    cycleDurationSeconds: 20,
    currentCycleRemainingSeconds: 20,
  });

  assert.equal(countdown.totalSeconds, 200);
  assert.equal(countdown.remainingSeconds, 0);
  assert.equal(countdown.elapsedSeconds, 200);
});

test("timer visual do lote nao aceita zero transitorio entre monstros", () => {
  const countdown = getDisplayBattleBatchCountdown({
    current: {
      totalSeconds: 60,
      remainingSeconds: 0,
      elapsedSeconds: 60,
    },
    previous: {
      totalSeconds: 60,
      remainingSeconds: 21,
      elapsedSeconds: 39,
    },
    hasUnresolvedTargets: true,
    fallbackRemainingSeconds: 40,
  });

  assert.equal(countdown.totalSeconds, 60);
  assert.equal(countdown.remainingSeconds, 21);
  assert.equal(countdown.elapsedSeconds, 39);
});

test("timer visual do lote nao aumenta quando snapshot antigo volta no mesmo lote", () => {
  const countdown = getDisplayBattleBatchCountdown({
    current: {
      totalSeconds: 44,
      remainingSeconds: 44,
      elapsedSeconds: 0,
    },
    previous: {
      totalSeconds: 44,
      remainingSeconds: 22,
      elapsedSeconds: 22,
    },
    hasUnresolvedTargets: true,
  });

  assert.equal(countdown.totalSeconds, 44);
  assert.equal(countdown.remainingSeconds, 22);
  assert.equal(countdown.elapsedSeconds, 22);
});

test("timer visual do lote nao cria ciclo cheio no fim do ultimo monstro", () => {
  const countdown = getDisplayBattleBatchCountdown({
    current: {
      totalSeconds: 150,
      remainingSeconds: 30,
      elapsedSeconds: 120,
    },
    previous: {
      totalSeconds: 150,
      remainingSeconds: 1,
      elapsedSeconds: 149,
    },
    hasUnresolvedTargets: true,
  });

  assert.equal(countdown.totalSeconds, 150);
  assert.equal(countdown.remainingSeconds, 1);
  assert.equal(countdown.elapsedSeconds, 149);
});

test("timer visual do lote usa fallback quando monta na virada do monstro", () => {
  const countdown = getDisplayBattleBatchCountdown({
    current: {
      totalSeconds: 60,
      remainingSeconds: 0,
      elapsedSeconds: 60,
    },
    previous: null,
    hasUnresolvedTargets: true,
    fallbackRemainingSeconds: 40,
  });

  assert.equal(countdown.totalSeconds, 60);
  assert.equal(countdown.remainingSeconds, 40);
  assert.equal(countdown.elapsedSeconds, 20);
});

test("timer visual do lote permite zero quando nao ha alvos pendentes", () => {
  const countdown = getDisplayBattleBatchCountdown({
    current: {
      totalSeconds: 60,
      remainingSeconds: 0,
      elapsedSeconds: 60,
    },
    previous: {
      totalSeconds: 60,
      remainingSeconds: 1,
      elapsedSeconds: 59,
    },
    hasUnresolvedTargets: false,
    fallbackRemainingSeconds: 20,
  });

  assert.equal(countdown.remainingSeconds, 0);
  assert.equal(countdown.elapsedSeconds, 60);
});

test("projeta contador visual de caca por ciclos completos", () => {
  const counts = getHuntDisplayCounts({
    found: 50,
    maxTrackedEnemies: 600,
    remainingCapacity: 550,
    completedCycles: 3,
  });

  assert.equal(counts.snapshotFound, 50);
  assert.equal(counts.projectedFinds, 3);
  assert.equal(counts.found, 53);
  assert.equal(counts.remainingCapacity, 547);
});

test("contador visual de caca respeita limite de capacidade", () => {
  const counts = getHuntDisplayCounts({
    found: 598,
    maxTrackedEnemies: 600,
    remainingCapacity: 2,
    completedCycles: 5,
  });

  assert.equal(counts.projectedFinds, 2);
  assert.equal(counts.found, 600);
  assert.equal(counts.remainingCapacity, 0);
  assert.equal(counts.isLimitReached, true);
});

test("mantem barra de caca cheia na virada exata do ciclo repetido", () => {
  const progressPercent = getRepeatingSecondTickFillPercent({
    cycleElapsedMs: 0,
    cycleDurationMs: 15_000,
    completedCycles: 1,
  });

  assert.equal(progressPercent, 100);
});

test("calcula offset simples entre servidor e cliente", () => {
  const offset = getServerClientOffsetMs(
    "2026-06-05T12:00:05.000Z",
    Date.parse("2026-06-05T12:00:03.000Z"),
  );

  assert.equal(offset, 2_000);
});

test("gera timeline de contagem regressiva para animacao CSS", () => {
  const progress = getBattleTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:08.000Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.000Z",
      cycleDurationMs: 10_000,
    },
  });
  const timeline = getCountdownTimeline(progress);

  assert.equal(timeline?.durationSeconds, 10);
  assert.equal(timeline?.elapsedSeconds, 6);
  assert.equal(timeline?.progressPercent, 60);
  assert.equal(timeline?.remainingPercent, 40);
  assert.equal(
    timeline?.animationKey,
    `${Date.parse("2026-06-05T12:00:02.000Z")}:10000:0`,
  );
});

test("calcula progresso visual em ticks inteiros de segundo", () => {
  const progress = getBattleTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:08.900Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.000Z",
      cycleDurationMs: 10_000,
    },
  });
  const tickProgress = getSecondTickCycleProgress(progress);

  assert.equal(tickProgress?.durationSeconds, 10);
  assert.equal(tickProgress?.elapsedSeconds, 6);
  assert.equal(tickProgress?.progressPercent, 60);
  assert.equal(tickProgress?.remainingPercent, 40);
});

test("calcula atraso ate o proximo tick visual alinhado ao ciclo", () => {
  const progress = getBattleTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:05.250Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.100Z",
      cycleDurationMs: 10_000,
    },
  });

  assert.equal(getNextSecondTickDelayMs(progress), 850);
});

test("acorda no fim do ciclo quando ele chega antes do proximo segundo cheio", () => {
  const progress = getBattleTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:11.700Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.000Z",
      cycleDurationMs: 10_000,
    },
  });

  assert.equal(getNextSecondTickDelayMs(progress), 300);
});

test("arredonda duracao visual fracionada para o proximo segundo inteiro", () => {
  const progress = getBattleTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:06.000Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.000Z",
      cycleDurationMs: 4_700,
    },
  });
  const tickProgress = getSecondTickCycleProgress(progress);

  assert.equal(tickProgress?.durationSeconds, 5);
  assert.equal(tickProgress?.elapsedSeconds, 4);
  assert.equal(tickProgress?.progressPercent, 80);
  assert.equal(tickProgress?.remainingPercent, 20);
});

test("ciclos repetidos de batalha usam duracao arredondada em segundos", () => {
  const progress = getRepeatingBattleTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:07.000Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.000Z",
      cycleDurationMs: 4_700,
    },
  });

  assert.equal(progress?.cycleDurationMs, 5_000);
  assert.equal(progress?.completedCycles, 1);
  assert.equal(progress?.cycleElapsedMs, 0);
});

test("timeline de contagem regressiva fica no fim sem voltar para zero", () => {
  const progress = getBattleTimelineProgress({
    nowMs: Date.parse("2026-06-05T12:00:20.000Z"),
    source: {
      cycleStartedAt: "2026-06-05T12:00:02.000Z",
      cycleDurationMs: 10_000,
    },
  });
  const timeline = getCountdownTimeline(progress);

  assert.equal(timeline?.elapsedSeconds, 10);
  assert.equal(timeline?.remainingPercent, 0);
});
