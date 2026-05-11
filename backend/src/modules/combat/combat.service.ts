import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CombatActor,
  CombatStatus,
  InventoryItemType,
  ItemSlot,
} from '@prisma/client';
import { calculateCombatHit } from '../../common/utils/combat-damage.util';
import { calculateLevelProgress } from '../../common/utils/level.util';
import { calculateFullStats } from '../../common/utils/stats.util';
import { PrismaService } from '../../prisma/prisma.service';
import { StartCombatDto } from './dto/start-combat.dto';

type FighterStats = {
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  precision: number;
  technique: number;
  agility: number;
};

type CombatLogEntry = {
  round: number;
  actor: CombatActor;
  message: string;
  damage: number;
};

type CombatWinner = 'PLAYER' | 'MOB';

type AutoPotionState = {
  enabled: boolean;
  potionItemId: string;
  potionItemName: string;
  hpThresholdPercent: number;
  healFlat: number;
  healPercent: number;
  availableQuantity: number;
  usedQuantity: number;
  totalHealed: number;
};

type AutoPotionUseResult = {
  used: boolean;
  newHp: number;
  healedAmount: number;
};

type CombatSimulationResult = {
  winner: CombatWinner;
  rounds: number;
  playerEndHp: number;
  mobEndHp: number;
  logs: CombatLogEntry[];

  damageDealtByPlayer: number;
  damageTakenByPlayer: number;
  healingReceivedByPlayer: number;

  criticalHitsByPlayer: number;
  criticalHitsByMob: number;
  criticalBonusDamageByPlayer: number;
  criticalBonusDamageByMob: number;

  potionsUsed: number;
  healingFromPotions: number;
  potionItemId: string | null;
  potionItemName: string | null;
  potionTriggerPercent: number | null;
};

@Injectable()
export class CombatService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, startCombatDto: StartCombatDto) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: startCombatDto.characterId,
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
        potionConfig: {
          include: {
            potionItem: true,
          },
        },
        inventoryItems: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const equipmentItems = this.getEquipmentItems(character);

    const oldStats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
    );

    const oldMaxHp = oldStats.derivedCombatStats.maxHp;

    const oldCurrentHp = this.clampHp(
      character.currentHp ?? oldMaxHp,
      oldMaxHp,
    );

    if (oldCurrentHp <= 0) {
      throw new BadRequestException(
        'Este personagem está sem HP e não pode iniciar combate.',
      );
    }

    const mob = await this.prisma.mob.findUnique({
      where: {
        id: startCombatDto.mobId,
      },
      include: {
        drops: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!mob) {
      throw new NotFoundException('Mob não encontrado.');
    }

    const playerStats: FighterStats = {
      name: character.name,
      hp: oldCurrentHp,
      maxHp: oldMaxHp,
      attack: oldStats.derivedCombatStats.attack,
      defense: oldStats.derivedCombatStats.defense,
      speed: oldStats.derivedCombatStats.speed,
      precision: oldStats.totalPrimaryStats.precision,
      technique: oldStats.totalPrimaryStats.technique,
      agility: oldStats.totalPrimaryStats.agility,
    };

    const mobStats = this.calculateMobFighterStats(mob);

    const autoPotionState = this.createAutoPotionState(character);

    const simulation = this.resolveTurnCombat(
      playerStats,
      mobStats,
      autoPotionState,
    );

    const playerWon = simulation.winner === 'PLAYER';

    const combatStatus = playerWon
      ? CombatStatus.PLAYER_WIN
      : CombatStatus.PLAYER_LOSE;

    const xpGained = playerWon ? mob.xpReward : 0;

    const levelProgress = calculateLevelProgress(
      character.level,
      character.xp,
      xpGained,
    );

    const newStats = calculateFullStats(
      character.class,
      equipmentItems,
      levelProgress.newLevel,
    );

    const newMaxHp = newStats.derivedCombatStats.maxHp;

    const hpBeforeLevelUpRecovery = playerWon
      ? Math.max(0, simulation.playerEndHp)
      : 0;

    const finalCurrentHp = playerWon
      ? this.calculateCurrentHpAfterCombatWin({
          playerEndHp: simulation.playerEndHp,
          oldMaxHp,
          newMaxHp,
          levelsGained: levelProgress.levelsGained,
        })
      : 0;

    const healingFromLevelUp = Math.max(
      0,
      finalCurrentHp - hpBeforeLevelUpRecovery,
    );

    const totalHealingReceived =
      simulation.healingReceivedByPlayer + healingFromLevelUp;

    const rewards: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
    }> = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const combat = await tx.combat.create({
        data: {
          characterId: character.id,
          mobId: mob.id,
          status: combatStatus,
          playerStartHp: playerStats.hp,
          playerEndHp: simulation.playerEndHp,
          mobStartHp: mobStats.hp,
          mobEndHp: simulation.mobEndHp,
          xpGained,
          finishedAt: new Date(),
          logs: {
            create: simulation.logs,
          },
        },
        include: {
          character: true,
          mob: true,
          logs: {
            orderBy: {
              round: 'asc',
            },
          },
        },
      });

      await tx.character.update({
        where: {
          id: character.id,
        },
        data: {
          xp: levelProgress.totalXp,
          level: levelProgress.newLevel,
          currentHp: finalCurrentHp,
          maxHp: newMaxHp,
        },
      });

      if (playerWon) {
        for (const drop of mob.drops) {
          const roll = Math.floor(Math.random() * 100) + 1;

          if (roll <= drop.dropChance) {
            const quantity = this.randomBetween(
              drop.minQuantity,
              drop.maxQuantity,
            );

            await tx.inventoryItem.upsert({
              where: {
                characterId_itemId: {
                  characterId: character.id,
                  itemId: drop.itemId,
                },
              },
              update: {
                quantity: {
                  increment: quantity,
                },
              },
              create: {
                characterId: character.id,
                itemId: drop.itemId,
                quantity,
                type: this.getInventoryItemType(drop.item.slot),
              },
            });

            rewards.push({
              itemId: drop.itemId,
              itemName: drop.item.name,
              quantity,
            });
          }
        }
      }

      if (simulation.potionsUsed > 0 && simulation.potionItemId) {
        const potionInventoryItem = await tx.inventoryItem.findUnique({
          where: {
            characterId_itemId: {
              characterId: character.id,
              itemId: simulation.potionItemId,
            },
          },
        });

        if (potionInventoryItem) {
          if (potionInventoryItem.quantity <= simulation.potionsUsed) {
            await tx.inventoryItem.delete({
              where: {
                id: potionInventoryItem.id,
              },
            });
          } else {
            await tx.inventoryItem.update({
              where: {
                id: potionInventoryItem.id,
              },
              data: {
                quantity: {
                  decrement: simulation.potionsUsed,
                },
              },
            });
          }
        }
      }

      return combat;
    });

    const hpChange = finalCurrentHp - playerStats.hp;
    const hpLostNet = Math.max(0, playerStats.hp - finalCurrentHp);
    const hpRecoveredNet = Math.max(0, finalCurrentHp - playerStats.hp);

    return {
      combatId: result.id,
      status: result.status,

      character: {
        id: character.id,
        name: character.name,
        class: character.class.name,
        oldLevel: character.level,
        newLevel: levelProgress.newLevel,
        oldXp: character.xp,
        newXp: levelProgress.totalXp,
      },

      mob: {
        id: mob.id,
        name: mob.name,
        level: mob.level,
        tier: mob.tier,
      },

      result: {
        winner: simulation.winner,
        rounds: simulation.rounds,

        playerStartHp: playerStats.hp,
        playerEndHp: simulation.playerEndHp,
        playerFinalSavedHp: finalCurrentHp,

        oldMaxHp,
        newMaxHp,
        maxHpGained: Math.max(0, newMaxHp - oldMaxHp),

        mobStartHp: mobStats.hp,
        mobEndHp: simulation.mobEndHp,

        xpGained,
        rewards,

        damage: {
          dealt: simulation.damageDealtByPlayer,
          taken: simulation.damageTakenByPlayer,
        },

        healing: {
          fromPotions: simulation.healingFromPotions,
          fromLevelUp: healingFromLevelUp,
          total: totalHealingReceived,
        },

        hp: {
          initial: playerStats.hp,
          final: finalCurrentHp,
          change: hpChange,
          lostNet: hpLostNet,
          recoveredNet: hpRecoveredNet,
          tookDamage: simulation.damageTakenByPlayer > 0,
          wasHealed: totalHealingReceived > 0,
        },

        critical: {
          hitsDealt: simulation.criticalHitsByPlayer,
          hitsTaken: simulation.criticalHitsByMob,
          bonusDamageDealt: simulation.criticalBonusDamageByPlayer,
          bonusDamageTaken: simulation.criticalBonusDamageByMob,
          dealtAny: simulation.criticalHitsByPlayer > 0,
          tookAny: simulation.criticalHitsByMob > 0,
        },

        potion: {
          usedQuantity: simulation.potionsUsed,
          healing: simulation.healingFromPotions,
          itemId: simulation.potionItemId,
          itemName: simulation.potionItemName,
          triggerPercent: simulation.potionTriggerPercent,
        },
      },

      levelProgress: {
        oldLevel: levelProgress.oldLevel,
        newLevel: levelProgress.newLevel,
        leveledUp: levelProgress.leveledUp,
        levelsGained: levelProgress.levelsGained,
        currentXp: levelProgress.currentXp,
        gainedXp: levelProgress.gainedXp,
        totalXp: levelProgress.totalXp,
        xpIntoCurrentLevel: levelProgress.xpIntoCurrentLevel,
        xpNeededForNextLevel: levelProgress.xpNeededForNextLevel,
        nextLevelRequiredXp: levelProgress.nextLevelRequiredXp,
        progressPercent: levelProgress.progressPercent,
        levelCap: levelProgress.levelCap,
        isAtLevelCap: levelProgress.isAtLevelCap,
      },

      statsBeforeCombat: this.buildStatsResponse(oldStats),
      statsAfterCombat: this.buildStatsResponse(newStats),

      logs: result.logs,
    };
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

  private buildStatsResponse(stats: ReturnType<typeof calculateFullStats>) {
    return {
      level: stats.level,
      basePrimaryStats: stats.basePrimaryStats,
      levelBonusStats: stats.levelBonusStats,
      equipmentBonusStats: stats.equipmentBonusStats,
      totalPrimaryStats: stats.totalPrimaryStats,
      derivedCombatStats: stats.derivedCombatStats,
    };
  }

  private calculateCurrentHpAfterCombatWin(params: {
    playerEndHp: number;
    oldMaxHp: number;
    newMaxHp: number;
    levelsGained: number;
  }) {
    const { playerEndHp, oldMaxHp, newMaxHp, levelsGained } = params;

    const safePlayerEndHp = Math.max(0, playerEndHp);

    if (safePlayerEndHp <= 0) {
      return 0;
    }

    const maxHpDifference = Math.max(0, newMaxHp - oldMaxHp);

    const levelUpBonusHeal =
      levelsGained > 0 ? Math.floor(newMaxHp * 0.05 * levelsGained) : 0;

    return this.clampHp(
      safePlayerEndHp + maxHpDifference + levelUpBonusHeal,
      newMaxHp,
    );
  }

  private resolveTurnCombat(
    player: FighterStats,
    mob: FighterStats,
    autoPotionState?: AutoPotionState | null,
  ): CombatSimulationResult {
    const logs: CombatLogEntry[] = [];

    let playerHp = player.hp;
    let mobHp = mob.hp;

    let round = 1;
    const maxRounds = 30;

    let potionUsedThisCombat = false;

    let damageDealtByPlayer = 0;
    let damageTakenByPlayer = 0;
    let healingReceivedByPlayer = 0;

    let criticalHitsByPlayer = 0;
    let criticalHitsByMob = 0;
    let criticalBonusDamageByPlayer = 0;
    let criticalBonusDamageByMob = 0;

    const playerStarts = player.speed >= mob.speed;

    while (playerHp > 0 && mobHp > 0 && round <= maxRounds) {
      logs.push({
        round,
        actor: CombatActor.SYSTEM,
        message: `Rodada ${round} iniciada.`,
        damage: 0,
      });

      const potionBeforeAction = this.tryUseAutoPotion({
        currentHp: playerHp,
        maxHp: player.maxHp,
        autoPotionState,
        potionUsedThisCombat,
      });

      if (potionBeforeAction.used) {
        playerHp = potionBeforeAction.newHp;
        healingReceivedByPlayer += potionBeforeAction.healedAmount;
        potionUsedThisCombat = true;

        logs.push({
          round,
          actor: CombatActor.SYSTEM,
          message: `${player.name} usou ${autoPotionState?.potionItemName} e recuperou ${potionBeforeAction.healedAmount} de HP.`,
          damage: 0,
        });
      }

      if (playerStarts) {
        const playerHit = this.calculateHit(player, mob);
        const effectivePlayerDamage = Math.min(mobHp, playerHit.finalDamage);

        mobHp -= playerHit.finalDamage;
        damageDealtByPlayer += Math.max(0, effectivePlayerDamage);

        if (playerHit.isCritical) {
          criticalHitsByPlayer++;
          criticalBonusDamageByPlayer += playerHit.criticalBonusDamage;
        }

        logs.push({
          round,
          actor: CombatActor.PLAYER,
          message: playerHit.isCritical
            ? `${player.name} acertou um CRÍTICO em ${mob.name} e causou ${playerHit.finalDamage} de dano.`
            : `${player.name} atacou ${mob.name} e causou ${playerHit.finalDamage} de dano.`,
          damage: playerHit.finalDamage,
        });

        if (mobHp > 0) {
          const mobHit = this.calculateHit(mob, player);
          const effectiveMobDamage = Math.min(playerHp, mobHit.finalDamage);

          playerHp -= mobHit.finalDamage;
          damageTakenByPlayer += Math.max(0, effectiveMobDamage);

          if (mobHit.isCritical) {
            criticalHitsByMob++;
            criticalBonusDamageByMob += mobHit.criticalBonusDamage;
          }

          logs.push({
            round,
            actor: CombatActor.MOB,
            message: mobHit.isCritical
              ? `${mob.name} acertou um CRÍTICO em ${player.name} e causou ${mobHit.finalDamage} de dano.`
              : `${mob.name} atacou ${player.name} e causou ${mobHit.finalDamage} de dano.`,
            damage: mobHit.finalDamage,
          });

          const potionAfterDamage = this.tryUseAutoPotion({
            currentHp: playerHp,
            maxHp: player.maxHp,
            autoPotionState,
            potionUsedThisCombat,
          });

          if (potionAfterDamage.used) {
            playerHp = potionAfterDamage.newHp;
            healingReceivedByPlayer += potionAfterDamage.healedAmount;
            potionUsedThisCombat = true;

            logs.push({
              round,
              actor: CombatActor.SYSTEM,
              message: `${player.name} usou ${autoPotionState?.potionItemName} e recuperou ${potionAfterDamage.healedAmount} de HP.`,
              damage: 0,
            });
          }
        }
      } else {
        const mobHit = this.calculateHit(mob, player);
        const effectiveMobDamage = Math.min(playerHp, mobHit.finalDamage);

        playerHp -= mobHit.finalDamage;
        damageTakenByPlayer += Math.max(0, effectiveMobDamage);

        if (mobHit.isCritical) {
          criticalHitsByMob++;
          criticalBonusDamageByMob += mobHit.criticalBonusDamage;
        }

        logs.push({
          round,
          actor: CombatActor.MOB,
          message: mobHit.isCritical
            ? `${mob.name} acertou um CRÍTICO em ${player.name} e causou ${mobHit.finalDamage} de dano.`
            : `${mob.name} atacou ${player.name} e causou ${mobHit.finalDamage} de dano.`,
          damage: mobHit.finalDamage,
        });

        const potionAfterDamage = this.tryUseAutoPotion({
          currentHp: playerHp,
          maxHp: player.maxHp,
          autoPotionState,
          potionUsedThisCombat,
        });

        if (potionAfterDamage.used) {
          playerHp = potionAfterDamage.newHp;
          healingReceivedByPlayer += potionAfterDamage.healedAmount;
          potionUsedThisCombat = true;

          logs.push({
            round,
            actor: CombatActor.SYSTEM,
            message: `${player.name} usou ${autoPotionState?.potionItemName} e recuperou ${potionAfterDamage.healedAmount} de HP.`,
            damage: 0,
          });
        }

        if (playerHp > 0) {
          const playerHit = this.calculateHit(player, mob);
          const effectivePlayerDamage = Math.min(mobHp, playerHit.finalDamage);

          mobHp -= playerHit.finalDamage;
          damageDealtByPlayer += Math.max(0, effectivePlayerDamage);

          if (playerHit.isCritical) {
            criticalHitsByPlayer++;
            criticalBonusDamageByPlayer += playerHit.criticalBonusDamage;
          }

          logs.push({
            round,
            actor: CombatActor.PLAYER,
            message: playerHit.isCritical
              ? `${player.name} acertou um CRÍTICO em ${mob.name} e causou ${playerHit.finalDamage} de dano.`
              : `${player.name} atacou ${mob.name} e causou ${playerHit.finalDamage} de dano.`,
            damage: playerHit.finalDamage,
          });
        }
      }

      round++;
    }

    const roundsUsed = Math.max(1, round - 1);
    const playerEndHp = Math.max(0, playerHp);
    const mobEndHp = Math.max(0, mobHp);

    let winner: CombatWinner;

    if (mobEndHp <= 0) {
      winner = 'PLAYER';
    } else if (playerEndHp <= 0) {
      winner = 'MOB';
    } else {
      winner = playerEndHp >= mobEndHp ? 'PLAYER' : 'MOB';
    }

    logs.push({
      round,
      actor: CombatActor.SYSTEM,
      message:
        winner === 'PLAYER'
          ? `${player.name} venceu o combate.`
          : `${mob.name} venceu o combate.`,
      damage: 0,
    });

    return {
      winner,
      rounds: roundsUsed,
      playerEndHp,
      mobEndHp,
      logs,

      damageDealtByPlayer,
      damageTakenByPlayer,
      healingReceivedByPlayer,

      criticalHitsByPlayer,
      criticalHitsByMob,
      criticalBonusDamageByPlayer,
      criticalBonusDamageByMob,

      potionsUsed: autoPotionState?.usedQuantity ?? 0,
      healingFromPotions: autoPotionState?.totalHealed ?? 0,
      potionItemId: autoPotionState?.potionItemId ?? null,
      potionItemName: autoPotionState?.potionItemName ?? null,
      potionTriggerPercent: autoPotionState?.hpThresholdPercent ?? null,
    };
  }

  private createAutoPotionState(character: any): AutoPotionState | null {
    const config = character.potionConfig;

    if (!config || !config.enabled || !config.useInManualCombat) {
      return null;
    }

    const potionItem = config.potionItem;

    if (!potionItem) {
      return null;
    }

    if (potionItem.slot !== ItemSlot.CONSUMABLE) {
      return null;
    }

    if (!potionItem.usableInCombat) {
      return null;
    }

    if (potionItem.healFlat <= 0 && potionItem.healPercent <= 0) {
      return null;
    }

    const inventoryItem = character.inventoryItems?.find(
      (inventoryItem: any) => inventoryItem.itemId === potionItem.id,
    );

    const availableQuantity = inventoryItem?.quantity ?? 0;

    if (availableQuantity <= 0) {
      return null;
    }

    return {
      enabled: true,
      potionItemId: potionItem.id,
      potionItemName: potionItem.name,
      hpThresholdPercent: config.hpThresholdPercent,
      healFlat: potionItem.healFlat,
      healPercent: potionItem.healPercent,
      availableQuantity,
      usedQuantity: 0,
      totalHealed: 0,
    };
  }

  private tryUseAutoPotion(params: {
    currentHp: number;
    maxHp: number;
    autoPotionState?: AutoPotionState | null;
    potionUsedThisCombat: boolean;
  }): AutoPotionUseResult {
    const { currentHp, maxHp, autoPotionState, potionUsedThisCombat } = params;

    if (!autoPotionState) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
      };
    }

    if (potionUsedThisCombat) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
      };
    }

    if (autoPotionState.availableQuantity <= 0) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
      };
    }

    if (currentHp <= 0) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
      };
    }

    if (currentHp >= maxHp) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
      };
    }

    const thresholdHp = Math.floor(
      (maxHp * autoPotionState.hpThresholdPercent) / 100,
    );

    if (currentHp > thresholdHp) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
      };
    }

    const healAmount = this.calculateHealAmount({
      maxHp,
      healFlat: autoPotionState.healFlat,
      healPercent: autoPotionState.healPercent,
    });

    const newHp = this.clampHp(currentHp + healAmount, maxHp);
    const healedAmount = newHp - currentHp;

    if (healedAmount <= 0) {
      return {
        used: false,
        newHp: currentHp,
        healedAmount: 0,
      };
    }

    autoPotionState.availableQuantity -= 1;
    autoPotionState.usedQuantity += 1;
    autoPotionState.totalHealed += healedAmount;

    return {
      used: true,
      newHp,
      healedAmount,
    };
  }

  private calculateHealAmount(params: {
    maxHp: number;
    healFlat: number;
    healPercent: number;
  }) {
    const percentHeal = Math.floor((params.maxHp * params.healPercent) / 100);

    return params.healFlat + percentHeal;
  }

  private calculateHit(attacker: FighterStats, defender: FighterStats) {
    return calculateCombatHit({
      attack: attacker.attack,
      defense: defender.defense,
      attackerPrecision: attacker.precision,
      attackerTechnique: attacker.technique,
      defenderAgility: defender.agility,
      minMultiplier: 0.9,
      maxMultiplier: 1.1,
    });
  }

  private calculateMobFighterStats(mob: any): FighterStats {
    const safeSpeed = Math.max(1, mob.speed ?? 1);
    const safeLevel = Math.max(1, mob.level ?? 1);

    return {
      name: mob.name,
      hp: mob.hp,
      maxHp: mob.hp,
      attack: mob.attack,
      defense: mob.defense,
      speed: mob.speed,
      precision: safeSpeed,
      technique: safeLevel,
      agility: safeSpeed,
    };
  }

  private clampHp(currentHp: number, maxHp: number) {
    return Math.max(0, Math.min(currentHp, maxHp));
  }

  private randomBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getInventoryItemType(slot: ItemSlot) {
    if (slot === ItemSlot.MATERIAL) {
      return InventoryItemType.MATERIAL;
    }

    if (slot === ItemSlot.CONSUMABLE) {
      return InventoryItemType.CONSUMABLE;
    }

    return InventoryItemType.EQUIPMENT;
  }
}