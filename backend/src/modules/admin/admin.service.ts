import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityStatus,
  EconomyCurrency,
  EconomyDirection,
  EconomyResourceType,
  ItemSlot,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PRODUCT_EVENT_ACTIONS } from '../../common/audit/product-events.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { ObservabilityService } from '../../common/observability/observability.service';
import {
  ECONOMY_REASONS,
  getEconomyReasonLabel,
} from '../economy/economy.constants';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { UpdateUserSuspensionDto } from './dto/update-user-suspension.dto';

const PRODUCT_USER_WHERE = {
  isSuspended: false,
  NOT: [
    { email: { endsWith: '@local.test', mode: 'insensitive' } },
    { email: { endsWith: '@dead-idle.test', mode: 'insensitive' } },
  ],
} satisfies Prisma.UserWhereInput;

const EQUIPMENT_SLOTS = new Set<ItemSlot>([
  ItemSlot.MAIN_HAND,
  ItemSlot.OFF_HAND,
  ItemSlot.HEAD,
  ItemSlot.ARMOR,
  ItemSlot.PANTS,
  ItemSlot.BOOTS,
]);

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

function roundPercent(value: number) {
  return Number(value.toFixed(1));
}

function calculatePercent(value: number, total: number) {
  return total > 0 ? roundPercent((value / total) * 100) : 0;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return Math.round(sorted[index]);
}

function keepEarliest(
  target: Map<string, Date>,
  key: string,
  occurredAt: Date,
) {
  const existing = target.get(key);
  if (!existing || occurredAt < existing) target.set(key, occurredAt);
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  getOperations() {
    return this.observabilityService.getOperationalSnapshot();
  }

  async startAutoCombatCapture(actorUserId: string) {
    const capture = this.observabilityService.startAutoCombatCapture();

    await this.auditService.record({
      actorUserId,
      action: 'ADMIN_AUTO_COMBAT_CAPTURE_STARTED',
      entityType: 'OperationalCapture',
      entityId: capture.id,
      metadata: {
        startedAt: capture.startedAt,
        source: capture.source,
      },
    });

    return { capture };
  }

  async getSummary() {
    const [
      users,
      suspendedUsers,
      characters,
      activeAutoCombats,
      activeGathering,
      activeCrafting,
      activeIncursions,
      activeWorldBossParticipants,
      recentAuditLogs,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isSuspended: true } }),
      this.prisma.character.count({ where: { deletedAt: null } }),
      this.prisma.autoCombatSession.count({ where: { status: 'ACTIVE' } }),
      this.prisma.gatheringSession.count({ where: { status: 'ACTIVE' } }),
      this.prisma.craftingSession.count({ where: { status: 'ACTIVE' } }),
      this.prisma.characterIncursionSession.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.worldBossParticipant.count({ where: { leftAt: null } }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { actor: { select: { id: true, email: true, role: true } } },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      counts: {
        users,
        suspendedUsers,
        characters,
        activeAutoCombats,
        activeGathering,
        activeCrafting,
        activeIncursions,
        activeWorldBossParticipants,
      },
      recentAuditLogs,
    };
  }

  async getProductMetrics(days = 30) {
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * ONE_DAY_MS);
    const users = await this.prisma.user.findMany({
      where: {
        ...PRODUCT_USER_WHERE,
        createdAt: { gte: periodStart, lte: now },
      },
      select: {
        id: true,
        createdAt: true,
        characters: {
          where: { deletedAt: null },
          select: {
            id: true,
            createdAt: true,
            equipment: {
              select: {
                updatedAt: true,
                mainHand: { select: { tier: true } },
                offHand: { select: { tier: true } },
                head: { select: { tier: true } },
                armor: { select: { tier: true } },
                pants: { select: { tier: true } },
                boots: { select: { tier: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const userIds = users.map((user) => user.id);
    const characterIds = users.flatMap((user) =>
      user.characters.map((character) => character.id),
    );
    const trackedActions = [
      PRODUCT_EVENT_ACTIONS.FIRST_RESOURCE_COLLECTED,
      PRODUCT_EVENT_ACTIONS.FIRST_T1_CRAFTED,
      PRODUCT_EVENT_ACTIONS.FIRST_T1_EQUIPPED,
      PRODUCT_EVENT_ACTIONS.FIRST_T1_SET_COMPLETED,
      'AUTH_LOGIN',
    ];

    const [
      trackedEvents,
      gatheringMilestones,
      craftingMilestones,
      gatheringFlow,
      craftingFlow,
      inventoryStock,
      bankStock,
      trackingStart,
      ledgerFlow,
      ledgerReasons,
      walletBalances,
      ledgerTrackingStart,
      activePetIncubations,
      collectedPets,
    ] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          actorUserId: { in: userIds },
          action: { in: trackedActions },
        },
        select: {
          actorUserId: true,
          action: true,
          entityId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.gatheringSession.findMany({
        where: {
          characterId: { in: characterIds },
          collectedQuantity: { gt: 0 },
        },
        select: {
          character: { select: { userId: true } },
          updatedAt: true,
        },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.craftingSession.findMany({
        where: {
          characterId: { in: characterIds },
          status: ActivityStatus.COMPLETED,
          completedAt: { not: null },
          outputItem: {
            tier: 1,
            slot: { in: Array.from(EQUIPMENT_SLOTS) },
          },
        },
        select: {
          character: { select: { userId: true } },
          completedAt: true,
        },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.gatheringSession.findMany({
        where: {
          updatedAt: { gte: periodStart, lte: now },
          collectedQuantity: { gt: 0 },
          targetMaterial: { tier: { gte: 1, lte: 5 } },
          character: { user: PRODUCT_USER_WHERE },
        },
        select: {
          collectedQuantity: true,
          targetMaterial: { select: { tier: true } },
        },
      }),
      this.prisma.craftingSession.findMany({
        where: {
          status: ActivityStatus.COMPLETED,
          completedAt: { gte: periodStart, lte: now },
          outputItem: { tier: { gte: 1, lte: 5 } },
          character: { user: PRODUCT_USER_WHERE },
        },
        select: {
          quantity: true,
          outputQuantity: true,
          outputItem: { select: { tier: true } },
          recipe: {
            select: {
              ingredients: {
                select: {
                  quantity: true,
                  item: { select: { tier: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          quantity: { gt: 0 },
          item: {
            isGatheringMaterial: true,
            tier: { gte: 1, lte: 5 },
          },
          character: { user: PRODUCT_USER_WHERE },
        },
        select: { quantity: true, item: { select: { tier: true } } },
      }),
      this.prisma.bankItem.findMany({
        where: {
          quantity: { gt: 0 },
          item: {
            isGatheringMaterial: true,
            tier: { gte: 1, lte: 5 },
          },
          character: { user: PRODUCT_USER_WHERE },
        },
        select: { quantity: true, item: { select: { tier: true } } },
      }),
      this.prisma.auditLog.findFirst({
        where: {
          action: { startsWith: 'PRODUCT_' },
          actor: PRODUCT_USER_WHERE,
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.economyLedgerEntry.groupBy({
        by: ['direction', 'resourceType', 'currency', 'tier'],
        where: {
          createdAt: { gte: periodStart, lte: now },
          character: { user: PRODUCT_USER_WHERE },
        },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      this.prisma.economyLedgerEntry.groupBy({
        by: ['reason', 'direction', 'resourceType'],
        where: {
          createdAt: { gte: periodStart, lte: now },
          character: { user: PRODUCT_USER_WHERE },
        },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      this.prisma.characterEconomyBalance.groupBy({
        by: ['currency', 'tier'],
        where: {
          tier: { gte: 1, lte: 5 },
          character: { user: PRODUCT_USER_WHERE },
        },
        _sum: { balance: true },
      }),
      this.prisma.economyLedgerEntry.findFirst({
        where: { character: { user: PRODUCT_USER_WHERE } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.characterPet.count({
        where: {
          status: 'INCUBATING',
          character: { user: PRODUCT_USER_WHERE },
        },
      }),
      this.prisma.characterPet.count({
        where: {
          status: 'AVAILABLE',
          character: { user: PRODUCT_USER_WHERE },
        },
      }),
    ]);

    const firstCharacterByUser = new Map<string, Date>();
    const characterCreatedAt = new Map<string, Date>();
    const firstResourceByUser = new Map<string, Date>();
    const firstT1CraftByUser = new Map<string, Date>();
    const firstT1EquipByUser = new Map<string, Date>();
    const firstT1EquipByCharacter = new Map<string, Date>();
    const firstT1SetByUser = new Map<string, Date>();
    const loginsByUser = new Map<string, Date[]>();
    let exactEquipmentSamples = 0;

    for (const user of users) {
      for (const character of user.characters) {
        characterCreatedAt.set(character.id, character.createdAt);
        keepEarliest(firstCharacterByUser, user.id, character.createdAt);

        const equippedItems = character.equipment
          ? [
              character.equipment.mainHand,
              character.equipment.offHand,
              character.equipment.head,
              character.equipment.armor,
              character.equipment.pants,
              character.equipment.boots,
            ]
          : [];
        const tierOneOrHigher = equippedItems.filter(
          (item) => (item?.tier ?? 0) >= 1,
        ).length;

        if (character.equipment && tierOneOrHigher > 0) {
          keepEarliest(
            firstT1EquipByUser,
            user.id,
            character.equipment.updatedAt,
          );
          keepEarliest(
            firstT1EquipByCharacter,
            character.id,
            character.equipment.updatedAt,
          );
        }
        if (character.equipment && tierOneOrHigher === 6) {
          keepEarliest(
            firstT1SetByUser,
            user.id,
            character.equipment.updatedAt,
          );
        }
      }
    }

    for (const milestone of gatheringMilestones) {
      keepEarliest(
        firstResourceByUser,
        milestone.character.userId,
        milestone.updatedAt,
      );
    }
    for (const milestone of craftingMilestones) {
      if (milestone.completedAt) {
        keepEarliest(
          firstT1CraftByUser,
          milestone.character.userId,
          milestone.completedAt,
        );
      }
    }
    for (const event of trackedEvents) {
      if (!event.actorUserId) continue;

      if (event.action === 'AUTH_LOGIN') {
        const logins = loginsByUser.get(event.actorUserId) ?? [];
        logins.push(event.createdAt);
        loginsByUser.set(event.actorUserId, logins);
      } else if (
        event.action === PRODUCT_EVENT_ACTIONS.FIRST_RESOURCE_COLLECTED
      ) {
        keepEarliest(firstResourceByUser, event.actorUserId, event.createdAt);
      } else if (event.action === PRODUCT_EVENT_ACTIONS.FIRST_T1_CRAFTED) {
        keepEarliest(firstT1CraftByUser, event.actorUserId, event.createdAt);
      } else if (event.action === PRODUCT_EVENT_ACTIONS.FIRST_T1_EQUIPPED) {
        exactEquipmentSamples += 1;
        keepEarliest(firstT1EquipByUser, event.actorUserId, event.createdAt);
        if (event.entityId) {
          keepEarliest(
            firstT1EquipByCharacter,
            event.entityId,
            event.createdAt,
          );
        }
      } else if (
        event.action === PRODUCT_EVENT_ACTIONS.FIRST_T1_SET_COMPLETED
      ) {
        keepEarliest(firstT1SetByUser, event.actorUserId, event.createdAt);
      }
    }

    const firstHourDeadline = (userCreatedAt: Date) =>
      new Date(userCreatedAt.getTime() + ONE_HOUR_MS);
    const reachedWithinFirstHour = (
      occurredAt: Date | undefined,
      userCreatedAt: Date,
    ) =>
      Boolean(
        occurredAt &&
        occurredAt >= userCreatedAt &&
        occurredAt <= firstHourDeadline(userCreatedAt),
      );
    const funnelDefinitions = [
      {
        key: 'REGISTERED',
        label: 'Cadastro concluído',
        count: users.length,
      },
      {
        key: 'CHARACTER_CREATED',
        label: 'Personagem criado',
        count: users.filter((user) =>
          reachedWithinFirstHour(
            firstCharacterByUser.get(user.id),
            user.createdAt,
          ),
        ).length,
      },
      {
        key: 'FIRST_RESOURCE',
        label: 'Primeiro recurso coletado',
        count: users.filter((user) =>
          reachedWithinFirstHour(
            firstResourceByUser.get(user.id),
            user.createdAt,
          ),
        ).length,
      },
      {
        key: 'FIRST_T1_CRAFTED',
        label: 'Primeiro equipamento T1 criado',
        count: users.filter((user) =>
          reachedWithinFirstHour(
            firstT1CraftByUser.get(user.id),
            user.createdAt,
          ),
        ).length,
      },
      {
        key: 'FIRST_T1_EQUIPPED',
        label: 'Primeiro T1 equipado',
        count: users.filter((user) =>
          reachedWithinFirstHour(
            firstT1EquipByUser.get(user.id),
            user.createdAt,
          ),
        ).length,
      },
      {
        key: 'FIRST_T1_SET',
        label: 'Conjunto T1 completo',
        count: users.filter((user) =>
          reachedWithinFirstHour(firstT1SetByUser.get(user.id), user.createdAt),
        ).length,
      },
    ];
    const funnel = funnelDefinitions.map((step, index) => ({
      ...step,
      rateFromStartPercent: calculatePercent(step.count, users.length),
      rateFromPreviousPercent: calculatePercent(
        step.count,
        index === 0 ? users.length : funnelDefinitions[index - 1].count,
      ),
    }));

    const buildRetention = (startDay: number) => {
      const windowStartMs = startDay * ONE_DAY_MS;
      const windowEndMs = (startDay + 1) * ONE_DAY_MS;
      const eligibleUsers = users.filter(
        (user) => now.getTime() - user.createdAt.getTime() >= windowEndMs,
      );
      const retainedUsers = eligibleUsers.filter((user) =>
        (loginsByUser.get(user.id) ?? []).some((loginAt) => {
          const elapsedMs = loginAt.getTime() - user.createdAt.getTime();
          return elapsedMs >= windowStartMs && elapsedMs < windowEndMs;
        }),
      );

      return {
        eligibleUsers: eligibleUsers.length,
        retainedUsers: retainedUsers.length,
        retentionPercent: calculatePercent(
          retainedUsers.length,
          eligibleUsers.length,
        ),
      };
    };

    const equipmentTimesSeconds = Array.from(firstT1EquipByCharacter.entries())
      .map(([characterId, equippedAt]) => {
        const createdAt = characterCreatedAt.get(characterId);
        return createdAt
          ? Math.max(0, (equippedAt.getTime() - createdAt.getTime()) / 1000)
          : null;
      })
      .filter((value): value is number => value !== null);
    const averageEquipmentTime = equipmentTimesSeconds.length
      ? Math.round(
          equipmentTimesSeconds.reduce((total, value) => total + value, 0) /
            equipmentTimesSeconds.length,
        )
      : null;

    const economyByTier = new Map(
      Array.from({ length: 5 }, (_, index) => [
        index + 1,
        {
          tier: index + 1,
          gatheredUnits: 0,
          consumedUnits: 0,
          craftedUnits: 0,
          materialStock: 0,
          netMaterialFlow: 0,
        },
      ]),
    );
    for (const session of gatheringFlow) {
      const tier = economyByTier.get(session.targetMaterial.tier);
      if (tier) tier.gatheredUnits += session.collectedQuantity;
    }
    for (const session of craftingFlow) {
      const outputTier = economyByTier.get(session.outputItem.tier);
      if (outputTier) outputTier.craftedUnits += session.outputQuantity;

      for (const ingredient of session.recipe.ingredients) {
        const ingredientTier = economyByTier.get(ingredient.item.tier);
        if (ingredientTier) {
          ingredientTier.consumedUnits +=
            ingredient.quantity * session.quantity;
        }
      }
    }
    for (const stockItem of [...inventoryStock, ...bankStock]) {
      const tier = economyByTier.get(stockItem.item.tier);
      if (tier) tier.materialStock += stockItem.quantity;
    }
    for (const tier of economyByTier.values()) {
      tier.netMaterialFlow = tier.gatheredUnits - tier.consumedUnits;
    }

    const ledgerQuantity = (
      resourceType: EconomyResourceType,
      direction: EconomyDirection,
      options: { tier?: number; currency?: EconomyCurrency } = {},
    ) =>
      ledgerFlow
        .filter(
          (entry) =>
            entry.resourceType === resourceType &&
            entry.direction === direction &&
            (options.tier === undefined || entry.tier === options.tier) &&
            (options.currency === undefined ||
              entry.currency === options.currency),
        )
        .reduce((total, entry) => total + (entry._sum.quantity ?? 0), 0);
    const buildResourceFlow = (resourceType: EconomyResourceType) => {
      const credited = ledgerQuantity(resourceType, EconomyDirection.CREDIT);
      const debited = ledgerQuantity(resourceType, EconomyDirection.DEBIT);
      return { credited, debited, net: credited - debited };
    };
    const goldLedger = buildResourceFlow(EconomyResourceType.GOLD);
    const walletBalanceByKey = new Map(
      walletBalances.map((entry) => [
        `${entry.currency}:${entry.tier}`,
        entry._sum.balance ?? 0,
      ]),
    );
    const ledgerEntries = ledgerFlow.reduce(
      (total, entry) => total + entry._count._all,
      0,
    );
    const getReasonEntries = (reason: string) =>
      ledgerReasons
        .filter((entry) => entry.reason === reason)
        .reduce((total, entry) => total + entry._count._all, 0);
    const currencyLabels: Record<EconomyCurrency, string> = {
      [EconomyCurrency.INCURSION_TOKEN]: 'Ficha de Incursão',
      [EconomyCurrency.WORLD_BOSS_FRAGMENT]: 'Fragmento de Ameaça',
    };
    const ledger = {
      definition:
        'Movimentos exatos registrados após a migration; não inclui backfill estimado.',
      trackingStartedAt: ledgerTrackingStart?.createdAt ?? null,
      entries: ledgerEntries,
      gold: {
        ...goldLedger,
        sinkRatioPercent: calculatePercent(
          goldLedger.debited,
          goldLedger.credited,
        ),
      },
      cash: buildResourceFlow(EconomyResourceType.CASH),
      xp: buildResourceFlow(EconomyResourceType.XP),
      itemTiers: Array.from({ length: 5 }, (_, index) => {
        const tier = index + 1;
        const credited = ledgerQuantity(
          EconomyResourceType.ITEM,
          EconomyDirection.CREDIT,
          { tier },
        );
        const debited = ledgerQuantity(
          EconomyResourceType.ITEM,
          EconomyDirection.DEBIT,
          { tier },
        );
        return { tier, credited, debited, net: credited - debited };
      }),
      currencies: Object.values(EconomyCurrency).flatMap((currency) =>
        Array.from({ length: 5 }, (_, index) => {
          const tier = index + 1;
          const credited = ledgerQuantity(
            EconomyResourceType.CURRENCY,
            EconomyDirection.CREDIT,
            { tier, currency },
          );
          const debited = ledgerQuantity(
            EconomyResourceType.CURRENCY,
            EconomyDirection.DEBIT,
            { tier, currency },
          );
          return {
            currency,
            label: currencyLabels[currency],
            tier,
            credited,
            debited,
            balance: walletBalanceByKey.get(`${currency}:${tier}`) ?? 0,
          };
        }),
      ),
      topReasons: ledgerReasons
        .map((entry) => ({
          reason: entry.reason,
          label: getEconomyReasonLabel(entry.reason),
          direction: entry.direction,
          resourceType: entry.resourceType,
          quantity: entry._sum.quantity ?? 0,
          entries: entry._count._all,
        }))
        .sort((left, right) => right.quantity - left.quantity)
        .slice(0, 10),
    };

    return {
      generatedAt: now.toISOString(),
      period: {
        days,
        startedAt: periodStart.toISOString(),
        endedAt: now.toISOString(),
      },
      funnel: {
        windowHours: 1,
        cohortUsers: users.length,
        steps: funnel,
      },
      retention: {
        definition:
          'Login realizado na janela de 24 horas correspondente após o cadastro.',
        d1: buildRetention(1),
        d7: buildRetention(7),
      },
      timeToFirstEquipment: {
        definition:
          'Tempo entre a criação do personagem e o primeiro equipamento T1 vestido.',
        samples: equipmentTimesSeconds.length,
        exactTrackedSamples: exactEquipmentSamples,
        averageSeconds: averageEquipmentTime,
        p50Seconds: percentile(equipmentTimesSeconds, 0.5),
        p90Seconds: percentile(equipmentTimesSeconds, 0.9),
      },
      economy: {
        definition:
          'Sessões atualizadas ou concluídas no período; estoque é o saldo atual de materiais na mochila e no banco.',
        tiers: Array.from(economyByTier.values()),
        ledger,
        progressionOutputs: {
          reinforcementOperations: getReasonEntries(
            ECONOMY_REASONS.EQUIPMENT_REINFORCEMENT_OUTPUT,
          ),
          incubationsStarted: getReasonEntries(
            ECONOMY_REASONS.PET_INCUBATION_COCOON,
          ),
          activePetIncubations,
          collectedPets,
        },
      },
      coverage: {
        milestoneTrackingStartedAt: trackingStart?.createdAt ?? null,
        usesHistoricalFallback: true,
      },
    };
  }

  async listUsers(query: ListAdminUsersDto) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 25));
    const where = query.search
      ? {
          email: {
            contains: query.search.toLowerCase(),
            mode: 'insensitive' as const,
          },
        }
      : {};
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          role: true,
          premiumUntil: true,
          isSuspended: true,
          suspendedAt: true,
          suspensionReason: true,
          lastLoginAt: true,
          termsVersion: true,
          privacyVersion: true,
          createdAt: true,
          _count: { select: { characters: true } },
        },
      }),
    ]);

    return {
      users,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async updateSuspension(
    actorUserId: string,
    targetUserId: string,
    dto: UpdateUserSuspensionDto,
  ) {
    if (actorUserId === targetUserId) {
      throw new BadRequestException('Voce nao pode suspender a propria conta.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('Usuario nao encontrado.');

    const user = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        isSuspended: dto.suspended,
        suspendedAt: dto.suspended ? new Date() : null,
        suspensionReason: dto.suspended ? dto.reason?.trim() || null : null,
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        email: true,
        role: true,
        isSuspended: true,
        suspendedAt: true,
        suspensionReason: true,
      },
    });

    await this.auditService.record({
      actorUserId,
      action: dto.suspended ? 'ADMIN_USER_SUSPENDED' : 'ADMIN_USER_RESTORED',
      entityType: 'User',
      entityId: targetUserId,
      metadata: { reason: dto.reason?.trim() || null },
    });

    return { user };
  }

  async listAuditLogs(page = 1, pageSize = 50) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        include: { actor: { select: { id: true, email: true, role: true } } },
      }),
    ]);

    return {
      logs,
      total,
      page: safePage,
      pageSize: safePageSize,
      pageCount: Math.ceil(total / safePageSize),
    };
  }
}
