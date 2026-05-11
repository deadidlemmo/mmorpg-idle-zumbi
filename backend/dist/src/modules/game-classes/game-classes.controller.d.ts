import { GameClassesService } from './game-classes.service';
export declare class GameClassesController {
    private readonly gameClassesService;
    constructor(gameClassesService: GameClassesService);
    findAll(): Promise<{
        name: string;
        id: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        baseStrength: number;
        baseVitality: number;
        baseAgility: number;
        basePrecision: number;
        baseTechnique: number;
        baseWillpower: number;
    }[]>;
    findOne(id: string): Promise<{
        name: string;
        id: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        baseStrength: number;
        baseVitality: number;
        baseAgility: number;
        basePrecision: number;
        baseTechnique: number;
        baseWillpower: number;
    } | null>;
}
