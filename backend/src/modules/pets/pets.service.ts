import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CharacterPetStatus,
  EconomyDirection,
  EconomyResourceType,
  InventoryItemType,
  PetSpecialization,
  Prisma,
} from '@prisma/client';
import {
  getPetDuplicateCocoonRecovery,
  getPetRarityByTier,
  WORLD_BOSS_FRAGMENT_ITEM_FAMILY,
} from '../../common/config/economy.config';
import { tryConsumeInventoryStack } from '../../common/inventory/inventory-stack.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { EconomyService } from '../economy/economy.service';
import { RecoverDuplicateCocoonsDto } from './dto/recover-duplicate-cocoons.dto';
import { StartPetIncubationDto } from './dto/start-pet-incubation.dto';

const PET_DEFINITION_INCLUDE = {
  cocoonItem: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      tier: true,
      rarity: true,
      family: true,
    },
  },
  fragmentItem: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      tier: true,
      rarity: true,
      family: true,
    },
  },
} satisfies Prisma.PetDefinitionInclude;

const CHARACTER_PET_INCLUDE = {
  petDefinition: { include: PET_DEFINITION_INCLUDE },
} satisfies Prisma.CharacterPetInclude;

const PET_SPECIALIZATION_LABELS: Record<PetSpecialization, string> = {
  GATHERING_DESMANCHE: 'Desmanche',
  GATHERING_COLETA: 'Coleta',
  GATHERING_PATRULHA: 'Patrulha',
  GATHERING_ARSENAL: 'Arsenal',
  GATHERING_TECNOVARREDURA: 'Tecnovarredura',
  GATHERING_CONTENCAO: 'Contenção',
  AUTO_COMBAT_TTK: 'Combate automático',
  AUTO_COMBAT_HUNTING: 'Rastreamento',
};

type DuplicateCocoonRecoveryMode = 'SELL' | 'CONVERT';

@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economyService: EconomyService,
  ) {}

  async getState(userId: string, characterId: string) {
    const now = new Date();
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        gold: true,
        equippedPetId: true,
        inventoryItems: {
          where: {
            item: {
              OR: [
                { petDefinition: { isNot: null } },
                { family: WORLD_BOSS_FRAGMENT_ITEM_FAMILY },
              ],
            },
          },
          select: { itemId: true, quantity: true },
        },
        pets: {
          include: CHARACTER_PET_INCLUDE,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const definitions = await this.prisma.petDefinition.findMany({
      where: { isActive: true },
      include: PET_DEFINITION_INCLUDE,
      orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }],
    });
    const inventoryBalanceByItemId = new Map(
      character.inventoryItems.map((entry) => [entry.itemId, entry.quantity]),
    );
    const petByDefinitionId = new Map(
      character.pets.map((pet) => [pet.petDefinitionId, pet]),
    );
    const activeIncubation = character.pets.find(
      (pet) => pet.status === CharacterPetStatus.INCUBATING,
    );
    const equippedCharacterPet = character.equippedPetId
      ? character.pets.find((pet) => pet.id === character.equippedPetId)
      : null;

    return {
      serverNow: now.toISOString(),
      character: {
        id: character.id,
        name: character.name,
        gold: character.gold,
      },
      collection: {
        owned: character.pets.filter(
          (pet) => pet.status === CharacterPetStatus.AVAILABLE,
        ).length,
        total: definitions.length,
      },
      activeIncubation: activeIncubation
        ? this.formatCharacterPet(
            activeIncubation,
            now,
            character.equippedPetId,
          )
        : null,
      equippedPet: equippedCharacterPet
        ? this.formatCharacterPet(
            equippedCharacterPet,
            now,
            character.equippedPetId,
          )
        : null,
      pets: definitions.map((definition) => {
        const characterPet = petByDefinitionId.get(definition.id) ?? null;
        const cocoonQuantity =
          inventoryBalanceByItemId.get(definition.cocoonItemId) ?? 0;
        const duplicateCocoonQuantity = Math.max(
          0,
          cocoonQuantity - (characterPet ? 0 : 1),
        );
        const duplicateRecovery = getPetDuplicateCocoonRecovery(
          definition.tier,
        );
        const fragmentItemBalance =
          inventoryBalanceByItemId.get(definition.fragmentItemId) ?? 0;
        const fragmentBalance = fragmentItemBalance;
        const reason = this.getUnavailableReason({
          characterPet,
          activeIncubation,
          cocoonQuantity,
          fragmentBalance,
          gold: character.gold,
          fragmentCost: definition.fragmentCost,
          goldCost: definition.goldCost,
        });
        const rarity = getPetRarityByTier(definition.tier);

        return {
          id: definition.id,
          key: definition.key,
          name: definition.name,
          description: definition.description,
          tier: definition.tier,
          rarity,
          assetKey: definition.assetKey,
          specialization: definition.specialization,
          specializationLabel:
            PET_SPECIALIZATION_LABELS[definition.specialization],
          effectType: definition.effectType,
          effectBasisPoints: definition.effectBasisPoints,
          effectPercent: definition.effectBasisPoints / 100,
          npcSaleGold: definition.npcSaleGold,
          incubationSeconds: definition.incubationSeconds,
          costs: {
            cocoon: 1,
            fragments: definition.fragmentCost,
            gold: definition.goldCost,
          },
          balances: {
            cocoons: cocoonQuantity,
            duplicateCocoons: duplicateCocoonQuantity,
            fragments: fragmentBalance,
            gold: character.gold,
          },
          duplicateRecovery: duplicateRecovery
            ? {
                convertFragmentsPerCocoon: duplicateRecovery.fragmentsPerCocoon,
                sellGoldPerCocoon: duplicateRecovery.goldPerCocoon,
              }
            : null,
          cocoonItem: {
            ...definition.cocoonItem,
            rarity,
          },
          fragmentItem: definition.fragmentItem,
          characterPet: characterPet
            ? this.formatCharacterPet(
                characterPet,
                now,
                character.equippedPetId,
              )
            : null,
          canEquip:
            characterPet?.status === CharacterPetStatus.AVAILABLE &&
            characterPet.id !== character.equippedPetId,
          canSell:
            characterPet?.status === CharacterPetStatus.AVAILABLE &&
            characterPet.id !== character.equippedPetId,
          canIncubate: reason === null,
          reason,
        };
      }),
    };
  }

  async startIncubation(
    userId: string,
    characterId: string,
    input: StartPetIncubationDto,
  ) {
    const incubationRequestId = `${characterId}:${input.requestId}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const previous = await tx.characterPet.findUnique({
              where: { incubationRequestId },
              include: CHARACTER_PET_INCLUDE,
            });
            if (previous) {
              if (
                previous.characterId !== characterId ||
                previous.petDefinitionId !== input.petDefinitionId
              ) {
                throw new ConflictException(
                  'Esta solicitação já foi usada em outra incubação.',
                );
              }
              return {
                applied: false,
                message: 'Esta incubação já havia sido iniciada.',
                pet: this.formatCharacterPet(previous, new Date()),
              };
            }

            const [character, definition, existingPet, activeIncubation] =
              await Promise.all([
                tx.character.findFirst({
                  where: { id: characterId, userId, deletedAt: null },
                  select: { id: true, gold: true },
                }),
                tx.petDefinition.findFirst({
                  where: { id: input.petDefinitionId, isActive: true },
                  include: PET_DEFINITION_INCLUDE,
                }),
                tx.characterPet.findUnique({
                  where: {
                    characterId_petDefinitionId: {
                      characterId,
                      petDefinitionId: input.petDefinitionId,
                    },
                  },
                }),
                tx.characterPet.findFirst({
                  where: {
                    characterId,
                    status: CharacterPetStatus.INCUBATING,
                  },
                  select: { id: true },
                }),
              ]);

            if (!character) {
              throw new NotFoundException('Personagem não encontrado.');
            }
            if (!definition) {
              throw new NotFoundException('Companheiro não encontrado.');
            }
            if (existingPet) {
              throw new BadRequestException(
                existingPet.status === CharacterPetStatus.AVAILABLE
                  ? 'Este companheiro já pertence à sua coleção.'
                  : 'Este companheiro já está sendo incubado.',
              );
            }
            if (activeIncubation) {
              throw new BadRequestException(
                'Conclua a incubação atual antes de iniciar outra.',
              );
            }

            const fragmentInventory = await tx.inventoryItem.findUnique({
              where: {
                characterId_itemId: {
                  characterId,
                  itemId: definition.fragmentItemId,
                },
              },
              select: { quantity: true },
            });
            const fragmentItemBalance = Math.max(
              0,
              fragmentInventory?.quantity ?? 0,
            );
            if (fragmentItemBalance < definition.fragmentCost) {
              throw new BadRequestException(
                `São necessários ${definition.fragmentCost}x ${definition.fragmentItem.name}.`,
              );
            }
            const baseLedgerKey = `pet-incubation:${characterId}:${input.requestId}`;
            const fragmentLedgerMetadata = {
              requestId: input.requestId,
              petDefinitionId: definition.id,
              fragmentItemId: definition.fragmentItemId,
              itemQuantityConsumed: definition.fragmentCost,
            };

            const cocoonBalance = await tryConsumeInventoryStack(tx, {
              characterId,
              itemId: definition.cocoonItemId,
              quantity: 1,
            });
            if (cocoonBalance === null) {
              throw new BadRequestException(
                `É necessário 1x ${definition.cocoonItem.name}.`,
              );
            }

            const fragmentItemBalanceAfter = await tryConsumeInventoryStack(
              tx,
              {
                characterId,
                itemId: definition.fragmentItemId,
                quantity: definition.fragmentCost,
              },
            );
            if (fragmentItemBalanceAfter === null) {
              throw new ConflictException(
                'O estoque de fragmentos mudou. Tente novamente.',
              );
            }
            await recordEconomyEntry(tx, {
              characterId,
              direction: EconomyDirection.DEBIT,
              resourceType: EconomyResourceType.ITEM,
              itemId: definition.fragmentItemId,
              tier: definition.tier,
              quantity: definition.fragmentCost,
              balanceAfter: fragmentItemBalanceAfter,
              reason: ECONOMY_REASONS.PET_INCUBATION_FRAGMENT,
              idempotencyKey: `${baseLedgerKey}:fragment:item`,
              referenceType: 'PetDefinition',
              referenceId: definition.id,
              metadata: fragmentLedgerMetadata,
            });

            const goldDebit = await tx.character.updateMany({
              where: { id: characterId, gold: { gte: definition.goldCost } },
              data: { gold: { decrement: definition.goldCost } },
            });
            if (goldDebit.count !== 1) {
              throw new BadRequestException(
                `São necessários ${definition.goldCost} Gold para a incubação.`,
              );
            }
            const updatedCharacter = await tx.character.findUniqueOrThrow({
              where: { id: characterId },
              select: { gold: true },
            });

            const now = new Date();
            const incubationEndsAt = new Date(
              now.getTime() + definition.incubationSeconds * 1000,
            );
            const characterPet = await tx.characterPet.create({
              data: {
                characterId,
                petDefinitionId: definition.id,
                incubationRequestId,
                incubationStartedAt: now,
                incubationEndsAt,
              },
              include: CHARACTER_PET_INCLUDE,
            });

            const metadata = {
              requestId: input.requestId,
              petDefinitionId: definition.id,
              petName: definition.name,
              incubationEndsAt: incubationEndsAt.toISOString(),
            };
            await recordEconomyEntry(tx, {
              characterId,
              direction: EconomyDirection.DEBIT,
              resourceType: EconomyResourceType.ITEM,
              itemId: definition.cocoonItemId,
              tier: definition.tier,
              quantity: 1,
              reason: ECONOMY_REASONS.PET_INCUBATION_COCOON,
              idempotencyKey: `${baseLedgerKey}:cocoon`,
              referenceType: 'CharacterPet',
              referenceId: characterPet.id,
              metadata,
            });
            await recordEconomyEntry(tx, {
              characterId,
              direction: EconomyDirection.DEBIT,
              resourceType: EconomyResourceType.GOLD,
              tier: definition.tier,
              quantity: definition.goldCost,
              balanceAfter: updatedCharacter.gold,
              reason: ECONOMY_REASONS.PET_INCUBATION_GOLD,
              idempotencyKey: `${baseLedgerKey}:gold`,
              referenceType: 'CharacterPet',
              referenceId: characterPet.id,
              metadata,
            });

            return {
              applied: true,
              message: `${definition.name} entrou na incubadora.`,
              pet: this.formatCharacterPet(characterPet, now),
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
      'A incubação encontrou concorrência. Tente novamente.',
    );
  }

  async claimIncubation(
    userId: string,
    characterId: string,
    characterPetId: string,
  ) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const characterPet = await tx.characterPet.findFirst({
        where: {
          id: characterPetId,
          characterId,
          character: { userId, deletedAt: null },
        },
        include: CHARACTER_PET_INCLUDE,
      });
      if (!characterPet) {
        throw new NotFoundException('Incubação não encontrada.');
      }
      if (characterPet.status === CharacterPetStatus.AVAILABLE) {
        return {
          applied: false,
          message: 'Este companheiro já foi coletado.',
          pet: this.formatCharacterPet(characterPet, now),
        };
      }
      if (characterPet.incubationEndsAt.getTime() > now.getTime()) {
        const remainingSeconds = Math.max(
          1,
          Math.ceil(
            (characterPet.incubationEndsAt.getTime() - now.getTime()) / 1000,
          ),
        );
        throw new BadRequestException(
          `A incubação termina em ${remainingSeconds} segundos.`,
        );
      }

      const claimed = await tx.characterPet.updateMany({
        where: {
          id: characterPet.id,
          status: CharacterPetStatus.INCUBATING,
          incubationEndsAt: { lte: now },
        },
        data: {
          status: CharacterPetStatus.AVAILABLE,
          hatchedAt: now,
        },
      });
      const updated = await tx.characterPet.findUniqueOrThrow({
        where: { id: characterPet.id },
        include: CHARACTER_PET_INCLUDE,
      });

      return {
        applied: claimed.count === 1,
        message:
          claimed.count === 1
            ? `${updated.petDefinition.name} entrou para sua coleção.`
            : 'Este companheiro já foi coletado.',
        pet: this.formatCharacterPet(updated, now),
      };
    });
  }

  async equipPet(userId: string, characterId: string, characterPetId: string) {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: { id: characterId, userId, deletedAt: null },
        select: { id: true, equippedPetId: true },
      });
      if (!character) {
        throw new NotFoundException('Personagem não encontrado.');
      }

      const characterPet = await tx.characterPet.findFirst({
        where: { id: characterPetId, characterId },
        include: CHARACTER_PET_INCLUDE,
      });
      if (!characterPet) {
        throw new NotFoundException('Companheiro não encontrado na coleção.');
      }
      if (characterPet.status !== CharacterPetStatus.AVAILABLE) {
        throw new BadRequestException(
          'O companheiro precisa concluir a incubação antes de ser equipado.',
        );
      }
      if (character.equippedPetId === characterPet.id) {
        return {
          applied: false,
          message: `${characterPet.petDefinition.name} já está equipado.`,
          pet: this.formatCharacterPet(
            characterPet,
            new Date(),
            characterPet.id,
          ),
        };
      }

      await tx.character.update({
        where: { id: character.id },
        data: { equippedPetId: characterPet.id },
      });

      return {
        applied: true,
        message: `${characterPet.petDefinition.name} foi equipado.`,
        pet: this.formatCharacterPet(characterPet, new Date(), characterPet.id),
      };
    });
  }

  async unequipPet(userId: string, characterId: string) {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: { id: characterId, userId, deletedAt: null },
        select: { id: true, equippedPetId: true },
      });
      if (!character) {
        throw new NotFoundException('Personagem não encontrado.');
      }
      if (!character.equippedPetId) {
        return {
          applied: false,
          message: 'Nenhum companheiro está equipado.',
          pet: null,
        };
      }

      const characterPet = await tx.characterPet.findFirst({
        where: { id: character.equippedPetId, characterId },
        include: CHARACTER_PET_INCLUDE,
      });
      await tx.character.update({
        where: { id: character.id },
        data: { equippedPetId: null },
      });

      return {
        applied: true,
        message: characterPet
          ? `${characterPet.petDefinition.name} foi desequipado.`
          : 'O espaço de companheiro foi liberado.',
        pet: characterPet
          ? this.formatCharacterPet(characterPet, new Date(), null)
          : null,
      };
    });
  }

  async sellPet(userId: string, characterId: string, characterPetId: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const character = await tx.character.findFirst({
              where: { id: characterId, userId, deletedAt: null },
              select: { id: true, gold: true, equippedPetId: true },
            });
            if (!character) {
              throw new NotFoundException('Personagem não encontrado.');
            }

            const characterPet = await tx.characterPet.findFirst({
              where: { id: characterPetId, characterId },
              include: CHARACTER_PET_INCLUDE,
            });
            if (!characterPet) {
              throw new NotFoundException(
                'Companheiro não encontrado na coleção.',
              );
            }
            if (characterPet.status !== CharacterPetStatus.AVAILABLE) {
              throw new BadRequestException(
                'Uma incubação em andamento não pode ser vendida.',
              );
            }
            if (character.equippedPetId === characterPet.id) {
              throw new BadRequestException(
                'Desequipe o companheiro antes de vendê-lo.',
              );
            }

            const sold = await tx.characterPet.deleteMany({
              where: {
                id: characterPet.id,
                characterId,
                status: CharacterPetStatus.AVAILABLE,
              },
            });
            if (sold.count !== 1) {
              throw new ConflictException(
                'A coleção mudou durante a venda. Tente novamente.',
              );
            }

            const saleGold = characterPet.petDefinition.npcSaleGold;
            const updatedCharacter = await tx.character.update({
              where: { id: character.id },
              data: { gold: { increment: saleGold } },
              select: { gold: true },
            });
            const ledgerPrefix = `pet-npc-sale:${characterPet.id}`;
            const metadata = {
              petDefinitionId: characterPet.petDefinition.id,
              petKey: characterPet.petDefinition.key,
              petName: characterPet.petDefinition.name,
              specialization: characterPet.petDefinition.specialization,
            };

            await recordEconomyEntry(tx, {
              characterId,
              direction: EconomyDirection.DEBIT,
              resourceType: EconomyResourceType.PET,
              tier: characterPet.petDefinition.tier,
              quantity: 1,
              reason: ECONOMY_REASONS.PET_NPC_SOLD,
              idempotencyKey: `${ledgerPrefix}:pet`,
              referenceType: 'CharacterPet',
              referenceId: characterPet.id,
              metadata,
            });
            await recordEconomyEntry(tx, {
              characterId,
              direction: EconomyDirection.CREDIT,
              resourceType: EconomyResourceType.GOLD,
              tier: characterPet.petDefinition.tier,
              quantity: saleGold,
              balanceAfter: updatedCharacter.gold,
              reason: ECONOMY_REASONS.PET_NPC_GOLD_RECEIVED,
              idempotencyKey: `${ledgerPrefix}:gold`,
              referenceType: 'CharacterPet',
              referenceId: characterPet.id,
              metadata,
            });

            return {
              applied: true,
              message: `${characterPet.petDefinition.name} foi vendido por ${saleGold.toLocaleString('pt-BR')} Gold.`,
              soldPetId: characterPet.id,
              saleGold,
              gold: updatedCharacter.gold,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (this.isTransactionConflict(error) && attempt < 2) continue;
        throw error;
      }
    }

    throw new ConflictException(
      'A venda encontrou concorrência. Tente novamente.',
    );
  }

  sellDuplicateCocoons(
    userId: string,
    characterId: string,
    input: RecoverDuplicateCocoonsDto,
  ) {
    return this.recoverDuplicateCocoons('SELL', userId, characterId, input);
  }

  convertDuplicateCocoons(
    userId: string,
    characterId: string,
    input: RecoverDuplicateCocoonsDto,
  ) {
    return this.recoverDuplicateCocoons('CONVERT', userId, characterId, input);
  }

  private async recoverDuplicateCocoons(
    mode: DuplicateCocoonRecoveryMode,
    userId: string,
    characterId: string,
    input: RecoverDuplicateCocoonsDto,
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const ledgerPrefix = `pet-cocoon-duplicate:${mode.toLowerCase()}:${characterId}:${input.requestId}`;
            const itemLedgerKey = `${ledgerPrefix}:cocoon`;
            const outputLedgerKey = `${ledgerPrefix}:${mode === 'SELL' ? 'gold' : 'fragments'}`;
            const itemReason =
              mode === 'SELL'
                ? ECONOMY_REASONS.PET_DUPLICATE_COCOON_SOLD
                : ECONOMY_REASONS.PET_DUPLICATE_COCOON_CONVERTED;

            const character = await tx.character.findFirst({
              where: { id: characterId, userId, deletedAt: null },
              select: { id: true, gold: true },
            });
            if (!character) {
              throw new NotFoundException('Personagem não encontrado.');
            }

            const existing = await tx.economyLedgerEntry.findUnique({
              where: { idempotencyKey: itemLedgerKey },
            });
            if (existing) {
              if (
                existing.reason !== itemReason ||
                existing.referenceId !== input.petDefinitionId ||
                existing.quantity !== input.quantity
              ) {
                throw new ConflictException(
                  'Esta solicitação já foi usada para outro casulo.',
                );
              }

              const output = await tx.economyLedgerEntry.findUniqueOrThrow({
                where: { idempotencyKey: outputLedgerKey },
              });
              const metadata = this.getLedgerMetadata(existing.metadata);
              const outputMetadata = this.getLedgerMetadata(output.metadata);
              const cocoonName =
                typeof metadata.cocoonName === 'string'
                  ? metadata.cocoonName
                  : 'Casulo repetido';

              return this.buildDuplicateRecoveryResponse({
                applied: false,
                mode,
                cocoonName,
                quantity: input.quantity,
                outputQuantity: output.quantity,
                outputBalance:
                  typeof outputMetadata.totalBalanceAfter === 'number'
                    ? outputMetadata.totalBalanceAfter
                    : (output.balanceAfter ?? 0),
              });
            }

            const [definition, characterPet] = await Promise.all([
              tx.petDefinition.findFirst({
                where: { id: input.petDefinitionId, isActive: true },
                include: PET_DEFINITION_INCLUDE,
              }),
              tx.characterPet.findUnique({
                where: {
                  characterId_petDefinitionId: {
                    characterId,
                    petDefinitionId: input.petDefinitionId,
                  },
                },
                select: { id: true },
              }),
            ]);
            if (!definition) {
              throw new NotFoundException('Companheiro não encontrado.');
            }

            const cocoonInventory = await tx.inventoryItem.findUnique({
              where: {
                characterId_itemId: {
                  characterId,
                  itemId: definition.cocoonItemId,
                },
              },
              select: { quantity: true },
            });
            const reservedQuantity = characterPet ? 0 : 1;
            const duplicateQuantity = Math.max(
              0,
              (cocoonInventory?.quantity ?? 0) - reservedQuantity,
            );
            if (duplicateQuantity < input.quantity) {
              throw new BadRequestException(
                duplicateQuantity > 0
                  ? `Apenas ${duplicateQuantity} casulo(s) repetido(s) estão disponíveis.`
                  : 'Nenhum casulo repetido está disponível. O primeiro exemplar fica reservado para a coleção.',
              );
            }

            const recovery = getPetDuplicateCocoonRecovery(definition.tier);
            if (!recovery) {
              throw new BadRequestException(
                'A recuperação de casulos está disponível do T1 ao T5.',
              );
            }

            const remainingCocoons = await tryConsumeInventoryStack(tx, {
              characterId,
              itemId: definition.cocoonItemId,
              quantity: input.quantity,
              minimumRemaining: reservedQuantity,
            });
            if (remainingCocoons === null) {
              throw new ConflictException(
                'O estoque de casulos mudou. Tente novamente.',
              );
            }

            const outputQuantity =
              input.quantity *
              (mode === 'SELL'
                ? recovery.goldPerCocoon
                : recovery.fragmentsPerCocoon);
            const metadata = {
              requestId: input.requestId,
              action: mode,
              cocoonName: definition.cocoonItem.name,
              petDefinitionId: definition.id,
              specialization: definition.specialization,
              outputQuantity,
            };
            await recordEconomyEntry(tx, {
              characterId,
              direction: EconomyDirection.DEBIT,
              resourceType: EconomyResourceType.ITEM,
              itemId: definition.cocoonItemId,
              tier: definition.tier,
              quantity: input.quantity,
              balanceAfter: remainingCocoons,
              reason: itemReason,
              idempotencyKey: itemLedgerKey,
              referenceType: 'PetDefinition',
              referenceId: definition.id,
              metadata,
            });

            let outputBalance: number;
            if (mode === 'SELL') {
              const updatedCharacter = await tx.character.update({
                where: { id: characterId },
                data: { gold: { increment: outputQuantity } },
                select: { gold: true },
              });
              outputBalance = updatedCharacter.gold;
              await recordEconomyEntry(tx, {
                characterId,
                direction: EconomyDirection.CREDIT,
                resourceType: EconomyResourceType.GOLD,
                tier: definition.tier,
                quantity: outputQuantity,
                balanceAfter: outputBalance,
                reason: ECONOMY_REASONS.PET_DUPLICATE_COCOON_GOLD_RECEIVED,
                idempotencyKey: outputLedgerKey,
                referenceType: 'PetDefinition',
                referenceId: definition.id,
                metadata,
              });
            } else {
              const fragmentInventory = await tx.inventoryItem.upsert({
                where: {
                  characterId_itemId: {
                    characterId,
                    itemId: definition.fragmentItemId,
                  },
                },
                create: {
                  characterId,
                  itemId: definition.fragmentItemId,
                  quantity: outputQuantity,
                  type: InventoryItemType.MATERIAL,
                },
                update: {
                  quantity: { increment: outputQuantity },
                  type: InventoryItemType.MATERIAL,
                },
                select: { quantity: true },
              });
              outputBalance = fragmentInventory.quantity;
              await recordEconomyEntry(tx, {
                characterId,
                direction: EconomyDirection.CREDIT,
                resourceType: EconomyResourceType.ITEM,
                itemId: definition.fragmentItemId,
                tier: definition.tier,
                quantity: outputQuantity,
                balanceAfter: fragmentInventory.quantity,
                reason: ECONOMY_REASONS.PET_DUPLICATE_COCOON_FRAGMENTS_RECEIVED,
                idempotencyKey: outputLedgerKey,
                referenceType: 'PetDefinition',
                referenceId: definition.id,
                metadata: {
                  ...metadata,
                  fragmentItemId: definition.fragmentItemId,
                  totalBalanceAfter: fragmentInventory.quantity,
                },
              });
            }

            return this.buildDuplicateRecoveryResponse({
              applied: true,
              mode,
              cocoonName: definition.cocoonItem.name,
              quantity: input.quantity,
              outputQuantity,
              outputBalance,
            });
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
      'A recuperação de casulos encontrou concorrência. Tente novamente.',
    );
  }

  private buildDuplicateRecoveryResponse(params: {
    applied: boolean;
    mode: DuplicateCocoonRecoveryMode;
    cocoonName: string;
    quantity: number;
    outputQuantity: number;
    outputBalance: number;
  }) {
    const outputLabel =
      params.mode === 'SELL' ? 'Gold' : 'Fragmentos de Ameaça';
    return {
      applied: params.applied,
      action: params.mode,
      message: params.applied
        ? `${params.quantity}x ${params.cocoonName} ${params.mode === 'SELL' ? 'vendido(s)' : 'convertido(s)'} por ${params.outputQuantity.toLocaleString('pt-BR')} ${outputLabel}.`
        : 'Esta recuperação de casulos já havia sido concluída.',
      recoveredCocoons: params.quantity,
      goldReceived: params.mode === 'SELL' ? params.outputQuantity : 0,
      fragmentsReceived: params.mode === 'CONVERT' ? params.outputQuantity : 0,
      balance: params.outputBalance,
    };
  }

  private getLedgerMetadata(value: Prisma.JsonValue | null) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private formatCharacterPet(
    characterPet: Prisma.CharacterPetGetPayload<{
      include: typeof CHARACTER_PET_INCLUDE;
    }>,
    now: Date,
    equippedPetId: string | null = null,
  ) {
    const isReady =
      characterPet.status === CharacterPetStatus.INCUBATING &&
      characterPet.incubationEndsAt.getTime() <= now.getTime();

    return {
      id: characterPet.id,
      status: isReady ? 'READY' : characterPet.status,
      incubationStartedAt: characterPet.incubationStartedAt,
      incubationEndsAt: characterPet.incubationEndsAt,
      hatchedAt: characterPet.hatchedAt,
      isEquipped: characterPet.id === equippedPetId,
      remainingSeconds:
        characterPet.status === CharacterPetStatus.INCUBATING
          ? Math.max(
              0,
              Math.ceil(
                (characterPet.incubationEndsAt.getTime() - now.getTime()) /
                  1000,
              ),
            )
          : 0,
      pet: {
        id: characterPet.petDefinition.id,
        key: characterPet.petDefinition.key,
        name: characterPet.petDefinition.name,
        description: characterPet.petDefinition.description,
        tier: characterPet.petDefinition.tier,
        rarity: getPetRarityByTier(characterPet.petDefinition.tier),
        assetKey: characterPet.petDefinition.assetKey,
        specialization: characterPet.petDefinition.specialization,
        specializationLabel:
          PET_SPECIALIZATION_LABELS[characterPet.petDefinition.specialization],
        effectType: characterPet.petDefinition.effectType,
        effectBasisPoints: characterPet.petDefinition.effectBasisPoints,
        effectPercent: characterPet.petDefinition.effectBasisPoints / 100,
        npcSaleGold: characterPet.petDefinition.npcSaleGold,
      },
    };
  }

  private getUnavailableReason(params: {
    characterPet: { status: CharacterPetStatus } | null;
    activeIncubation: { id: string } | undefined;
    cocoonQuantity: number;
    fragmentBalance: number;
    gold: number;
    fragmentCost: number;
    goldCost: number;
  }) {
    if (params.characterPet) {
      return params.characterPet.status === CharacterPetStatus.AVAILABLE
        ? 'Companheiro já obtido.'
        : 'Companheiro em incubação.';
    }
    if (params.activeIncubation) return 'A incubadora já está ocupada.';
    if (params.cocoonQuantity < 1) return 'Casulo necessário.';
    if (params.fragmentBalance < params.fragmentCost) {
      return 'Fragmentos de Ameaça insuficientes.';
    }
    if (params.gold < params.goldCost) return 'Gold insuficiente.';
    return null;
  }

  private isTransactionConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
