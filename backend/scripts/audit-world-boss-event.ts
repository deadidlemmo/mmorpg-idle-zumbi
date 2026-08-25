import 'dotenv/config';
import {
  PrismaClient,
  WorldBossEventStatus,
  type UserRole,
} from '@prisma/client';

const TERMINAL_STATUSES = new Set<WorldBossEventStatus>([
  WorldBossEventStatus.DEFEATED,
  WorldBossEventStatus.EXPIRED,
  WorldBossEventStatus.REWARDED,
]);

function readArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);
}

function readTier() {
  const raw = readArgument('tier');
  if (!raw) return 1;
  const tier = Number(raw);
  if (!Number.isInteger(tier) || tier <= 0) {
    throw new Error('O argumento --tier deve ser um inteiro positivo.');
  }
  return tier;
}

function describeDatabase(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error('DATABASE_URL nao configurada.');
  const parsed = new URL(databaseUrl);
  return {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
    ssl: parsed.searchParams.get('sslmode') ?? 'nao informado',
  };
}

function isLikelyTestAccount(email: string) {
  return /fixture|@local\.test|(^|[._-])teste?([._@-]|$)/i.test(email);
}

function outcomeFor(status: WorldBossEventStatus) {
  if (status === WorldBossEventStatus.DEFEATED) return 'DEFEATED';
  if (status === WorldBossEventStatus.EXPIRED) return 'EXPIRED';
  if (status === WorldBossEventStatus.REWARDED) return 'REWARDED';
  return 'PENDING';
}

function printParticipantTable(
  participants: Array<{
    character: string;
    level: number;
    role: UserRole;
    accountKind: string;
    active: boolean;
    damage: number;
    activeSeconds: number;
    eligibleForReward: boolean;
  }>,
) {
  console.table(
    participants.map((participant) => ({
      Personagem: participant.character,
      Nivel: participant.level,
      Papel: participant.role,
      Conta: participant.accountKind,
      Ativo: participant.active ? 'sim' : 'nao',
      Dano: participant.damage,
      'Tempo ativo': participant.activeSeconds,
      Elegivel: participant.eligibleForReward ? 'sim' : 'nao',
    })),
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const eventId = readArgument('event-id');
    const tier = readTier();
    const include = {
      worldBoss: {
        select: {
          name: true,
          slug: true,
          sortOrder: true,
          minLevel: true,
          maxLevel: true,
        },
      },
      participants: {
        orderBy: { joinedAt: 'asc' as const },
        include: {
          character: {
            select: {
              name: true,
              level: true,
              user: { select: { email: true, role: true } },
            },
          },
        },
      },
    };
    const event = eventId
      ? await prisma.worldBossEvent.findUnique({
          where: { id: eventId },
          include,
        })
      : await prisma.worldBossEvent.findFirst({
          where: { tier },
          orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
          include,
        });

    if (!event) {
      throw new Error(
        eventId
          ? `A Ameaca Global ${eventId} nao foi encontrada.`
          : `Nenhuma Ameaca Global T${tier} foi encontrada.`,
      );
    }

    const participants = event.participants.map((participant) => ({
      character: participant.character.name,
      level: participant.character.level,
      role: participant.character.user.role,
      accountKind: isLikelyTestAccount(participant.character.user.email)
        ? 'provavel teste'
        : 'jogador',
      active: participant.leftAt === null,
      damage: participant.damageDealt,
      activeSeconds: participant.activeSeconds,
      eligibleForReward: participant.eligibleForReward,
    }));
    const activeParticipants = participants.filter(
      (participant) => participant.active,
    ).length;
    const participantDamage = participants.reduce(
      (total, participant) => total + participant.damage,
      0,
    );
    const activated =
      event.hpLockedAt !== null ||
      event.totalDamage > 0 ||
      event.currentHp < event.maxHp ||
      event.defeatedAt !== null ||
      event.status === WorldBossEventStatus.DEFEATED;
    const defeated =
      event.status === WorldBossEventStatus.DEFEATED ||
      event.defeatedAt !== null ||
      event.currentHp === 0;
    const terminal = TERMINAL_STATUSES.has(event.status);
    const checks = {
      participantCountMatches: event.participantCount === activeParticipants,
      participantDamageMatches: event.totalDamage === participantDamage,
      activationLockMatches: !activated || event.hpLockedAt !== null,
      defeatMatches:
        !defeated || (event.currentHp === 0 && event.defeatedAt !== null),
      terminal,
    };
    const inconsistencies = Object.entries(checks)
      .filter(([name, valid]) => name !== 'terminal' && !valid)
      .map(([name]) => name);
    const report = {
      database: describeDatabase(process.env.DATABASE_URL),
      event: {
        id: event.id,
        boss: event.worldBoss.name,
        slug: event.worldBoss.slug,
        slotIndex: event.worldBoss.sortOrder % 10,
        tier: event.tier,
        status: event.status,
        outcome: outcomeFor(event.status),
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        hpLockedAt: event.hpLockedAt?.toISOString() ?? null,
        defeatedAt: event.defeatedAt?.toISOString() ?? null,
        currentHp: event.currentHp,
        maxHp: event.maxHp,
        totalDamage: event.totalDamage,
        participantDamage,
        participantCount: event.participantCount,
        activeParticipants,
        participantRecords: event.participants.length,
        activated,
      },
      participants,
      checks,
      inconsistencies,
      calibrationReady: terminal && inconsistencies.length === 0,
    };

    if (process.argv.includes('--json')) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }

    console.log(
      `Banco: ${report.database.host}:${report.database.port}/${report.database.database} (${report.database.protocol}; ssl=${report.database.ssl})`,
    );
    console.log(
      `Evento: ${report.event.boss} (${report.event.id}) - ${report.event.status}`,
    );
    console.log(`Janela: ${report.event.startsAt} ate ${report.event.endsAt}`);
    console.log(
      `HP: ${report.event.currentHp}/${report.event.maxHp}; dano=${report.event.totalDamage}; hpLockedAt=${report.event.hpLockedAt ?? 'nao registrado'}; defeatedAt=${report.event.defeatedAt ?? 'nao registrado'}`,
    );
    console.log(
      `Participantes: ${report.event.activeParticipants} ativos / ${report.event.participantRecords} registros.`,
    );
    printParticipantTable(participants);
    console.table(checks);
    if (!terminal) {
      console.log(
        'Evento ainda nao terminal: repetir a auditoria apos o encerramento.',
      );
    } else if (inconsistencies.length === 0) {
      console.log('Evento terminal consistente e pronto para a calibracao.');
    } else {
      console.warn(
        `Evento terminal com inconsistencias: ${inconsistencies.join(', ')}.`,
      );
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Falha ao auditar Ameaca Global: ' + message);
  process.exitCode = 1;
});
