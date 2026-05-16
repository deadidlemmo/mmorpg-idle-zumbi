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
  hasActiveAutoCombat: boolean;
  hasActiveGathering: boolean;
  hasActiveIncursion: boolean;
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
          status: {
            in: [
              IncursionSessionStatus.ACTIVE,
              IncursionSessionStatus.COMPLETED,
            ],
          },
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
    ]);

    const currentHp = this.resolveCurrentHp(character);

    return {
      character,
      currentHp,
      activeAutoCombatSession,
      activeGatheringSession,
      activeIncursionSession,
      hasActiveAutoCombat: Boolean(activeAutoCombatSession),
      hasActiveGathering: Boolean(activeGatheringSession),
      hasActiveIncursion: Boolean(activeIncursionSession),
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
          'Este personagem já está em uma incursão. Encerre ou colete a atividade atual antes de iniciar outra.',
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
          'Este personagem já está em uma incursão. Encerre ou colete a atividade atual antes de iniciar outra.',
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
        message:
          'Este personagem já possui uma incursão ativa ou pendente de coleta.',
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
