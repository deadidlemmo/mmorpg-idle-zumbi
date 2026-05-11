import type { EquipmentSeedData, MaterialSeedData } from '../seed-types';
type MaterialSeedDataWithGatheringProgression = MaterialSeedData & {
    requiredGatheringLevel?: number;
    gatheringXpPerUnit?: number;
    baseGatheringRatePerHour?: number | null;
};
export declare const starterEquipmentDefinitions: EquipmentSeedData[];
export declare const materialDefinitions: MaterialSeedDataWithGatheringProgression[];
export declare const equipmentDefinitions: EquipmentSeedData[];
export {};
