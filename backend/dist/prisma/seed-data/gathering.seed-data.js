"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gatheringDefinitions = void 0;
const client_1 = require("@prisma/client");
exports.gatheringDefinitions = [
    {
        key: 'DESMANCHE',
        label: 'Desmanche',
        description: 'Recuperação de sucata, estruturas pesadas e componentes rígidos.',
        materialOrigin: client_1.MaterialOrigin.DESMANCHE,
        statBonus: 'strength',
    },
    {
        key: 'COLETA',
        label: 'Coleta',
        description: 'Coleta de tecidos, couro, suprimentos civis e materiais básicos.',
        materialOrigin: client_1.MaterialOrigin.COLETA,
        statBonus: 'vitality',
    },
    {
        key: 'PATRULHA',
        label: 'Patrulha',
        description: 'Rotas de mobilidade, reconhecimento e recuperação de peças leves.',
        materialOrigin: client_1.MaterialOrigin.PATRULHA,
        statBonus: 'agility',
    },
    {
        key: 'ARSENAL',
        label: 'Arsenal',
        description: 'Recuperação de munição, mecanismos e partes de armamentos.',
        materialOrigin: client_1.MaterialOrigin.ARSENAL,
        statBonus: 'precision',
    },
    {
        key: 'TECNOVARREDURA',
        label: 'Tecnovarredura',
        description: 'Varredura de circuitos, sensores, módulos e ferramentas técnicas.',
        materialOrigin: client_1.MaterialOrigin.TECNOVARREDURA,
        statBonus: 'technique',
    },
    {
        key: 'CONTENCAO',
        label: 'Contenção',
        description: 'Recuperação de filtros, lacres e materiais químicos/biológicos controlados.',
        materialOrigin: client_1.MaterialOrigin.CONTENCAO,
        statBonus: 'willpower',
    },
];
//# sourceMappingURL=gathering.seed-data.js.map