import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { T1_ECONOMY_CONFIG } from '../src/common/config/economy.config';
import {
  type ReinforcementSimulationStrategy,
  simulateT1Economy,
} from '../src/modules/economy/economy-simulator';
import { loadWorldBossSimulationCalibration } from '../src/modules/economy/world-boss-simulation-calibration.repository';
import {
  createFallbackWorldBossSimulationCalibration,
  type WorldBossCalibrationPercentageMetric,
  type WorldBossCalibrationRangeMetric,
  type WorldBossSimulationCalibration,
} from '../src/modules/economy/world-boss-simulation-calibration';

type CalibrationMode = 'DATABASE' | 'FALLBACK';

function readNumberArgument(name: string, fallback: number) {
  const prefix = '--' + name + '=';
  const argument = process.argv.find((entry) => entry.startsWith(prefix));
  if (!argument) return fallback;
  const value = Number(argument.slice(prefix.length));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('O argumento --' + name + ' deve ser um numero positivo.');
  }
  return value;
}

function readReinforcementStrategy(): ReinforcementSimulationStrategy {
  const argument = process.argv.find((entry) =>
    entry.startsWith('--strategy='),
  );
  const value = argument?.slice('--strategy='.length).toUpperCase();
  if (!value || value === 'BALANCED') return 'BALANCED';
  if (value === 'FOCUSED') return 'FOCUSED';
  throw new Error('O argumento --strategy deve ser balanced ou focused.');
}

function readCalibrationMode(): CalibrationMode {
  const prefix = '--world-boss-calibration=';
  const argument = process.argv.find((entry) => entry.startsWith(prefix));
  const value = argument?.slice(prefix.length).toUpperCase();
  if (!value || value === 'DATABASE') return 'DATABASE';
  if (value === 'FALLBACK') return 'FALLBACK';
  throw new Error(
    'O argumento --world-boss-calibration deve ser database ou fallback.',
  );
}

function formatPercentageMetric(metric: WorldBossCalibrationPercentageMetric) {
  const confidence = metric.confidenceInterval95
    ? `; IC95 ${metric.confidenceInterval95.min}-${metric.confidenceInterval95.max}%`
    : '';
  return `${metric.value}% (${metric.source}; n=${metric.sampleSize}/${metric.minimumSampleSize}${confidence})`;
}

function formatRangeMetric(metric: WorldBossCalibrationRangeMetric) {
  return `${metric.value.min}-${metric.value.max} (${metric.source}; n=${metric.sampleSize}/${metric.minimumSampleSize})`;
}

function printCalibration(calibration: WorldBossSimulationCalibration) {
  console.log(
    'Calibracao de Ameacas Globais: ' +
      calibration.mode +
      '; janela=' +
      calibration.lookbackDays +
      ' dias; validos=' +
      calibration.quality.acceptedEvents +
      '/' +
      calibration.quality.queriedEvents +
      '; rejeitados=' +
      calibration.quality.rejectedEvents +
      '.',
  );
  console.table(
    calibration.slots.map((slot) => ({
      Slot: slot.label,
      Validos: slot.validEvents,
      Vazios: slot.emptyEvents,
      Ativados: slot.activatedEvents,
      Derrotados: slot.defeatedEvents,
      'Presenca por evento': formatPercentageMetric(
        slot.activationChancePercent,
      ),
      'Derrota se ativado': formatPercentageMetric(slot.defeatChancePercent),
      'Tempo derrota (min)': formatRangeMetric(slot.defeatedDurationMinutes),
      'Progresso expirado (%)': formatRangeMetric(slot.expiredProgressPercent),
    })),
  );
  if (calibration.quality.rejectedEvents > 0) {
    console.log(
      'Eventos rejeitados por qualidade:',
      calibration.quality.rejectedByReason,
    );
  }
  if (calibration.readiness.rewardReviewReady) {
    console.log('Calibracao pronta para revisar recompensas.');
  } else {
    console.warn(
      'CALIBRACAO INCOMPLETA: nao revisar recompensas enquanto houver fallback em ' +
        calibration.readiness.fallbackMetrics.join(', ') +
        '.',
    );
  }
}

async function loadCalibration() {
  const lookbackDays = Math.floor(
    readNumberArgument(
      'lookback-days',
      T1_ECONOMY_CONFIG.simulation.worldBossCalendar.telemetryCalibration
        .lookbackDays,
    ),
  );
  if (readCalibrationMode() === 'FALLBACK') {
    return createFallbackWorldBossSimulationCalibration({ lookbackDays });
  }

  const prisma = new PrismaClient();
  try {
    return await loadWorldBossSimulationCalibration(prisma, {
      lookbackDays,
      tier: 1,
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const calibration = await loadCalibration();
  const jsonOutput = process.argv.includes('--json');
  if (process.argv.includes('--calibration-only')) {
    if (jsonOutput) {
      process.stdout.write(JSON.stringify(calibration, null, 2) + '\n');
    } else {
      printCalibration(calibration);
    }
    return;
  }

  const report = simulateT1Economy(
    {
      players: readNumberArgument('players', 1000),
      days: readNumberArgument('days', 7),
      seed: readNumberArgument('seed', 20260824),
      reinforcementStrategy: readReinforcementStrategy(),
    },
    calibration,
  );

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  console.log(
    'Simulacao T1: ' +
      report.options.players +
      ' jogadores por ' +
      report.options.days +
      ' dias; reforco=' +
      report.options.reinforcementStrategy,
  );
  printCalibration(report.worldBossCalibration);
  console.log(
    'Calendario de Ameacas Globais: ' +
      report.worldBossCalendar.scheduledEvents +
      ' agendadas, ' +
      report.worldBossCalendar.resolvedEvents +
      ' encerradas, ' +
      report.worldBossCalendar.emptyEvents +
      ' vazias, ' +
      report.worldBossCalendar.defeatedEvents +
      ' derrotadas e ' +
      report.worldBossCalendar.expiredEvents +
      ' expiradas apos ativacao.',
  );
  console.table(
    report.worldBossCalendar.slots.map((slot) => ({
      Slot: slot.label,
      'Respawn (h)': slot.respawnMinutes / 60,
      Agendadas: slot.scheduledEvents,
      Encerradas: slot.resolvedEvents,
      Vazias: slot.emptyEvents,
      Ativadas: slot.activatedEvents,
      Derrotadas: slot.defeatedEvents,
      Expiradas: slot.expiredEvents,
    })),
  );
  console.table(
    report.profiles.map((profile) => ({
      Perfil: profile.label,
      Jogadores: profile.players,
      'Primeiro item p50':
        String(profile.firstEquipmentMinutesP50 ?? '-') + ' min',
      'Conjunto p50': String(profile.fullSetHoursP50 ?? '-') + ' h',
      'Conjunto concluido': profile.fullSetCompletionPercent + '%',
      'Gold sink': profile.goldSinkRatioPercent + '%',
      'Gold gerado': profile.averageGoldEarned,
      'Gold destruido': profile.averageGoldSpent,
      'Gold final': profile.averageClosingGold,
      'Niveis aplicados': profile.averageUpgradeLevels,
      'Jogadores com reforco': profile.playersWithReinforcementPercent + '%',
      'Jogadores com +3': profile.playersWithPlus3Percent + '%',
      'Itens +1 ou mais': profile.averageEquipmentAtLeastPlus1,
      'Itens +2 ou mais': profile.averageEquipmentAtLeastPlus2,
      'Itens +3': profile.averageEquipmentAtPlus3,
      'Fragmentos reforco': profile.averageReinforcementFragments,
      'Fichas guardadas': profile.averageIncursionTokens,
      'Fichas gastas': profile.averageIncursionTokensSpent,
      'Fragmentos ameaca': profile.averageWorldBossFragments,
      'Ameacas elegiveis': profile.averageWorldBossEligibleEvents,
      'Ameacas ingressadas': profile.averageWorldBossEventsJoined,
      'Recompensas ameaca': profile.averageWorldBossRewardsClaimed,
      'Recompensas integrais': profile.averageWorldBossFullRewards,
      'Recompensas parciais': profile.averageWorldBossPartialRewards,
      'Perdidas offline': profile.averageWorldBossMissedWhileOffline,
      'Perdidas escolha/conflito':
        profile.averageWorldBossMissedByChoiceOrConflict,
      'Sem participacao minima': profile.averageWorldBossMissedParticipation,
      'Casulos sorteados': profile.averagePetCocoonsDropped,
      'Pets incubados': profile.averagePetsIncubated,
      'Pets unicos': profile.averageUniquePetsOwned,
      'Jogadores com pet': profile.playersWithAnyPetPercent + '%',
      'Colecao T1 completa': profile.playersWithCompletePetSetPercent + '%',
      'Duplicatas convertidas': profile.averageDuplicateCocoonsConverted,
      'Casulos guardados': profile.averageCocoonsHeld,
      'Incubacoes pendentes': profile.averagePendingPetIncubations,
    })),
  );
  console.log('Perfil de referencia: ' + report.targetAssessment.profile);
  console.log(
    'Metas: primeiro item=' +
      (report.targetAssessment.firstEquipmentWithinTarget ? 'OK' : 'FORA') +
      ', conjunto=' +
      (report.targetAssessment.fullSetWithinTarget ? 'OK' : 'FORA') +
      ', Gold=' +
      (report.targetAssessment.goldSinkRatioWithinTarget ? 'OK' : 'FORA'),
  );
  for (const warning of report.targetAssessment.warnings) {
    console.warn('AVISO: ' + warning);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Falha na simulacao economica: ' + message);
  process.exitCode = 1;
});
