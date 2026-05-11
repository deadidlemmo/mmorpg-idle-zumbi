import { PrismaService } from '../../prisma/prisma.service';
export declare class GameClassesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
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
