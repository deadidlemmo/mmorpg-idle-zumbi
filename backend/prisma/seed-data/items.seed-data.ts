import type { EquipmentSeedData, MaterialSeedData } from '../seed-types';

/**
 * Base de itens propositalmente vazia.
 *
 * Os equipamentos iniciais, equipamentos craftáveis, materiais legados,
 * materiais oficiais de gathering e drops antigos foram removidos do seed para
 * permitir reconstruir a base de itens do zero sem apagar a arquitetura do jogo.
 */
type MaterialSeedDataWithGatheringProgression = MaterialSeedData & {
  requiredGatheringLevel?: number;
  gatheringXpPerUnit?: number;
  baseGatheringRatePerHour?: number | null;
};

export const starterEquipmentDefinitions: EquipmentSeedData[] = [];

export const materialDefinitions: MaterialSeedDataWithGatheringProgression[] =
  [];

export const equipmentDefinitions: EquipmentSeedData[] = [];
