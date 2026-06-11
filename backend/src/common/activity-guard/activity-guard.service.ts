/* eslint-disable @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityStatus,
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
  CharacterStatus,
  IncursionSessionStatus,
  Prisma,
  WorldBossEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type ActivityGuardParams = {
  characterId: string;
  userId?: string;
  client?: PrismaService | Prisma.TransactionClient;
  lockCharacter?: boolean;
  worldBossEventId?: string;
};

type ActiveWorldBossParticipationSnapshot = {
  event: {
    id: string;
  };
};

type CharacterActivityState = {
  character: {
    id: string;
    name: string;
    status: CharacterStatus;
    level: number;
    currentHp: number | null;
    maxHp: number | null;
  };
  currentHp: number;
  activeAutoCombatSession: any | null;
  activeGatheringSession: any | null;
  activeCraftingSession: any | null;
  activeIncursionSession: any | null;
  activeWorldBossParticipation: ActiveWorldBossParticipationSnapshot | null;
  hasActiveAutoCombat: boolean;
  hasActiveGathering: boolean;
  hasActiveCrafting: boolean;
  hasActiveIncursion: boolean;
  hasActiveWorldBoss: boolean;
};

const ACTIVE_WORLD_BOSS_EVENT_STATUSES = [
  WorldBossEventStatus.SCHEDULED,
  WorldBossEventStatus.LOBBY_OPEN,
  WorldBossEventStatus.ACTIVE,
];

const BLOCKING_AUTO_COMBAT_PHASES = [
  AutoCombatSessionPhase.HUNTING,
  AutoCombatSessionPhase.COMBAT_ACTIVE,
];

@Injectable()
export class ActivityGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async getCharacterActivityState(
    params: ActivityGuardParams,
  ): Promise<CharacterActivityState> {
    const client = params.client ?? this.prisma;

    const character = await client.character.findFirst({
      where: {
        id: params.characterId,
        ...(params.userId ? { userId: params.userId } : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        level: true,
        currentHp: true,
        maxHp: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    if (params.lockCharacter) {
      await client.character.update({
        where: { id: character.id },
        data: { updatedAt: new Date() },
      });
    }

    const now = new Date();

    const [
      activeAutoCombatSession,
      activeGatheringSession,
      activeCraftingSession,
      activeIncursionSession,
      activeWorldBossParticipation,
    ] = await Promise.all([
      client.autoCombatSession.findFirst({
        where: {
          characterId: character.id,
          status: AutoCombatSessionStatus.ACTIVE,
          phase: {
            in: BLOCKING_AUTO_COMBAT_PHASES,
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          phase: true,
          startedAt: true,
          endsAt: true,
          lastProcessedAt: true,
          mapId: true,
          subMapId: true,
          map: {
            select: {
              id: true,
              name: true,
              tier: true,
            },
          },
          subMap: {
            select: {
              id: true,
              name: true,
              tier: true,
              map: {
                select: {
                  id: true,
                  name: true,
                  tier: true,
                },
              },
            },
          },
        },
      }),

      client.gatheringSession.findFirst({
        where: {
          characterId: character.id,
          status: ActivityStatus.ACTIVE,
        },
        orderBy: {
          startedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          origin: true,
          startedAt: true,
          lastResolvedAt: true,
          targetMaterial: {
            select: {
              id: true,
              name: true,
              tier: true,
              materialOrigin: true,
            },
          },
          map: {
            select: {
              id: true,
              name: true,
              tier: true,
            },
          },
        },
      }),

      client.craftingSession.findFirst({
        where: {
          characterId: character.id,
          status: ActivityStatus.ACTIVE,
          completesAt: {
            gt: now,
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          quantity: true,
          outputQuantity: true,
          startedAt: true,
          completesAt: true,
          outputItem: {
            select: {
              id: true,
              name: true,
              tier: true,
              slot: true,
            },
          },
        },
      }),

      client.characterIncursionSession.findFirst({
        where: {
          characterId: character.id,
          status: IncursionSessionStatus.ACTIVE,
        },
        orderBy: {
          startedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          endsAt: true,
          completedAt: true,
          incursion: {
            select: {
              id: true,
              name: true,
              tier: true,
              map: {
                select: {
                  id: true,
                  name: true,
                  tier: true,
                },
              },
            },
          },
        },
      }),

      client.worldBossParticipant.findFirst({
        where: {
          characterId: character.id,
          leftAt: null,
          event: {
            status: {
              in: ACTIVE_WORLD_BOSS_EVENT_STATUSES,
            },
            endsAt: { gt: new Date() },
          },
        },
        orderBy: {
          joinedAt: 'desc',
        },
        select: {
          id: true,
          damageDealt: true,
          contributionPercent: true,
          joinedAt: true,
          activeSeconds: true,
          event: {
            select: {
              id: true,
              status: true,
              startsAt: true,
              endsAt: true,
              worldBoss: {
                select: {
                  id: true,
                  name: true,
                  tier: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const currentHp = this.resolveCurrentHp(character);

    return {
      character,
      currentHp,
      activeAutoCombatSession,
      activeGatheringSession,
      activeCraftingSession,
      activeIncursionSession,
      activeWorldBossParticipation,
      hasActiveAutoCombat: Boolean(activeAutoCombatSession),
      hasActiveGathering: Boolean(activeGatheringSession),
      hasActiveCrafting: Boolean(activeCraftingSession),
      hasActiveIncursion: Boolean(activeIncursionSession),
      hasActiveWorldBoss: Boolean(activeWorldBossParticipation),
    };
  }

  async ensureCanStartGathering(params: ActivityGuardParams) {
    const state = await this.getCharacterActivityState(params);

    this.ensureCharacterIsActive(
      state.character.status,
      'Apenas personagens ativos podem iniciar gathering.',
    );

    this.ensureCharacterHasHp(
      state.currentHp,
      'Personagens derrotados ou com 0 de HP não podem iniciar gathering. Cure o personagem antes.',
    );

    if (state.hasActiveGathering) {
      throw new ConflictException({
        message: 'Este personagem já possui um gathering ativo.',
        activeGathering: state.activeGatheringSession,
      });
    }

    if (state.hasActiveCrafting) {
      throw new ConflictException({
        message:
          'Este personagem está fabricando um item. Aguarde a criação finalizar antes de iniciar outra atividade.',
        activeCrafting: state.activeCraftingSession,
      });
    }

    if (state.hasActiveIncursion) {
      throw new ConflictException({
        message:
          'Este personagem já está em uma incursão ativa. Aguarde finalizar antes de iniciar outra atividade.',
        activeIncursion: state.activeIncursionSession,
      });
    }

    if (state.hasActiveAutoCombat) {
      throw new ConflictException({
        message:
          'Este personagem está em auto-combate. Pare o auto-combate antes de iniciar gathering.',
        activeAutoCombat: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveWorldBoss) {
      throw new ConflictException({
        message:
          'Este personagem está em uma Ameaça Global. Saia da atividade antes de iniciar gathering.',
        activeWorldBoss: state.activeWorldBossParticipation,
      });
    }

    return state;
  }

  async ensureCanCollectGathering(params: ActivityGuardParams) {
    const state = await this.getCharacterActivityState(params);

    this.ensureCharacterIsActive(
      state.character.status,
      'Apenas personagens ativos podem coletar gathering.',
    );

    this.ensureCharacterHasHp(
      state.currentHp,
      'Personagens derrotados ou com 0 de HP não podem coletar gathering. Cure o personagem antes.',
    );

    return state;
  }

  async ensureCanStartCrafting(params: ActivityGuardParams) {
    const state = await this.getCharacterActivityState(params);

    this.ensureCharacterIsActive(
      state.character.status,
      'Apenas personagens ativos podem iniciar criação.',
    );

    this.ensureCharacterHasHp(
      state.currentHp,
      'Personagens derrotados ou com 0 de HP não podem iniciar criação. Cure o personagem antes.',
    );

    if (state.hasActiveCrafting) {
      throw new ConflictException({
        message:
          'Este personagem já possui uma fabricação em andamento. Aguarde finalizar antes de iniciar outra.',
        activeCrafting: state.activeCraftingSession,
      });
    }

    if (state.hasActiveAutoCombat) {
      throw new ConflictException({
        message:
          'Este personagem está em auto-combate. Pare o auto-combate antes de iniciar criação.',
        activeAutoCombat: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveGathering) {
      throw new ConflictException({
        message:
          'Este personagem está em gathering. Encerre o gathering antes de iniciar criação.',
        activeGathering: state.activeGatheringSession,
      });
    }

    if (state.hasActiveIncursion) {
      throw new ConflictException({
        message:
          'Este personagem está em uma incursão ativa. Aguarde finalizar antes de iniciar criação.',
        activeIncursion: state.activeIncursionSession,
      });
    }

    if (state.hasActiveWorldBoss) {
      throw new ConflictException({
        message:
          'Este personagem está em uma Ameaça Global. Saia da atividade antes de iniciar criação.',
        activeWorldBoss: state.activeWorldBossParticipation,
      });
    }

    return state;
  }

  async ensureCanStartAutoCombat(params: ActivityGuardParams) {
    const state = await this.getCharacterActivityState(params);

    this.ensureCharacterIsActive(
      state.character.status,
      'Apenas personagens ativos podem iniciar auto-combate.',
    );

    this.ensureCharacterHasHp(
      state.currentHp,
      'Personagens derrotados ou com 0 de HP não podem iniciar auto-combate. Cure o personagem antes.',
    );

    if (state.hasActiveGathering) {
      throw new ConflictException({
        message:
          'Este personagem está em gathering. Encerre o gathering antes de iniciar auto-combate.',
        activeGathering: state.activeGatheringSession,
      });
    }

    if (state.hasActiveCrafting) {
      throw new ConflictException({
        message:
          'Este personagem está fabricando um item. Aguarde a criação finalizar antes de iniciar auto-combate.',
        activeCrafting: state.activeCraftingSession,
      });
    }

    if (state.hasActiveIncursion) {
      throw new ConflictException({
        message:
          'Este personagem já está em uma incursão ativa. Aguarde finalizar antes de iniciar outra atividade.',
        activeIncursion: state.activeIncursionSession,
      });
    }

    if (state.hasActiveAutoCombat) {
      throw new ConflictException({
        message:
          'Este personagem já possui uma sessão de combate automático ativa.',
        activeAutoCombat: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveWorldBoss) {
      throw new ConflictException({
        message:
          'Este personagem está em uma Ameaça Global. Saia da atividade antes de iniciar auto-combate.',
        activeWorldBoss: state.activeWorldBossParticipation,
      });
    }

    return state;
  }

  async ensureCanStartIncursion(params: ActivityGuardParams) {
    const state = await this.getCharacterActivityState(params);

    this.ensureCharacterIsActive(
      state.character.status,
      'Apenas personagens ativos podem iniciar incursões.',
    );

    this.ensureCharacterHasHp(
      state.currentHp,
      'Personagens derrotados ou com 0 de HP não podem iniciar incursões. Cure o personagem antes.',
    );

    if (state.hasActiveIncursion) {
      throw new ConflictException({
        message: 'Este personagem já possui uma incursão ativa.',
        activeIncursion: state.activeIncursionSession,
      });
    }

    if (state.hasActiveAutoCombat) {
      throw new ConflictException({
        message:
          'Este personagem está em auto-combate. Pare o auto-combate antes de iniciar uma incursão.',
        activeAutoCombat: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveGathering) {
      throw new ConflictException({
        message:
          'Este personagem está em gathering. Encerre o gathering antes de iniciar uma incursão.',
        activeGathering: state.activeGatheringSession,
      });
    }

    if (state.hasActiveCrafting) {
      throw new ConflictException({
        message:
          'Este personagem está fabricando um item. Aguarde a criação finalizar antes de iniciar uma incursão.',
        activeCrafting: state.activeCraftingSession,
      });
    }

    if (state.hasActiveWorldBoss) {
      throw new ConflictException({
        message:
          'Este personagem está em uma Ameaça Global. Saia da atividade antes de iniciar uma incursão.',
        activeWorldBoss: state.activeWorldBossParticipation,
      });
    }

    return state;
  }

  async ensureCanStartWorldBoss(params: ActivityGuardParams) {
    const state = await this.getCharacterActivityState(params);

    this.ensureCharacterIsActive(
      state.character.status,
      'Apenas personagens ativos podem entrar em World Boss.',
    );

    this.ensureCharacterHasHp(
      state.currentHp,
      'Personagens derrotados ou com 0 de HP não podem entrar em World Boss. Cure o personagem antes.',
    );

    if (state.hasActiveAutoCombat) {
      throw new ConflictException({
        message:
          'Finalize ou pare o auto-combate antes de entrar em um World Boss.',
        activeAutoCombat: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveGathering) {
      throw new ConflictException({
        message:
          'Finalize ou encerre o gathering antes de entrar em um World Boss.',
        activeGathering: state.activeGatheringSession,
      });
    }

    if (state.hasActiveCrafting) {
      throw new ConflictException({
        message:
          'Aguarde a fabricação atual finalizar antes de entrar em um World Boss.',
        activeCrafting: state.activeCraftingSession,
      });
    }

    if (state.hasActiveIncursion) {
      throw new ConflictException({
        message:
          'Finalize ou cancele a incursão antes de entrar em um World Boss.',
        activeIncursion: state.activeIncursionSession,
      });
    }

    const activeWorldBossEventId =
      state.activeWorldBossParticipation?.event?.id ?? null;

    if (
      activeWorldBossEventId &&
      activeWorldBossEventId !== params.worldBossEventId
    ) {
      throw new ConflictException({
        message:
          'Você já está aguardando outro World Boss. Saia do lobby atual antes de entrar em outro World Boss.',
        activeWorldBoss: state.activeWorldBossParticipation,
      });
    }

    return state;
  }

  async ensureCanStartManualCombat(params: ActivityGuardParams) {
    const state = await this.getCharacterActivityState(params);

    this.ensureCharacterIsActive(
      state.character.status,
      'Apenas personagens ativos podem iniciar combate.',
    );

    this.ensureCharacterHasHp(
      state.currentHp,
      'Personagens derrotados ou com 0 de HP não podem iniciar combate. Cure o personagem antes.',
    );

    if (state.hasActiveAutoCombat) {
      throw new ConflictException({
        message:
          'Este personagem está em auto-combate. Pare o auto-combate antes de iniciar combate manual.',
        activeAutoCombat: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveGathering) {
      throw new ConflictException({
        message:
          'Este personagem está em gathering. Encerre o gathering antes de iniciar combate manual.',
        activeGathering: state.activeGatheringSession,
      });
    }

    if (state.hasActiveCrafting) {
      throw new ConflictException({
        message:
          'Este personagem está fabricando um item. Aguarde a criação finalizar antes de iniciar combate manual.',
        activeCrafting: state.activeCraftingSession,
      });
    }

    if (state.hasActiveIncursion) {
      throw new ConflictException({
        message:
          'Este personagem está em uma incursão ativa. Aguarde finalizar antes de iniciar combate manual.',
        activeIncursion: state.activeIncursionSession,
      });
    }

    if (state.hasActiveWorldBoss) {
      throw new ConflictException({
        message:
          'Este personagem está em uma Ameaça Global. Saia da atividade antes de iniciar combate manual.',
        activeWorldBoss: state.activeWorldBossParticipation,
      });
    }

    return state;
  }

  async ensureCanTravelMap(params: ActivityGuardParams) {
    const state = await this.getCharacterActivityState(params);

    this.ensureCharacterIsActive(
      state.character.status,
      'Apenas personagens ativos podem trocar de mapa.',
    );

    if (state.hasActiveAutoCombat) {
      throw new ConflictException({
        message:
          'Você não pode trocar de mapa enquanto está caçando ou em combate. Encerre o auto-combate antes de viajar.',
        activeAutoCombat: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveGathering) {
      throw new ConflictException({
        message:
          'Você não pode trocar de mapa enquanto está em gathering. Encerre a coleta antes de viajar.',
        activeGathering: state.activeGatheringSession,
      });
    }

    if (state.hasActiveCrafting) {
      throw new ConflictException({
        message:
          'Você não pode trocar de mapa enquanto está fabricando um item. Aguarde a criação finalizar antes de viajar.',
        activeCrafting: state.activeCraftingSession,
      });
    }

    if (state.hasActiveIncursion) {
      throw new ConflictException({
        message:
          'Você não pode trocar de mapa enquanto está em uma incursão ativa. Aguarde finalizar antes de viajar.',
        activeIncursion: state.activeIncursionSession,
      });
    }

    if (state.hasActiveWorldBoss) {
      throw new ConflictException({
        message:
          'Você não pode trocar de mapa enquanto está em uma Ameaça Global. Saia da atividade antes de viajar.',
        activeWorldBoss: state.activeWorldBossParticipation,
      });
    }

    return state;
  }

  async ensureCanUseInfirmary(params: ActivityGuardParams) {
    const state = await this.getCharacterActivityState(params);

    if (state.hasActiveAutoCombat) {
      throw new ConflictException({
        message: 'Não é possível usar a enfermaria durante auto-combate ativo.',
        activeAutoCombatSession: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveGathering) {
      throw new ConflictException({
        message:
          'Não é possível usar a enfermaria durante gathering. Encerre o gathering antes de curar.',
        activeGatheringSession: state.activeGatheringSession,
      });
    }

    if (state.hasActiveCrafting) {
      throw new ConflictException({
        message:
          'Não é possível usar a enfermaria durante uma fabricação ativa.',
        activeCraftingSession: state.activeCraftingSession,
      });
    }

    if (state.hasActiveIncursion) {
      throw new ConflictException({
        message: 'Nao e possivel usar a enfermaria durante uma incursao ativa.',
        activeIncursionSession: state.activeIncursionSession,
      });
    }

    if (state.hasActiveWorldBoss) {
      throw new ConflictException({
        message:
          'Não é possível usar a enfermaria enquanto você está aguardando ou participando de um World Boss.',
        activeWorldBossSession: state.activeWorldBossParticipation,
      });
    }

    if (state.character.status === CharacterStatus.BLOCKED) {
      throw new BadRequestException(
        'Personagem bloqueado não pode usar a enfermaria.',
      );
    }

    return state;
  }

  async stopActivitiesForDefeatedCharacter(params: {
    characterId: string;
    client?: PrismaService | Prisma.TransactionClient;
    now?: Date;
  }) {
    const client = params.client ?? this.prisma;
    const now = params.now ?? new Date();

    await client.gatheringSession.updateMany({
      where: {
        characterId: params.characterId,
        status: ActivityStatus.ACTIVE,
      },
      data: {
        status: ActivityStatus.STOPPED,
      },
    });

    await client.craftingSession.updateMany({
      where: {
        characterId: params.characterId,
        status: ActivityStatus.ACTIVE,
      },
      data: {
        status: ActivityStatus.STOPPED,
      },
    });

    await client.characterIncursionSession.updateMany({
      where: {
        characterId: params.characterId,
        status: IncursionSessionStatus.ACTIVE,
      },
      data: {
        status: IncursionSessionStatus.CANCELLED,
        completedAt: null,
      },
    });

    await client.worldBossParticipant.updateMany({
      where: {
        characterId: params.characterId,
        leftAt: null,
        event: {
          status: {
            in: ACTIVE_WORLD_BOSS_EVENT_STATUSES,
          },
          endsAt: {
            gt: now,
          },
        },
      },
      data: {
        leftAt: now,
      },
    });
  }

  private ensureCharacterIsActive(status: CharacterStatus, message: string) {
    if (status !== CharacterStatus.ACTIVE) {
      throw new BadRequestException(message);
    }
  }

  private ensureCharacterHasHp(currentHp: number, message: string) {
    if (currentHp <= 0) {
      throw new BadRequestException(message);
    }
  }

  private resolveCurrentHp(character: {
    currentHp: number | null;
    maxHp: number | null;
  }) {
    return character.currentHp ?? character.maxHp ?? 0;
  }
}
