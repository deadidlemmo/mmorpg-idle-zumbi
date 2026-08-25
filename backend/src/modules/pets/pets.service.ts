import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CharacterPetStatus,
  EconomyCurrency,
  EconomyDirection,
  EconomyResourceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ECONOMY_REASONS } from '../economy/economy.constants';
import { recordEconomyEntry } from '../economy/economy-ledger';
import { EconomyService } from '../economy/economy.service';
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
} satisfies Prisma.PetDefinitionInclude;

const CHARACTER_PET_INCLUDE = {
  petDefinition: { include: PET_DEFINITION_INCLUDE },
} satisfies Prisma.CharacterPetInclude;

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
        inventoryItems: {
          where: { item: { petDefinition: { isNot: null } } },
          select: { itemId: true, quantity: true },
        },
        economyBalances: {
          where: { currency: EconomyCurrency.WORLD_BOSS_FRAGMENT },
          select: { tier: true, balance: true },
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
    const cocoonBalanceByItemId = new Map(
      character.inventoryItems.map((entry) => [entry.itemId, entry.quantity]),
    );
    const fragmentBalanceByTier = new Map(
      character.economyBalances.map((entry) => [entry.tier, entry.balance]),
    );
    const petByDefinitionId = new Map(
      character.pets.map((pet) => [pet.petDefinitionId, pet]),
    );
    const activeIncubation = character.pets.find(
      (pet) => pet.status === CharacterPetStatus.INCUBATING,
    );

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
        ? this.formatCharacterPet(activeIncubation, now)
        : null,
      pets: definitions.map((definition) => {
        const characterPet = petByDefinitionId.get(definition.id) ?? null;
        const cocoonQuantity =
          cocoonBalanceByItemId.get(definition.cocoonItemId) ?? 0;
        const fragmentBalance = fragmentBalanceByTier.get(definition.tier) ?? 0;
        const reason = this.getUnavailableReason({
          characterPet,
          activeIncubation,
          cocoonQuantity,
          fragmentBalance,
          gold: character.gold,
          fragmentCost: definition.fragmentCost,
          goldCost: definition.goldCost,
        });

        return {
          id: definition.id,
          key: definition.key,
          name: definition.name,
          description: definition.description,
          tier: definition.tier,
          rarity: definition.rarity,
          assetKey: definition.assetKey,
          incubationSeconds: definition.incubationSeconds,
          costs: {
            cocoon: 1,
            fragments: definition.fragmentCost,
            gold: definition.goldCost,
          },
          balances: {
            cocoons: cocoonQuantity,
            fragments: fragmentBalance,
            gold: character.gold,
          },
          cocoonItem: {
            ...definition.cocoonItem,
            rarity: String(definition.cocoonItem.rarity),
          },
          characterPet: characterPet
            ? this.formatCharacterPet(characterPet, now)
            : null,
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

            const cocoonDebit = await tx.inventoryItem.updateMany({
              where: {
                characterId,
                itemId: definition.cocoonItemId,
                quantity: { gte: 1 },
              },
              data: { quantity: { decrement: 1 } },
            });
            if (cocoonDebit.count !== 1) {
              throw new BadRequestException(
                `É necessário 1x ${definition.cocoonItem.name}.`,
              );
            }
            await tx.inventoryItem.deleteMany({
              where: {
                characterId,
                itemId: definition.cocoonItemId,
                quantity: { lte: 0 },
              },
            });

            const baseLedgerKey = `pet-incubation:${characterId}:${input.requestId}`;
            const fragmentDebit =
              await this.economyService.debitWalletInTransaction(tx, {
                characterId,
                currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
                tier: definition.tier,
                quantity: definition.fragmentCost,
                reason: ECONOMY_REASONS.PET_INCUBATION_FRAGMENT,
                idempotencyKey: `${baseLedgerKey}:fragment`,
                referenceType: 'PetDefinition',
                referenceId: definition.id,
                metadata: { requestId: input.requestId },
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
              applied: fragmentDebit.applied,
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

  private formatCharacterPet(
    characterPet: Prisma.CharacterPetGetPayload<{
      include: typeof CHARACTER_PET_INCLUDE;
    }>,
    now: Date,
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
        rarity: characterPet.petDefinition.rarity,
        assetKey: characterPet.petDefinition.assetKey,
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
