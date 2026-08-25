import { PrismaClient, WorldBossEventStatus } from '@prisma/client';
import { T1_ECONOMY_CONFIG } from '../../common/config/economy.config';
import {
  calibrateWorldBossSimulation,
  type WorldBossSimulationCalibration,
} from './world-boss-simulation-calibration';

interface LoadWorldBossCalibrationOptions {
  asOf?: Date;
  lookbackDays?: number;
  tier?: number;
}

export async function loadWorldBossSimulationCalibration(
  prisma: PrismaClient,
  options: LoadWorldBossCalibrationOptions = {},
): Promise<WorldBossSimulationCalibration> {
  const asOf = options.asOf ?? new Date();
  const lookbackDays = Math.max(
    1,
    Math.floor(
      options.lookbackDays ??
        T1_ECONOMY_CONFIG.simulation.worldBossCalendar.telemetryCalibration
          .lookbackDays,
    ),
  );
  const periodStart = new Date(asOf.getTime() - lookbackDays * 86_400_000);
  const events = await prisma.worldBossEvent.findMany({
    where: {
      tier: options.tier ?? 1,
      startsAt: { gte: periodStart, lte: asOf },
      status: {
        in: [
          WorldBossEventStatus.DEFEATED,
          WorldBossEventStatus.EXPIRED,
          WorldBossEventStatus.REWARDED,
        ],
      },
    },
    select: {
      status: true,
      startsAt: true,
      endsAt: true,
      createdAt: true,
      maxHp: true,
      currentHp: true,
      totalDamage: true,
      participantCount: true,
      hpLockedAt: true,
      defeatedAt: true,
      worldBoss: { select: { sortOrder: true } },
      _count: { select: { participants: true } },
    },
  });

  return calibrateWorldBossSimulation(
    events.map((event) => ({
      status: event.status as 'DEFEATED' | 'EXPIRED' | 'REWARDED',
      slotIndex: event.worldBoss.sortOrder % 10,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      createdAt: event.createdAt,
      maxHp: event.maxHp,
      currentHp: event.currentHp,
      totalDamage: event.totalDamage,
      participantCount: event.participantCount,
      participantRecords: event._count.participants,
      hpLockedAt: event.hpLockedAt,
      defeatedAt: event.defeatedAt,
    })),
    { asOf, lookbackDays },
  );
}
