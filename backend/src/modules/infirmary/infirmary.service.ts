import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CharacterStatus } from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import {
  calculateFullStats,
  calculateGatheringPrimaryBonus,
} from '../../common/utils/stats.util';
import { PrismaService } from '../../prisma/prisma.service';

const FREE_TREATMENT_SECONDS = 30 * 60;
const PRIVATE_DOCTOR_BASE_GOLD = 10;
const PRIVATE_DOCTOR_LEVEL_GOLD = 3;
const PRIVATE_DOCTOR_MISSING_HP_FACTOR = 0.15;

@Injectable()
export class InfirmaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityGuard: ActivityGuardService,
  ) {}

  async getStatus(userId: string, characterId: string) {
    const character = await this.findResolvedCharacter(userId, characterId);
    const activityState = await this.activityGuard.getCharacterActivityState({
      characterId: character.id,
      userId,
    });

    return this.buildStatusResponse(character, activityState);
  }

  async startTreatment(userId: string, characterId: string) {
    const character = await this.findResolvedCharacter(userId, characterId);

    await this.activityGuard.ensureCanUseInfirmary({
      characterId: character.id,
      userId,
    });

    const maxHp = this.calculateCharacterMaxHp(character);
    const currentHp = this.clampHp(character.currentHp ?? maxHp, maxHp);

    if (this.hasActiveTreatment(character)) {
      throw new ConflictException(
        'Este personagem ja esta em atendimento na enfermaria.',
      );
    }

    if (currentHp >= maxHp && character.status !== CharacterStatus.DEAD) {
      throw new BadRequestException('Personagem ja esta com HP cheio.');
    }

    const startedAt = new Date();
    const endsAt = new Date(
      startedAt.getTime() + FREE_TREATMENT_SECONDS * 1000,
    );

    await this.prisma.character.update({
      where: { id: character.id },
      data: {
        infirmaryStartedAt: startedAt,
        infirmaryEndsAt: endsAt,
      },
    });

    const response = await this.getStatus(userId, character.id);

    return {
      message:
        'Atendimento gratuito iniciado. O sobrevivente ficara em observacao por 30 minutos.',
      ...response,
    };
  }

  async claimTreatment(userId: string, characterId: string) {
    const character = await this.findCharacterWithStats(userId, characterId);

    await this.activityGuard.ensureCanUseInfirmary({
      characterId: character.id,
      userId,
    });

    if (!character.infirmaryEndsAt) {
      throw new BadRequestException(
        'Este personagem nao possui atendimento em andamento.',
      );
    }

    const remainingSeconds = this.getRemainingTreatmentSeconds(character);

    if (remainingSeconds > 0) {
      throw new BadRequestException(
        `O atendimento ainda termina em ${remainingSeconds} segundos.`,
      );
    }

    const recovered = await this.recoverCharacter(character, userId);
    const response = await this.getStatus(userId, recovered.id);

    return {
      message: 'Atendimento concluido. Personagem recuperado com sucesso.',
      ...response,
    };
  }

  async cancelTreatment(userId: string, characterId: string) {
    const character = await this.findCharacterWithStats(userId, characterId);

    await this.activityGuard.ensureCanUseInfirmary({
      characterId: character.id,
      userId,
    });

    if (!character.infirmaryEndsAt) {
      throw new BadRequestException(
        'Este personagem nao possui atendimento gratuito em andamento.',
      );
    }

    await this.prisma.character.update({
      where: { id: character.id },
      data: {
        infirmaryStartedAt: null,
        infirmaryEndsAt: null,
      },
    });

    const response = await this.getStatus(userId, character.id);

    return {
      message:
        'Atendimento gratuito cancelado. Atendimento particular liberado.',
      ...response,
    };
  }

  async instantTreatment(userId: string, characterId: string) {
    const character = await this.findResolvedCharacter(userId, characterId);

    await this.activityGuard.ensureCanUseInfirmary({
      characterId: character.id,
      userId,
    });

    const maxHp = this.calculateCharacterMaxHp(character);
    const currentHp = this.clampHp(character.currentHp ?? maxHp, maxHp);
    const missingHp = Math.max(0, maxHp - currentHp);

    if (this.hasActiveTreatment(character)) {
      throw new ConflictException(
        'Cancele ou conclua o atendimento gratuito antes de pagar atendimento particular.',
      );
    }

    if (missingHp <= 0 && character.status !== CharacterStatus.DEAD) {
      throw new BadRequestException('Personagem ja esta com HP cheio.');
    }

    const cost = this.calculateInstantCost(character, missingHp);

    const result = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.character.updateMany({
        where: {
          id: character.id,
          userId,
          gold: {
            gte: cost,
          },
        },
        data: {
          gold: {
            decrement: cost,
          },
          currentHp: maxHp,
          maxHp,
          status:
            character.status === CharacterStatus.DEAD
              ? CharacterStatus.ACTIVE
              : character.status,
          infirmaryStartedAt: null,
          infirmaryEndsAt: null,
        },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException(
          `Gold insuficiente para atendimento particular. Custo: ${cost} Gold.`,
        );
      }

      return tx.character.findFirst({
        where: {
          id: character.id,
          userId,
        },
      });
    });

    if (!result) {
      throw new NotFoundException('Personagem nao encontrado.');
    }

    const response = await this.getStatus(userId, result.id);

    return {
      message: `Atendimento particular realizado por ${cost} Gold.`,
      ...response,
      cost: {
        type: 'PRIVATE_DOCTOR',
        amount: cost,
        currency: 'GOLD',
      },
    };
  }

  async heal(userId: string, characterId: string) {
    return this.instantTreatment(userId, characterId);
  }

  private async findResolvedCharacter(userId: string, characterId: string) {
    const character = await this.findCharacterWithStats(userId, characterId);

    if (!character.infirmaryEndsAt) {
      return character;
    }

    if (this.getRemainingTreatmentSeconds(character) > 0) {
      return character;
    }

    return this.recoverCharacter(character, userId);
  }

  private async recoverCharacter(character: any, userId: string) {
    const maxHp = this.calculateCharacterMaxHp(character);

    await this.prisma.character.update({
      where: { id: character.id },
      data: {
        currentHp: maxHp,
        maxHp,
        status:
          character.status === CharacterStatus.DEAD
            ? CharacterStatus.ACTIVE
            : character.status,
        infirmaryStartedAt: null,
        infirmaryEndsAt: null,
      },
    });

    return this.findCharacterWithStats(userId, character.id);
  }

  private buildStatusResponse(character: any, activityState: any) {
    const maxHp = this.calculateCharacterMaxHp(character);
    const currentHp = this.clampHp(character.currentHp ?? maxHp, maxHp);
    const missingHp = Math.max(0, maxHp - currentHp);
    const treatment = this.buildTreatmentState(character);
    const canUse = this.canUseInfirmary(character, activityState);

    let reason = 'Personagem pode usar a enfermaria.';

    if (!canUse) {
      reason = this.getBlockedReason(character, activityState);
    } else if (treatment.active) {
      reason =
        treatment.remainingSeconds > 0
          ? 'Atendimento gratuito em andamento.'
          : 'Atendimento finalizado. Conclua para recuperar o personagem.';
    } else if (missingHp <= 0 && character.status !== CharacterStatus.DEAD) {
      reason = 'Personagem ja esta com HP cheio.';
    }

    const instantCost = this.calculateInstantCost(character, missingHp);

    return {
      character: {
        id: character.id,
        name: character.name,
        status: character.status,
        level: character.level,
        xp: character.xp,
        currentHp,
        maxHp,
        gold: character.gold ?? 0,
        cash: character.cash ?? 0,
      },
      infirmary: {
        canUse,
        canHeal: canUse && missingHp > 0,
        canStartTreatment:
          canUse &&
          !treatment.active &&
          (missingHp > 0 || character.status === CharacterStatus.DEAD),
        canClaimTreatment:
          canUse && treatment.active && treatment.remainingSeconds <= 0,
        canInstantTreatment:
          canUse &&
          !treatment.active &&
          (missingHp > 0 || character.status === CharacterStatus.DEAD),
        reason,
        currentHp,
        maxHp,
        missingHp,
        isDefeated:
          character.status === CharacterStatus.DEAD || currentHp <= 0,
        treatment,
        durationSeconds: FREE_TREATMENT_SECONDS,
        hasActiveAutoCombat: activityState.hasActiveAutoCombat,
        hasActiveGathering: activityState.hasActiveGathering,
        hasActiveCrafting: activityState.hasActiveCrafting,
        hasActiveIncursion: activityState.hasActiveIncursion,
        hasActiveWorldBoss: activityState.hasActiveWorldBoss,
        activeAutoCombatSession: activityState.activeAutoCombatSession,
        activeGatheringSession: activityState.activeGatheringSession,
        activeCraftingSession: activityState.activeCraftingSession,
        activeIncursionSession: activityState.activeIncursionSession,
        activeWorldBossParticipation:
          activityState.activeWorldBossParticipation,
        costs: {
          free: {
            type: 'SUS',
            amount: 0,
            durationSeconds: FREE_TREATMENT_SECONDS,
          },
          instant: {
            type: 'PRIVATE_DOCTOR',
            amount: instantCost,
            currency: 'GOLD',
          },
        },
        cost: {
          type: 'PRIVATE_DOCTOR',
          amount: instantCost,
          currency: 'GOLD',
        },
      },
    };
  }

  private buildTreatmentState(character: any) {
    const startedAt = character.infirmaryStartedAt
      ? new Date(character.infirmaryStartedAt)
      : null;
    const endsAt = character.infirmaryEndsAt
      ? new Date(character.infirmaryEndsAt)
      : null;
    const remainingSeconds = this.getRemainingTreatmentSeconds(character);
    const elapsedSeconds =
      startedAt && endsAt
        ? Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000))
        : 0;
    const progressPercent = endsAt
      ? Math.max(
          0,
          Math.min(
            100,
            ((FREE_TREATMENT_SECONDS - remainingSeconds) /
              FREE_TREATMENT_SECONDS) *
              100,
          ),
        )
      : 0;

    return {
      active: Boolean(endsAt),
      startedAt: startedAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
      remainingSeconds,
      elapsedSeconds,
      progressPercent,
    };
  }

  private canUseInfirmary(character: any, activityState: any) {
    return (
      !activityState.hasActiveAutoCombat &&
      !activityState.hasActiveGathering &&
      !activityState.hasActiveCrafting &&
      !activityState.hasActiveIncursion &&
      !activityState.hasActiveWorldBoss &&
      character.status !== CharacterStatus.BLOCKED
    );
  }

  private getBlockedReason(character: any, activityState: any) {
    if (activityState.hasActiveAutoCombat) {
      return 'Nao e possivel usar a enfermaria durante auto-combate ativo.';
    }

    if (activityState.hasActiveGathering) {
      return 'Nao e possivel usar a enfermaria durante gathering ativo.';
    }

    if (activityState.hasActiveCrafting) {
      return 'Nao e possivel usar a enfermaria durante criacao ativa.';
    }

    if (activityState.hasActiveIncursion) {
      return 'Nao e possivel usar a enfermaria durante incursao ativa.';
    }

    if (activityState.hasActiveWorldBoss) {
      return 'Nao e possivel usar a enfermaria durante uma Ameaca Global.';
    }

    if (character.status === CharacterStatus.BLOCKED) {
      return 'Personagem bloqueado nao pode usar a enfermaria.';
    }

    return 'Enfermaria indisponivel no momento.';
  }

  private hasActiveTreatment(character: any) {
    return Boolean(character.infirmaryEndsAt);
  }

  private getRemainingTreatmentSeconds(character: any) {
    if (!character.infirmaryEndsAt) {
      return 0;
    }

    const endsAt = new Date(character.infirmaryEndsAt).getTime();

    return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  }

  private calculateInstantCost(character: any, missingHp: number) {
    if (missingHp <= 0 && character.status !== CharacterStatus.DEAD) {
      return 0;
    }

    const levelCost =
      Math.max(1, character.level ?? 1) * PRIVATE_DOCTOR_LEVEL_GOLD;
    const hpCost = Math.ceil(
      Math.max(0, missingHp) * PRIVATE_DOCTOR_MISSING_HP_FACTOR,
    );

    return Math.max(20, PRIVATE_DOCTOR_BASE_GOLD + levelCost + hpCost);
  }

  private async findCharacterWithStats(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
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
      throw new NotFoundException('Personagem nao encontrado.');
    }

    return character;
  }

  private calculateCharacterMaxHp(character: any) {
    const equipmentItems = [
      character.equipment?.mainHand,
      character.equipment?.offHand,
      character.equipment?.head,
      character.equipment?.armor,
      character.equipment?.pants,
      character.equipment?.boots,
    ];
    const gatheringBonus = calculateGatheringPrimaryBonus(
      character.gatheringSkills,
    );

    const stats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
      gatheringBonus,
    );

    return stats.derivedCombatStats.maxHp;
  }

  private clampHp(currentHp: number, maxHp: number) {
    return Math.max(0, Math.min(currentHp, maxHp));
  }
}
