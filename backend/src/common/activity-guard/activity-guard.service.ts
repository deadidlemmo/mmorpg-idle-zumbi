/* eslint-disable @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityStatus,
  AutoCombatSessionStatus,
  CharacterStatus,
  IncursionSessionStatus,
  WorldBossEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type ActivityGuardParams = {
  characterId: string;
  userId?: string;
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
  activeIncursionSession: any | null;
  activeWorldBossParticipation: any | null;
  hasActiveAutoCombat: boolean;
  hasActiveGathering: boolean;
  hasActiveIncursion: boolean;
  hasActiveWorldBoss: boolean;
};

@Injectable()
export class ActivityGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async getCharacterActivityState(
    params: ActivityGuardParams,
  ): Promise<CharacterActivityState> {
    const character = await this.prisma.character.findFirst({
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

    const [
      activeAutoCombatSession,
      activeGatheringSession,
      activeIncursionSession,
      activeWorldBossParticipation,
    ] = await Promise.all([
      this.prisma.autoCombatSession.findFirst({
        where: {
          characterId: character.id,
          status: AutoCombatSessionStatus.ACTIVE,
        },
        orderBy: {
          startedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          endsAt: true,
          lastProcessedAt: true,
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

      this.prisma.gatheringSession.findFirst({
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

      this.prisma.characterIncursionSession.findFirst({
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

      this.prisma.worldBossParticipant.findFirst({
        where: {
          characterId: character.id,
          event: {
            status: WorldBossEventStatus.ACTIVE,
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
      activeIncursionSession,
      activeWorldBossParticipation,
      hasActiveAutoCombat: Boolean(activeAutoCombatSession),
      hasActiveGathering: Boolean(activeGatheringSession),
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
      throw new BadRequestException({
        message: 'Este personagem já possui um gathering ativo.',
        activeGathering: state.activeGatheringSession,
      });
    }

    if (state.hasActiveIncursion) {
      throw new BadRequestException({
        message:
          'Este personagem já está em uma incursão ativa. Aguarde finalizar antes de iniciar outra atividade.',
        activeIncursion: state.activeIncursionSession,
      });
    }

    if (state.hasActiveAutoCombat) {
      throw new BadRequestException({
        message:
          'Este personagem está em auto-combate. Pare o auto-combate antes de iniciar gathering.',
        activeAutoCombat: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveWorldBoss) {
      throw new BadRequestException({
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
      throw new BadRequestException({
        message:
          'Este personagem está em gathering. Encerre o gathering antes de iniciar auto-combate.',
        activeGathering: state.activeGatheringSession,
      });
    }

    if (state.hasActiveIncursion) {
      throw new BadRequestException({
        message:
          'Este personagem já está em uma incursão ativa. Aguarde finalizar antes de iniciar outra atividade.',
        activeIncursion: state.activeIncursionSession,
      });
    }

    if (state.hasActiveAutoCombat) {
      throw new BadRequestException({
        message:
          'Este personagem já possui uma sessão de combate automático ativa.',
        activeAutoCombat: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveWorldBoss) {
      throw new BadRequestException({
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
      throw new BadRequestException({
        message: 'Este personagem já possui uma incursão ativa.',
        activeIncursion: state.activeIncursionSession,
      });
    }

    if (state.hasActiveAutoCombat) {
      throw new BadRequestException({
        message:
          'Este personagem está em auto-combate. Pare o auto-combate antes de iniciar uma incursão.',
        activeAutoCombat: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveGathering) {
      throw new BadRequestException({
        message:
          'Este personagem está em gathering. Encerre o gathering antes de iniciar uma incursão.',
        activeGathering: state.activeGatheringSession,
      });
    }

    if (state.hasActiveWorldBoss) {
      throw new BadRequestException({
        message:
          'Este personagem está em uma Ameaça Global. Saia da atividade antes de iniciar uma incursão.',
        activeWorldBoss: state.activeWorldBossParticipation,
      });
    }

    return state;
  }

  async ensureCanUseInfirmary(params: ActivityGuardParams) {
    const state = await this.getCharacterActivityState(params);

    if (state.hasActiveAutoCombat) {
      throw new BadRequestException({
        message: 'Não é possível usar a enfermaria durante auto-combate ativo.',
        activeAutoCombatSession: state.activeAutoCombatSession,
      });
    }

    if (state.hasActiveGathering) {
      throw new BadRequestException({
        message:
          'Não é possível usar a enfermaria durante gathering. Encerre o gathering antes de curar.',
        activeGatheringSession: state.activeGatheringSession,
      });
    }

    if (state.character.status === CharacterStatus.BLOCKED) {
      throw new BadRequestException(
        'Personagem bloqueado não pode usar a enfermaria.',
      );
    }

    return state;
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
