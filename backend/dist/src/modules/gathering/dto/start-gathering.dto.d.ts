import { MaterialOrigin } from '@prisma/client';
export declare class StartGatheringDto {
    characterId: string;
    mapId: string;
    origin: MaterialOrigin;
    targetMaterialId: string;
}
