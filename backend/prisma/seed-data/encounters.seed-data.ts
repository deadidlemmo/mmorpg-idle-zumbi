import type { SubMapEncounterSeedData } from '../seed-types';
import {
  getActiveAutoCombatEncounterWeight,
  isActiveAutoCombatMob,
  mobBaseDefinitions,
} from './mobs.seed-data';

export const encounterDefinitions: SubMapEncounterSeedData[] =
  mobBaseDefinitions.filter(isActiveAutoCombatMob).map((mob) => ({
    subMapName: mob.subMapName,
    mobName: mob.name,
    weight: getActiveAutoCombatEncounterWeight(mob),
  }));
