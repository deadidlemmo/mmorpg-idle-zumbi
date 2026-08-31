import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AutoCombatSessionStatus,
  EconomyDirection,
  EconomyResourceType,
  InventoryItemType,
  Item,
  ItemSlot,
  Prisma,
} from '@prisma/client';
import { AUTO_POTION_TRIGGER_PERCENT } from '../../common/config/potions.config';
import {
  getPotionTierAccess,
  getPotionTierLockedMessage,
  isPotionTierUnlocked,
} from '../../common/utils/potion-tier.util';
import {
  calculateFullStats,
  calculateGatheringPrimaryBonus,
} from '../../common/utils/stats.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { PREMIUM_PASS_ITEM_SLUG } from '../storefront/storefront.config';
import { UpdatePotionConfigDto } from './dto/update-potion-config.dto';
import { UseConsumableDto } from './dto/use-consumable.dto';

@Injectable()
export class ConsumablesService {
  constructor(private readonly prisma: PrismaService) {}

  async use(userId: string, useConsumableDto: UseConsumableDto) {
    const operationId = randomUUID();
    const character = await this.prisma.character.findFirst({
      where: {
        id: useConsumableDto.characterId,
        userId,
      },
      include: {
        class: true,
        equipment: {
          include: {
            mainHand: true,
            offHand: true,
            head: true,
            armor: true,
            pants: true,
            boots: true,
          },
        },
        gatheringSkills: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const inventoryItem = await this.prisma.inventoryItem.findUnique({
      where: {
        characterId_itemId: {
          characterId: character.id,
          itemId: useConsumableDto.itemId,
        },
      },
      include: {
        item: true,
      },
    });

    if (!inventoryItem) {
      throw new NotFoundException('Consumível não encontrado no inventário.');
    }

    if (inventoryItem.quantity <= 0) {
      throw new BadRequestException('Quantidade insuficiente do consumível.');
    }

    if (
      inventoryItem.type !== InventoryItemType.CONSUMABLE ||
      inventoryItem.item.slot !== ItemSlot.CONSUMABLE
    ) {
      throw new BadRequestException('Este item não é um consumível.');
    }

    const item = inventoryItem.item;

    if (item.usableOutOfCombat !== true) {
      throw new BadRequestException(
        'Este consumível não pode ser usado fora de combate.',
      );
    }

    if (item.slug === PREMIUM_PASS_ITEM_SLUG) {
      return this.activatePremiumPass({
        characterId: character.id,
        userId: character.userId,
        inventoryItemId: inventoryItem.id,
        inventoryQuantity: inventoryItem.quantity,
        item,
        operationId,
      });
    }

    if (!character.class) {
      throw new BadRequestException(
        'Classe do personagem não encontrada. Não foi possível calcular o HP máximo.',
      );
    }

    const activeAutoCombatSession =
      await this.prisma.autoCombatSession.findFirst({
        where: {
          characterId: character.id,
          status: AutoCombatSessionStatus.ACTIVE,
        },
      });

    if (activeAutoCombatSession) {
      throw new BadRequestException(
        'Não é possível usar consumível manualmente durante uma sessão de auto-combate ativa.',
      );
    }

    if (!this.hasHealingEffect(item)) {
      throw new BadRequestException(
        'Este consumível não possui efeito de cura.',
      );
    }

    this.assertPotionTierUnlocked(character.level, item);

    const equipmentItems = this.getEquipmentItems(character);
    const gatheringBonus = calculateGatheringPrimaryBonus(
      character.gatheringSkills,
    );

    const stats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
      gatheringBonus,
    );

    const maxHp = Math.max(
      1,
      this.toSafeNumber(stats?.derivedCombatStats?.maxHp, character.maxHp ?? 1),
    );

    const currentHp =
      character.currentHp === null || character.currentHp === undefined
        ? maxHp
        : this.clampHp(character.currentHp, maxHp);

    if (currentHp <= 0) {
      throw new BadRequestException(
        'Este personagem está sem HP. Use a enfermaria para recuperar personagens derrotados.',
      );
    }

    if (currentHp >= maxHp) {
      throw new BadRequestException('O personagem já está com HP cheio.');
    }

    const healAmount = this.calculateHealAmount({
      maxHp,
      healFlat: this.toSafeNumber(item.healFlat, 0),
      healPercent: this.toSafeNumber(item.healPercent, 0),
    });

    if (healAmount <= 0) {
      throw new BadRequestException(
        'Este consumível não recupera HP suficiente.',
      );
    }

    const newCurrentHp = Math.min(maxHp, currentHp + healAmount);
    const effectiveHeal = newCurrentHp - currentHp;

    await this.prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: {
          id: character.id,
        },
        data: {
          currentHp: newCurrentHp,
          maxHp,
        },
      });

      if (inventoryItem.quantity <= 1) {
        await tx.inventoryItem.delete({
          where: {
            id: inventoryItem.id,
          },
        });
      } else {
        await tx.inventoryItem.update({
          where: {
            id: inventoryItem.id,
          },
          data: {
            quantity: {
              decrement: 1,
            },
          },
        });
      }

      await recordEconomyEntry(tx, {
        characterId: character.id,
        direction: EconomyDirection.DEBIT,
        resourceType: EconomyResourceType.ITEM,
        itemId: item.id,
        tier: item.tier,
        quantity: 1,
        reason: ECONOMY_REASONS.CONSUMABLE_USED,
        referenceType: 'ConsumableUse',
        referenceId: operationId,
        idempotencyKey: `consumable:${operationId}:item`,
        metadata: { effectiveHeal },
      });
    });

    return {
      message: `${item.name} usado com sucesso.`,

      character: {
        id: character.id,
        name: character.name,
        level: character.level,
        oldHp: currentHp,
        newHp: newCurrentHp,
        maxHp,
      },

      consumable: this.mapPotionItem(
        item,
        Math.max(0, inventoryItem.quantity - 1),
      ),

      healing: {
        calculatedHeal: healAmount,
        effectiveHeal,
        wastedHeal: healAmount - effectiveHeal,
      },

      inventory: {
        previousQuantity: inventoryItem.quantity,
        newQuantity: Math.max(0, inventoryItem.quantity - 1),
      },
    };
  }

  private async activatePremiumPass(params: {
    characterId: string;
    userId: string;
    inventoryItemId: string;
    inventoryQuantity: number;
    item: Item;
    operationId: string;
  }) {
    const premiumDays = 30;
    const dayMs = 24 * 60 * 60 * 1000;
    const premiumUntil = await this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.inventoryItem.updateMany({
          where: { id: params.inventoryItemId, quantity: { gte: 1 } },
          data: { quantity: { decrement: 1 } },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException(
            'O Passe Premium já foi usado ou não está mais na mochila.',
          );
        }

        const user = await tx.user.findUnique({
          where: { id: params.userId },
          select: { premiumUntil: true },
        });
        if (!user) throw new NotFoundException('Conta não encontrada.');

        const now = new Date();
        const startsAt =
          user.premiumUntil && user.premiumUntil > now
            ? user.premiumUntil
            : now;
        const nextPremiumUntil = new Date(
          startsAt.getTime() + premiumDays * dayMs,
        );

        await tx.user.update({
          where: { id: params.userId },
          data: { premiumUntil: nextPremiumUntil },
        });
        await tx.inventoryItem.deleteMany({
          where: { id: params.inventoryItemId, quantity: { lte: 0 } },
        });
        await recordEconomyEntry(tx, {
          characterId: params.characterId,
          direction: EconomyDirection.DEBIT,
          resourceType: EconomyResourceType.ITEM,
          itemId: params.item.id,
          tier: params.item.tier,
          quantity: 1,
          reason: ECONOMY_REASONS.PREMIUM_PASS_ACTIVATED,
          referenceType: 'PremiumPassActivation',
          referenceId: params.operationId,
          idempotencyKey: `premium-pass:${params.operationId}:item`,
          metadata: {
            premiumDays,
            premiumUntil: nextPremiumUntil.toISOString(),
          },
        });

        return nextPremiumUntil;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const newQuantity = Math.max(0, params.inventoryQuantity - 1);

    return {
      message: 'Passe Premium ativado. Sua conta recebeu 30 dias de Premium.',
      kind: 'PREMIUM_PASS' as const,
      premium: {
        daysAdded: premiumDays,
        premiumUntil,
      },
      consumable: this.mapPotionItem(params.item, newQuantity),
      inventory: {
        previousQuantity: params.inventoryQuantity,
        newQuantity,
      },
    };
  }

  async getPotionConfig(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const config = await this.prisma.characterPotionConfig.upsert({
      where: {
        characterId: character.id,
      },
      create: {
        characterId: character.id,
        enabled: false,
        potionItemId: null,
        hpThresholdPercent: AUTO_POTION_TRIGGER_PERCENT,
        useInManualCombat: true,
        useInAutoCombat: true,
      },
      update: {},
      include: {
        potionItem: true,
      },
    });

    const availableQuantity = await this.getPotionInventoryQuantity(
      character.id,
      config.potionItemId,
    );

    const availablePotions = await this.getAvailablePotions(
      character.id,
      character.level,
    );

    return this.buildPotionConfigResponse({
      character,
      config,
      availableQuantity,
      availablePotions,
    });
  }

  async updatePotionConfig(
    userId: string,
    characterId: string,
    updatePotionConfigDto: UpdatePotionConfigDto,
  ) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const existingConfig = await this.prisma.characterPotionConfig.findUnique({
      where: {
        characterId: character.id,
      },
    });

    const nextEnabled =
      updatePotionConfigDto.enabled ?? existingConfig?.enabled ?? false;

    const nextPotionItemId =
      updatePotionConfigDto.potionItemId !== undefined
        ? updatePotionConfigDto.potionItemId
        : (existingConfig?.potionItemId ?? null);

    const nextHpThresholdPercent = AUTO_POTION_TRIGGER_PERCENT;

    const nextUseInManualCombat =
      updatePotionConfigDto.useInManualCombat ??
      existingConfig?.useInManualCombat ??
      true;

    const nextUseInAutoCombat =
      updatePotionConfigDto.useInAutoCombat ??
      existingConfig?.useInAutoCombat ??
      true;

    if (
      nextHpThresholdPercent < 1 ||
      nextHpThresholdPercent > 100 ||
      !Number.isInteger(nextHpThresholdPercent)
    ) {
      throw new BadRequestException(
        'O percentual de HP deve ser um número inteiro entre 1 e 100.',
      );
    }

    if (nextEnabled && !nextPotionItemId) {
      throw new BadRequestException(
        'Para ativar o uso automático, selecione uma poção.',
      );
    }

    if (nextEnabled && !nextUseInManualCombat && !nextUseInAutoCombat) {
      throw new BadRequestException(
        'Para ativar o uso automático, permita uso em combate manual, auto-combate ou ambos.',
      );
    }

    if (nextPotionItemId) {
      const potionItem = await this.prisma.item.findUnique({
        where: {
          id: nextPotionItemId,
        },
      });

      if (!potionItem) {
        throw new NotFoundException('Poção selecionada não encontrada.');
      }

      if (potionItem.slot !== ItemSlot.CONSUMABLE) {
        throw new BadRequestException(
          'O item selecionado não é um consumível.',
        );
      }

      if (!this.hasHealingEffect(potionItem)) {
        throw new BadRequestException(
          'O consumível selecionado não possui efeito de cura.',
        );
      }

      this.assertPotionTierUnlocked(character.level, potionItem);

      if (
        (nextUseInManualCombat || nextUseInAutoCombat) &&
        potionItem.usableInCombat !== true
      ) {
        throw new BadRequestException(
          'Este consumível não pode ser usado em combate.',
        );
      }

      if (nextEnabled) {
        const inventoryItem = await this.prisma.inventoryItem.findUnique({
          where: {
            characterId_itemId: {
              characterId: character.id,
              itemId: nextPotionItemId,
            },
          },
        });

        if (!inventoryItem || inventoryItem.quantity <= 0) {
          throw new BadRequestException(
            'O personagem não possui esta poção no inventário.',
          );
        }

        if (inventoryItem.type !== InventoryItemType.CONSUMABLE) {
          throw new BadRequestException(
            'O item selecionado no inventário não está registrado como consumível.',
          );
        }
      }
    }

    const config = await this.prisma.characterPotionConfig.upsert({
      where: {
        characterId: character.id,
      },
      create: {
        characterId: character.id,
        enabled: nextEnabled,
        potionItemId: nextPotionItemId,
        hpThresholdPercent: nextHpThresholdPercent,
        useInManualCombat: nextUseInManualCombat,
        useInAutoCombat: nextUseInAutoCombat,
      },
      update: {
        enabled: nextEnabled,
        potionItemId: nextPotionItemId,
        hpThresholdPercent: nextHpThresholdPercent,
        useInManualCombat: nextUseInManualCombat,
        useInAutoCombat: nextUseInAutoCombat,
      },
      include: {
        potionItem: true,
      },
    });

    const availableQuantity = await this.getPotionInventoryQuantity(
      character.id,
      config.potionItemId,
    );

    const availablePotions = await this.getAvailablePotions(
      character.id,
      character.level,
    );

    return {
      message: 'Configuração de poção automática atualizada com sucesso.',
      ...this.buildPotionConfigResponse({
        character,
        config,
        availableQuantity,
        availablePotions,
      }),
    };
  }

  private async getPotionInventoryQuantity(
    characterId: string,
    potionItemId?: string | null,
  ) {
    if (!potionItemId) {
      return 0;
    }

    const inventoryItem = await this.prisma.inventoryItem.findUnique({
      where: {
        characterId_itemId: {
          characterId,
          itemId: potionItemId,
        },
      },
    });

    return inventoryItem?.quantity ?? 0;
  }

  private async getAvailablePotions(
    characterId: string,
    characterLevel: number,
  ) {
    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: {
        characterId,
        type: InventoryItemType.CONSUMABLE,
        quantity: {
          gt: 0,
        },
      },
      include: {
        item: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return inventoryItems
      .filter((inventoryItem) => {
        return (
          inventoryItem.item.slot === ItemSlot.CONSUMABLE &&
          this.hasHealingEffect(inventoryItem.item) &&
          isPotionTierUnlocked({
            characterLevel,
            potion: inventoryItem.item,
          })
        );
      })
      .sort((a, b) => {
        return (
          a.item.tier - b.item.tier || a.item.name.localeCompare(b.item.name)
        );
      })
      .map((inventoryItem) => {
        return this.mapPotionItem(inventoryItem.item, inventoryItem.quantity);
      });
  }

  private buildPotionConfigResponse(params: {
    character: {
      id: string;
      name: string;
      level: number;
    };
    config: {
      id: string;
      characterId: string;
      enabled: boolean;
      potionItemId: string | null;
      hpThresholdPercent: number;
      useInManualCombat: boolean;
      useInAutoCombat: boolean;
      potionItem?: Item | null;
    };
    availableQuantity: number;
    availablePotions: ReturnType<ConsumablesService['mapPotionItem']>[];
  }) {
    const { character, config, availableQuantity, availablePotions } = params;

    const potion = config.potionItem
      ? this.mapPotionItem(config.potionItem, availableQuantity)
      : null;

    const hasPotion = Boolean(potion);
    const hasPotionInInventory = availableQuantity > 0;
    const tierAccess = getPotionTierAccess({
      characterLevel: character.level,
      potion: potion ?? { minTier: 1 },
    });
    const canAutoUseInManualCombat =
      config.enabled &&
      config.useInManualCombat &&
      hasPotion &&
      hasPotionInInventory &&
      tierAccess.allowed &&
      potion?.slot === ItemSlot.CONSUMABLE &&
      potion?.usableInCombat === true;

    const canAutoUseInAutoCombat =
      config.enabled &&
      config.useInAutoCombat &&
      hasPotion &&
      hasPotionInInventory &&
      tierAccess.allowed &&
      potion?.slot === ItemSlot.CONSUMABLE &&
      potion?.usableInCombat === true;

    const flatConfig = {
      id: config.id,
      characterId: config.characterId,
      enabled: config.enabled,
      potionItemId: config.potionItemId,
      hpThresholdPercent: config.hpThresholdPercent,
      useInManualCombat: config.useInManualCombat,
      useInAutoCombat: config.useInAutoCombat,
      potion,
      potionItem: potion,
      tierAccess,
    };

    return {
      character: {
        id: character.id,
        name: character.name,
        level: character.level,
      },

      ...flatConfig,

      config: {
        id: config.id,
        characterId: config.characterId,
        enabled: config.enabled,
        potionItemId: config.potionItemId,
        hpThresholdPercent: config.hpThresholdPercent,
        useInManualCombat: config.useInManualCombat,
        useInAutoCombat: config.useInAutoCombat,
      },

      potion,
      potionItem: potion,

      potionConfigs: [flatConfig],

      availablePotions,

      summary: {
        hasPotion,
        hasPotionInInventory,
        availableQuantity,
        canAutoUseInManualCombat,
        canAutoUseInAutoCombat,
        canAutoUse: canAutoUseInManualCombat || canAutoUseInAutoCombat,
        tierAccess,
        triggerText: !tierAccess.allowed
          ? getPotionTierLockedMessage({
              characterLevel: character.level,
              potion: potion ?? { minTier: 1 },
            })
          : config.enabled
            ? 'Pocao selecionada para uso durante a batalha.'
            : 'Nenhuma pocao selecionada para a batalha.',
      },
    };
  }

  private assertPotionTierUnlocked(
    characterLevel: number,
    potion: Pick<Item, 'name' | 'minTier'>,
  ) {
    if (isPotionTierUnlocked({ characterLevel, potion })) return;

    throw new BadRequestException(
      getPotionTierLockedMessage({ characterLevel, potion }),
    );
  }

  private mapPotionItem(item: Item, availableQuantity = 0) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,

      rarity: item.rarity,
      tier: item.tier,
      slot: item.slot,
      family: item.family,

      healFlat: this.toSafeNumber(item.healFlat, 0),
      healPercent: this.toSafeNumber(item.healPercent, 0),

      usableInCombat: item.usableInCombat,
      usableOutOfCombat: item.usableOutOfCombat,
      isSellable: item.isSellable,
      isTradable: item.isTradable,

      minTier: item.minTier,
      maxTier: item.maxTier,

      availableQuantity,
    };
  }

  private hasHealingEffect(item: Pick<Item, 'healFlat' | 'healPercent'>) {
    return (
      this.toSafeNumber(item.healFlat, 0) > 0 ||
      this.toSafeNumber(item.healPercent, 0) > 0
    );
  }

  private getEquipmentItems(character: any) {
    return [
      character.equipment?.mainHand,
      character.equipment?.offHand,
      character.equipment?.head,
      character.equipment?.armor,
      character.equipment?.pants,
      character.equipment?.boots,
    ];
  }

  private calculateHealAmount(params: {
    maxHp: number;
    healFlat: number;
    healPercent: number;
  }) {
    const percentHeal = Math.floor((params.maxHp * params.healPercent) / 100);

    return params.healFlat + percentHeal;
  }

  private clampHp(currentHp: number, maxHp: number) {
    return Math.max(0, Math.min(currentHp, maxHp));
  }

  private toSafeNumber(value: unknown, fallback = 0) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
