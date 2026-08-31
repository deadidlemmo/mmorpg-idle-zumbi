import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EconomyDirection,
  EconomyResourceType,
  ItemSlot,
  Prisma,
} from '@prisma/client';
import {
  ECONOMY_LAUNCH_TIERS,
  EQUIPMENT_REINFORCEMENT_CONFIG,
  EQUIPMENT_REINFORCEMENT_MAX_LEVEL,
  getEquipmentReinforcementCost,
  isEconomyLaunchTier,
} from '../../common/config/economy.config';
import {
  calculateFullStats,
  calculateGatheringPrimaryBonus,
} from '../../common/utils/stats.util';
import { tryConsumeInventoryStack } from '../../common/inventory/inventory-stack.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { ReinforceEquipmentDto } from './dto/reinforce-equipment.dto';

const REINFORCEMENT_SLOTS = [
  ItemSlot.MAIN_HAND,
  ItemSlot.OFF_HAND,
  ItemSlot.HEAD,
  ItemSlot.ARMOR,
  ItemSlot.PANTS,
  ItemSlot.BOOTS,
] as const;

type ReinforcementSlot = (typeof REINFORCEMENT_SLOTS)[number];

const EQUIPMENT_INCLUDE = {
  mainHand: true,
  offHand: true,
  head: true,
  armor: true,
  pants: true,
  boots: true,
} satisfies Prisma.EquipmentInclude;

const REINFORCEMENT_ITEM_SELECT = {
  id: true,
  name: true,
  description: true,
  tier: true,
  rarity: true,
  slot: true,
  family: true,
  baseItemId: true,
  enhancementLevel: true,
  strengthBonus: true,
  vitalityBonus: true,
  agilityBonus: true,
  precisionBonus: true,
  techniqueBonus: true,
  willpowerBonus: true,
} satisfies Prisma.ItemSelect;

@Injectable()
export class EquipmentReinforcementService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, userId, deletedAt: null },
      select: {
        id: true,
        gold: true,
        equipment: { include: EQUIPMENT_INCLUDE },
        inventoryItems: {
          where: {
            item: {
              family: 'Material de Reforço',
              tier: { in: Array.from(ECONOMY_LAUNCH_TIERS) },
            },
          },
          select: {
            quantity: true,
            item: {
              select: {
                id: true,
                name: true,
                tier: true,
              },
            },
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const equippedEntries = this.getEquippedEntries(character.equipment);
    const baseItemIds = Array.from(
      new Set(
        equippedEntries
          .map((entry) => entry.item?.baseItemId ?? entry.item?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const variants = baseItemIds.length
      ? await this.prisma.item.findMany({
          where: {
            baseItemId: { in: baseItemIds },
            enhancementLevel: {
              gte: 1,
              lte: EQUIPMENT_REINFORCEMENT_MAX_LEVEL,
            },
          },
          select: REINFORCEMENT_ITEM_SELECT,
        })
      : [];
    const variantByKey = new Map(
      variants.map((item) => [
        `${item.baseItemId}:${item.enhancementLevel}`,
        item,
      ]),
    );
    const materialByTier = new Map(
      character.inventoryItems.map((entry) => [entry.item.tier, entry]),
    );

    return {
      maxLevel: EQUIPMENT_REINFORCEMENT_MAX_LEVEL,
      gold: character.gold,
      materials: ECONOMY_LAUNCH_TIERS.map((tier) => {
        const entry = materialByTier.get(tier);
        return {
          tier,
          itemId: entry?.item.id ?? null,
          name:
            entry?.item.name ??
            EQUIPMENT_REINFORCEMENT_CONFIG[tier].materialName,
          quantity: entry?.quantity ?? 0,
        };
      }),
      slots: equippedEntries.map(({ slot, item }) => {
        if (!item) return { slot, item: null, nextItem: null, cost: null };

        const currentLevel = Math.max(0, item.enhancementLevel ?? 0);
        const nextLevel = currentLevel + 1;
        const baseItemId = item.baseItemId ?? item.id;
        const nextItem =
          nextLevel <= EQUIPMENT_REINFORCEMENT_MAX_LEVEL
            ? (variantByKey.get(`${baseItemId}:${nextLevel}`) ?? null)
            : null;
        const cost = getEquipmentReinforcementCost(item.tier, nextLevel);
        const materialName = isEconomyLaunchTier(item.tier)
          ? EQUIPMENT_REINFORCEMENT_CONFIG[item.tier].materialName
          : null;
        const materialBalance = materialByTier.get(item.tier)?.quantity ?? 0;
        const canReinforce = Boolean(
          nextItem &&
          cost &&
          materialBalance >= cost.fragmentCost &&
          character.gold >= cost.goldCost,
        );

        return {
          slot,
          item: this.formatItem(item),
          nextItem: nextItem ? this.formatItem(nextItem) : null,
          cost:
            cost && materialName
              ? {
                  ...cost,
                  materialName,
                  materialBalance,
                  goldBalance: character.gold,
                }
              : null,
          canReinforce,
          reason: this.getUnavailableReason({
            item,
            nextItem,
            cost,
            materialBalance,
            gold: character.gold,
          }),
        };
      }),
    };
  }

  async reinforce(userId: string, dto: ReinforceEquipmentDto) {
    const slot = dto.slot;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const locked = await tx.character.updateMany({
              where: { id: dto.characterId, userId, deletedAt: null },
              data: { updatedAt: new Date() },
            });
            if (locked.count !== 1) {
              throw new NotFoundException('Personagem não encontrado.');
            }
            const character = await tx.character.findUnique({
              where: { id: dto.characterId },
              include: {
                class: true,
                gatheringSkills: true,
                equipment: { include: EQUIPMENT_INCLUDE },
              },
            });

            if (!character) {
              throw new NotFoundException('Personagem não encontrado.');
            }

            const idempotencyPrefix = `equipment-reinforcement:${character.id}:${dto.requestId}`;
            const existing = await tx.economyLedgerEntry.findUnique({
              where: { idempotencyKey: `${idempotencyPrefix}:output` },
              include: { item: true },
            });
            if (existing) {
              this.assertSameRequest(existing.metadata, slot);
              return {
                applied: false,
                message: 'Este reforço já havia sido concluído.',
                reinforcedItem: existing.item
                  ? this.formatItem(existing.item)
                  : null,
              };
            }

            if (!character.equipment) {
              throw new BadRequestException(
                'Nenhum equipamento foi encontrado neste personagem.',
              );
            }

            const currentItem = this.getItemBySlot(character.equipment, slot);
            if (!currentItem) {
              throw new BadRequestException(
                'Não existe um item equipado neste slot.',
              );
            }
            if (!isEconomyLaunchTier(currentItem.tier)) {
              throw new BadRequestException(
                'O reforço está disponível apenas para equipamentos T1 a T5.',
              );
            }

            const currentLevel = Math.max(0, currentItem.enhancementLevel ?? 0);
            const nextLevel = currentLevel + 1;
            if (nextLevel > EQUIPMENT_REINFORCEMENT_MAX_LEVEL) {
              throw new BadRequestException('Este equipamento já está no +3.');
            }

            const cost = getEquipmentReinforcementCost(
              currentItem.tier,
              nextLevel,
            );
            if (!cost) {
              throw new BadRequestException(
                'Configuração de reforço não encontrada.',
              );
            }

            const baseItemId = currentItem.baseItemId ?? currentItem.id;
            const nextItem = await tx.item.findFirst({
              where: { baseItemId, enhancementLevel: nextLevel },
            });
            if (!nextItem) {
              throw new BadRequestException(
                'A variante reforçada ainda não foi registrada. Execute o seed canônico.',
              );
            }

            const reinforcementMaterial = await tx.item.findFirst({
              where: {
                name: EQUIPMENT_REINFORCEMENT_CONFIG[currentItem.tier]
                  .materialName,
                family: 'Material de Reforço',
                tier: currentItem.tier,
              },
            });
            if (!reinforcementMaterial) {
              throw new BadRequestException(
                'O material de reforço deste tier não está registrado.',
              );
            }

            const materialBalance = await tryConsumeInventoryStack(tx, {
              characterId: character.id,
              itemId: reinforcementMaterial.id,
              quantity: cost.fragmentCost,
            });
            if (materialBalance === null) {
              throw new BadRequestException(
                `São necessários ${cost.fragmentCost}x ${reinforcementMaterial.name}.`,
              );
            }

            const goldDebit = await tx.character.updateMany({
              where: { id: character.id, gold: { gte: cost.goldCost } },
              data: { gold: { decrement: cost.goldCost } },
            });
            if (goldDebit.count !== 1) {
              throw new BadRequestException(
                `São necessários ${cost.goldCost} Gold para este reforço.`,
              );
            }

            const oldEquipmentItems = this.getEquipmentItems(
              character.equipment,
            );
            const gatheringBonus = calculateGatheringPrimaryBonus(
              character.gatheringSkills,
            );
            const oldStats = calculateFullStats(
              character.class,
              oldEquipmentItems,
              character.level,
              gatheringBonus,
            );
            const oldMaxHp = oldStats.derivedCombatStats.maxHp;
            const oldCurrentHp = this.clampHp(
              character.currentHp ?? oldMaxHp,
              oldMaxHp,
            );
            const updatedEquipment = await tx.equipment.update({
              where: { characterId: character.id },
              data: this.getSlotUpdateData(slot, nextItem.id),
              include: EQUIPMENT_INCLUDE,
            });
            const newStats = calculateFullStats(
              character.class,
              this.getEquipmentItems(updatedEquipment),
              character.level,
              gatheringBonus,
            );
            const newMaxHp = newStats.derivedCombatStats.maxHp;
            const newCurrentHp = this.calculateCurrentHpAfterChange({
              oldCurrentHp,
              oldMaxHp,
              newMaxHp,
            });
            const updatedCharacter = await tx.character.update({
              where: { id: character.id },
              data: { maxHp: newMaxHp, currentHp: newCurrentHp },
              select: { gold: true },
            });

            const commonMetadata = {
              requestId: dto.requestId,
              slot,
              fromItemId: currentItem.id,
              toItemId: nextItem.id,
              enhancementLevel: nextLevel,
            };
            await recordEconomyEntry(tx, {
              characterId: character.id,
              direction: EconomyDirection.DEBIT,
              resourceType: EconomyResourceType.ITEM,
              itemId: currentItem.id,
              tier: currentItem.tier,
              quantity: 1,
              reason: ECONOMY_REASONS.EQUIPMENT_REINFORCEMENT_SOURCE,
              idempotencyKey: `${idempotencyPrefix}:source`,
              referenceType: 'EquipmentReinforcement',
              referenceId: nextItem.id,
              metadata: commonMetadata,
            });
            await recordEconomyEntry(tx, {
              characterId: character.id,
              direction: EconomyDirection.DEBIT,
              resourceType: EconomyResourceType.ITEM,
              itemId: reinforcementMaterial.id,
              tier: currentItem.tier,
              quantity: cost.fragmentCost,
              reason: ECONOMY_REASONS.EQUIPMENT_REINFORCEMENT_MATERIAL,
              idempotencyKey: `${idempotencyPrefix}:material`,
              referenceType: 'EquipmentReinforcement',
              referenceId: nextItem.id,
              metadata: commonMetadata,
            });
            await recordEconomyEntry(tx, {
              characterId: character.id,
              direction: EconomyDirection.DEBIT,
              resourceType: EconomyResourceType.GOLD,
              tier: currentItem.tier,
              quantity: cost.goldCost,
              balanceAfter: updatedCharacter.gold,
              reason: ECONOMY_REASONS.EQUIPMENT_REINFORCEMENT_GOLD,
              idempotencyKey: `${idempotencyPrefix}:gold`,
              referenceType: 'EquipmentReinforcement',
              referenceId: nextItem.id,
              metadata: commonMetadata,
            });
            await recordEconomyEntry(tx, {
              characterId: character.id,
              direction: EconomyDirection.CREDIT,
              resourceType: EconomyResourceType.ITEM,
              itemId: nextItem.id,
              tier: currentItem.tier,
              quantity: 1,
              reason: ECONOMY_REASONS.EQUIPMENT_REINFORCEMENT_OUTPUT,
              idempotencyKey: `${idempotencyPrefix}:output`,
              referenceType: 'EquipmentReinforcement',
              referenceId: nextItem.id,
              metadata: commonMetadata,
            });

            return {
              applied: true,
              message: `${nextItem.name} reforçado com sucesso.`,
              reinforcedItem: this.formatItem(nextItem),
              gold: updatedCharacter.gold,
              equipment: updatedEquipment,
              stats: newStats,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          (this.isTransactionConflict(error) ||
            this.isUniqueConstraintError(error)) &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException(
      'O reforço encontrou concorrência. Tente novamente.',
    );
  }

  private getEquippedEntries(
    equipment:
      | (Prisma.EquipmentGetPayload<{ include: typeof EQUIPMENT_INCLUDE }> &
          object)
      | null,
  ) {
    return REINFORCEMENT_SLOTS.map((slot) => ({
      slot,
      item: equipment ? this.getItemBySlot(equipment, slot) : null,
    }));
  }

  private getEquipmentItems(
    equipment: Prisma.EquipmentGetPayload<{
      include: typeof EQUIPMENT_INCLUDE;
    }>,
  ) {
    return [
      equipment.mainHand,
      equipment.offHand,
      equipment.head,
      equipment.armor,
      equipment.pants,
      equipment.boots,
    ];
  }

  private getItemBySlot(
    equipment: Prisma.EquipmentGetPayload<{
      include: typeof EQUIPMENT_INCLUDE;
    }>,
    slot: ReinforcementSlot,
  ) {
    const itemBySlot = {
      MAIN_HAND: equipment.mainHand,
      OFF_HAND: equipment.offHand,
      HEAD: equipment.head,
      ARMOR: equipment.armor,
      PANTS: equipment.pants,
      BOOTS: equipment.boots,
    } as const;
    return itemBySlot[slot];
  }

  private getSlotUpdateData(slot: ReinforcementSlot, itemId: string) {
    const fieldBySlot = {
      MAIN_HAND: 'mainHandId',
      OFF_HAND: 'offHandId',
      HEAD: 'headId',
      ARMOR: 'armorId',
      PANTS: 'pantsId',
      BOOTS: 'bootsId',
    } as const;
    return { [fieldBySlot[slot]]: itemId };
  }

  private formatItem(item: {
    id: string;
    name: string;
    description?: string | null;
    tier: number;
    rarity: unknown;
    slot: ItemSlot;
    family: string;
    baseItemId?: string | null;
    enhancementLevel?: number | null;
    strengthBonus: number;
    vitalityBonus: number;
    agilityBonus: number;
    precisionBonus: number;
    techniqueBonus: number;
    willpowerBonus: number;
  }) {
    return {
      ...item,
      rarity: String(item.rarity),
      baseItemId: item.baseItemId ?? null,
      enhancementLevel: item.enhancementLevel ?? 0,
    };
  }

  private getUnavailableReason(params: {
    item: { tier: number; enhancementLevel: number };
    nextItem: unknown;
    cost: { fragmentCost: number; goldCost: number } | null;
    materialBalance: number;
    gold: number;
  }) {
    if (params.item.enhancementLevel >= EQUIPMENT_REINFORCEMENT_MAX_LEVEL) {
      return 'Reforço máximo alcançado.';
    }
    if (!isEconomyLaunchTier(params.item.tier)) {
      return 'Disponível somente para equipamentos T1 a T5.';
    }
    if (!params.nextItem || !params.cost) {
      return 'Variante reforçada indisponível.';
    }
    if (params.materialBalance < params.cost.fragmentCost) {
      return 'Fragmentos de reforço insuficientes.';
    }
    if (params.gold < params.cost.goldCost) return 'Gold insuficiente.';
    return null;
  }

  private assertSameRequest(metadata: Prisma.JsonValue | null, slot: string) {
    const storedSlot =
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof metadata.slot === 'string'
        ? metadata.slot
        : null;
    if (storedSlot !== slot) {
      throw new ConflictException(
        'Esta identificação de reforço já foi usada em outro slot.',
      );
    }
  }

  private clampHp(value: number, maxHp: number) {
    return Math.max(0, Math.min(Math.round(value), Math.max(1, maxHp)));
  }

  private calculateCurrentHpAfterChange(params: {
    oldCurrentHp: number;
    oldMaxHp: number;
    newMaxHp: number;
  }) {
    if (params.oldCurrentHp <= 0) return 0;
    return this.clampHp(
      params.oldCurrentHp + Math.max(0, params.newMaxHp - params.oldMaxHp),
      params.newMaxHp,
    );
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isTransactionConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
