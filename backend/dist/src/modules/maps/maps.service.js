"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let MapsService = class MapsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        return this.prisma.gameMap.findMany({
            orderBy: {
                tier: 'asc',
            },
            include: {
                subMaps: {
                    orderBy: [
                        {
                            minLevel: 'asc',
                        },
                        {
                            name: 'asc',
                        },
                    ],
                    include: {
                        encounters: {
                            where: {
                                isActive: true,
                            },
                            include: {
                                mob: true,
                            },
                        },
                    },
                },
                mobs: {
                    orderBy: [
                        {
                            level: 'asc',
                        },
                        {
                            name: 'asc',
                        },
                    ],
                },
                items: {
                    orderBy: [
                        {
                            tier: 'asc',
                        },
                        {
                            name: 'asc',
                        },
                    ],
                },
            },
        });
    }
    async findOne(id) {
        return this.prisma.gameMap.findUnique({
            where: { id },
            include: {
                subMaps: {
                    orderBy: [
                        {
                            minLevel: 'asc',
                        },
                        {
                            name: 'asc',
                        },
                    ],
                    include: {
                        encounters: {
                            where: {
                                isActive: true,
                            },
                            include: {
                                mob: true,
                            },
                        },
                    },
                },
                mobs: {
                    orderBy: [
                        {
                            level: 'asc',
                        },
                        {
                            name: 'asc',
                        },
                    ],
                    include: {
                        drops: {
                            include: {
                                item: true,
                            },
                        },
                    },
                },
                items: {
                    orderBy: [
                        {
                            tier: 'asc',
                        },
                        {
                            name: 'asc',
                        },
                    ],
                },
            },
        });
    }
};
exports.MapsService = MapsService;
exports.MapsService = MapsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MapsService);
//# sourceMappingURL=maps.service.js.map