import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CharacterStatus } from '@prisma/client';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import { calculateFullStats } from '../../common/utils/stats.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InfirmaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityGuard: ActivityGuardService,
  ) {}

  async getStatus(userId: string, characterId: string) {
    const character = await this.findCharacterWithStats(userId, characterId);

    const activityState =
      await this.activityGuard.getCharacterActivityState({
        characterId: character.id,
        userId,
      });

    const maxHp = this.calculateCharacterMaxHp(character);
    const currentHp = this.clampHp(character.currentHp ?? maxHp, maxHp);
    const missingHp = Math.max(0, maxHp - currentHp);

    let canHeal = true;
    let reason = 'Personagem pode ser curado na enfermaria.';

    if (activityState.hasActiveAutoCombat) {
      canHeal = false;
      reason = 'Não é possível usar a enfermaria durante auto-combate ativo.';
    } else if (activityState.hasActiveGathering) {
      canHeal = false;
      reason =
        'Não é possível usar a enfermaria durante gathering. Encerre o gathering antes de curar.';
    } else if (character.status === CharacterStatus.BLOCKED) {
      canHeal = false;
      reason = 'Personagem bloqueado não pode usar a enfermaria.';
    } else if (missingHp <= 0) {
      canHeal = false;
      reason = 'Personagem já está com HP cheio.';
    }

    return {
      character: {
        id: character.id,
        name: character.name,
        status: character.status,
        level: character.level,
        xp: character.xp,
        currentHp,
        maxHp,
      },
      infirmary: {
        canHeal,
        reason,
        currentHp,
        maxHp,
        missingHp,
        hasActiveAutoCombat: activityState.hasActiveAutoCombat,
        hasActiveGathering: activityState.hasActiveGathering,
        activeAutoCombatSession: activityState.activeAutoCombatSession,
        activeGatheringSession: activityState.activeGatheringSession,
        cost: {
          type: 'FREE_MVP',
          amount: 0,
        },
      },
    };
  }

  async heal(userId: string, characterId: string) {
    const character = await this.findCharacterWithStats(userId, characterId);

    await this.activityGuard.ensureCanUseInfirmary({
      characterId: character.id,
      userId,
    });

    const maxHp = this.calculateCharacterMaxHp(character);
    const oldHp = this.clampHp(character.currentHp ?? maxHp, maxHp);

    if (oldHp >= maxHp) {
      throw new BadRequestException('Personagem já está com HP cheio.');
    }

    const healedCharacter = await this.prisma.character.update({
      where: {
        id: character.id,
      },
      data: {
        currentHp: maxHp,
        maxHp,
        status:
          character.status === CharacterStatus.DEAD
            ? CharacterStatus.ACTIVE
            : character.status,
      },
    });

    return {
      message: 'Personagem curado na enfermaria com sucesso.',
      character: {
        id: healedCharacter.id,
        name: healedCharacter.name,
        status: healedCharacter.status,
        level: healedCharacter.level,
        xp: healedCharacter.xp,
        currentHp: healedCharacter.currentHp,
        maxHp: healedCharacter.maxHp,
      },
      healing: {
        oldHp,
        newHp: maxHp,
        maxHp,
        healedAmount: maxHp - oldHp,
      },
      cost: {
        type: 'FREE_MVP',
        amount: 0,
      },
    };
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
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
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

    const stats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
    );

    return stats.derivedCombatStats.maxHp;
  }

  private clampHp(currentHp: number, maxHp: number) {
    return Math.max(0, Math.min(currentHp, maxHp));
  }
}