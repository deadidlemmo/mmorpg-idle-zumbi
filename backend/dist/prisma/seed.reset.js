"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const mapDefinitions = [
    {
        name: 'Subúrbio Silencioso',
        tier: 1,
        minLevel: 1,
        maxLevel: 10,
        description: 'Mapa de entrada do sistema, com foco em sobrevivência urbana básica, saque inicial e introdução às rotas de gathering.',
        subMaps: ['Rua das Cercas', 'Quintais Abandonados', 'Bloco do Síndico'],
    },
    {
        name: 'Distrito da Ferrugem',
        tier: 2,
        minLevel: 11,
        maxLevel: 20,
        description: 'Zona industrial degradada, com oficinas abandonadas, depósitos quebrados, galpões saqueados, trilhos enferrujados e maquinário pesado em colapso.',
        subMaps: ['Pátio de Carga', 'Linha de Prensas', 'Galpão do Capataz'],
    },
    {
        name: 'Hospital Santa Ruína',
        tier: 3,
        minLevel: 21,
        maxLevel: 30,
        description: 'Hospital colapsado, tomado por corredores escuros, alas isoladas, laboratórios abandonados e enfermarias contaminadas.',
        subMaps: ['Triagem Vazia', 'Ala de Isolamento', 'Centro Cirúrgico'],
    },
    {
        name: 'Terminal dos Esquecidos',
        tier: 4,
        minLevel: 31,
        maxLevel: 40,
        description: 'Antiga rodoviária de evacuação, conectada a plataformas abandonadas, depósitos de bagagem, túneis de manutenção e áreas de embarque colapsadas.',
        subMaps: ['Saguão de Embarque', 'Plataformas Mortas', 'Cabine Final'],
    },
    {
        name: 'Zona de Quarentena 9',
        tier: 5,
        minLevel: 41,
        maxLevel: 50,
        description: 'Área de contenção militar colapsada, com cercas eletrificadas, torres destruídas, contêineres de triagem, postos de descontaminação e blocos selados.',
        subMaps: ['Triagem Externa', 'Cercas Internas', 'Posto de Comando'],
    },
    {
        name: 'Refinaria do Pó Cinzento',
        tier: 6,
        minLevel: 51,
        maxLevel: 60,
        description: 'Complexo industrial tomado por fumaça tóxica, tubulações rompidas, tanques de combustível perfurados e fornos desligados à força.',
        subMaps: ['Tanques Vazios', 'Tubulação Quente', 'Câmara da Fornalha'],
    },
    {
        name: 'Avenida dos Caídos',
        tier: 7,
        minLevel: 61,
        maxLevel: 70,
        description: 'Centro urbano destruído, com arranha-céus quebrados, avenidas engarrafadas, ônibus queimados, fachadas destruídas e becos infestados.',
        subMaps: ['Faixa Engarrafada', 'Becos de Caça', 'Cruzamento Central'],
    },
    {
        name: 'Complexo Helix',
        tier: 8,
        minLevel: 71,
        maxLevel: 80,
        description: 'Centro de pesquisa biomédica e tecnológica parcialmente subterrâneo, com laboratórios selados, alas de observação, câmaras de amostra e áreas de pesquisa proibida.',
        subMaps: ['Ala de Observação', 'Câmaras Seladas', 'Diretoria Helix'],
    },
    {
        name: 'Necrópole Industrial',
        tier: 9,
        minLevel: 81,
        maxLevel: 90,
        description: 'Cemitério colossal de fábricas, galpões e linhas de produção esmagadas por ferrugem, fuligem, mutação e carne infectada presa a estruturas metálicas.',
        subMaps: ['Pátio de Escória', 'Esteiras Mortas', 'Coração da Usina'],
    },
    {
        name: 'Marco Zero',
        tier: 10,
        minLevel: 91,
        maxLevel: 100,
        description: 'Zona final devastada por ondas de colapso biológico, ruína estrutural e saturação infecciosa. O mapa final conhecido.',
        subMaps: ['Anel Externo', 'Zona de Saturação', 'Núcleo do Colapso'],
    },
];
function getRequiredMap(mapsByName, name) {
    const gameMap = mapsByName.get(name);
    if (!gameMap) {
        throw new Error(`Mapa não encontrado no seed reset: ${name}`);
    }
    return gameMap;
}
function getRequiredSubMap(subMapsByName, name) {
    const subMap = subMapsByName.get(name);
    if (!subMap) {
        throw new Error(`Submapa não encontrado no seed reset: ${name}`);
    }
    return subMap;
}
async function main() {
    console.log('ATENÇÃO: iniciando seed reset destrutivo...');
    console.log('Este reset apaga personagens, inventário, equipamentos, sessões, configs, mapas, mobs e itens.');
    console.log('Usuários/login serão preservados.');
    console.log('Limpando dados de auto-combate...');
    await prisma.autoCombatSessionLoot.deleteMany();
    await prisma.autoCombatSessionMobSummary.deleteMany();
    await prisma.autoCombatSession.deleteMany();
    console.log('Limpando encontros, combates e configurações...');
    await prisma.subMapEncounter.deleteMany();
    await prisma.combatLog.deleteMany();
    await prisma.combat.deleteMany();
    await prisma.characterPotionConfig.deleteMany();
    console.log('Limpando progresso dos personagens...');
    await prisma.mobDrop.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.character.deleteMany();
    console.log('Limpando dados-base do jogo...');
    await prisma.item.deleteMany();
    await prisma.mob.deleteMany();
    await prisma.subMap.deleteMany();
    await prisma.gameMap.deleteMany();
    await prisma.gameClass.deleteMany();
    console.log('Criando classes...');
    const lutador = await prisma.gameClass.create({
        data: {
            name: 'Lutador',
            description: 'Classe de linha de frente, resistente, brutal e focada em combate corpo a corpo.',
            baseStrength: 8,
            baseVitality: 8,
            baseAgility: 2,
            basePrecision: 2,
            baseTechnique: 5,
            baseWillpower: 5,
        },
    });
    const assassino = await prisma.gameClass.create({
        data: {
            name: 'Assassino',
            description: 'Classe ágil, furtiva e focada em precisão, evasão e execução.',
            baseStrength: 5,
            baseVitality: 2,
            baseAgility: 8,
            basePrecision: 8,
            baseTechnique: 5,
            baseWillpower: 2,
        },
    });
    const atirador = await prisma.gameClass.create({
        data: {
            name: 'Atirador',
            description: 'Classe de médio e longo alcance, focada em mira, estabilidade e controle tático.',
            baseStrength: 5,
            baseVitality: 2,
            baseAgility: 8,
            basePrecision: 8,
            baseTechnique: 5,
            baseWillpower: 2,
        },
    });
    const medico = await prisma.gameClass.create({
        data: {
            name: 'Médico',
            description: 'Classe de suporte técnico, contenção biológica e sobrevivência clínica.',
            baseStrength: 2,
            baseVitality: 5,
            baseAgility: 2,
            basePrecision: 5,
            baseTechnique: 8,
            baseWillpower: 8,
        },
    });
    console.log('Criando mapas e submapas...');
    const mapsByName = new Map();
    const subMapsByName = new Map();
    for (const mapDefinition of mapDefinitions) {
        const gameMap = await prisma.gameMap.create({
            data: {
                name: mapDefinition.name,
                tier: mapDefinition.tier,
                minLevel: mapDefinition.minLevel,
                maxLevel: mapDefinition.maxLevel,
                description: mapDefinition.description,
            },
        });
        mapsByName.set(gameMap.name, gameMap);
        for (const subMapName of mapDefinition.subMaps) {
            const subMap = await prisma.subMap.create({
                data: {
                    name: subMapName,
                    description: `Submapa de ${mapDefinition.name}.`,
                    tier: mapDefinition.tier,
                    minLevel: mapDefinition.minLevel,
                    maxLevel: mapDefinition.maxLevel,
                    mapId: gameMap.id,
                },
            });
            subMapsByName.set(subMap.name, subMap);
        }
    }
    const suburbio = getRequiredMap(mapsByName, 'Subúrbio Silencioso');
    const ruaDasCercas = getRequiredSubMap(subMapsByName, 'Rua das Cercas');
    const quintaisAbandonados = getRequiredSubMap(subMapsByName, 'Quintais Abandonados');
    const blocoDoSindico = getRequiredSubMap(subMapsByName, 'Bloco do Síndico');
    console.log('Criando mobs iniciais...');
    const zumbiErrante = await prisma.mob.create({
        data: {
            name: 'Zumbi Errante',
            description: 'Um infectado fraco, lento e instável.',
            level: 1,
            tier: 1,
            hp: 45,
            attack: 7,
            defense: 2,
            speed: 3,
            xpReward: 7,
            mapId: suburbio.id,
        },
    });
    const infectadoQuintal = await prisma.mob.create({
        data: {
            name: 'Infectado de Quintal',
            description: 'Um zumbi um pouco mais agressivo, encontrado próximo a casas e garagens.',
            level: 2,
            tier: 1,
            hp: 65,
            attack: 9,
            defense: 3,
            speed: 4,
            xpReward: 8,
            mapId: suburbio.id,
        },
    });
    console.log('Criando encontros dos submapas iniciais...');
    await prisma.subMapEncounter.createMany({
        data: [
            {
                subMapId: ruaDasCercas.id,
                mobId: zumbiErrante.id,
                weight: 80,
            },
            {
                subMapId: ruaDasCercas.id,
                mobId: infectadoQuintal.id,
                weight: 20,
            },
            {
                subMapId: quintaisAbandonados.id,
                mobId: zumbiErrante.id,
                weight: 50,
            },
            {
                subMapId: quintaisAbandonados.id,
                mobId: infectadoQuintal.id,
                weight: 50,
            },
            {
                subMapId: blocoDoSindico.id,
                mobId: zumbiErrante.id,
                weight: 30,
            },
            {
                subMapId: blocoDoSindico.id,
                mobId: infectadoQuintal.id,
                weight: 70,
            },
        ],
    });
    console.log('Criando equipamentos e materiais iniciais...');
    const macaCanoCerca = await prisma.item.create({
        data: {
            name: 'Maça de Cano de Cerca',
            description: 'Arma improvisada feita a partir de um cano de cerca amassado.',
            tier: 1,
            rarity: client_1.Rarity.COMMON,
            slot: client_1.ItemSlot.MAIN_HAND,
            family: 'Maça',
            classId: lutador.id,
            mapId: suburbio.id,
            strengthBonus: 3,
            vitalityBonus: 0,
            agilityBonus: 0,
            precisionBonus: 0,
            techniqueBonus: 0,
            willpowerBonus: 0,
            healFlat: 0,
            healPercent: 0,
            usableInCombat: false,
            usableOutOfCombat: false,
            minTier: null,
            maxTier: null,
            isCraftable: true,
        },
    });
    const defletorPlacaCerca = await prisma.item.create({
        data: {
            name: 'Defletor de Placa de Cerca',
            description: 'Defesa improvisada feita com uma placa de cerca entortada.',
            tier: 1,
            rarity: client_1.Rarity.COMMON,
            slot: client_1.ItemSlot.OFF_HAND,
            family: 'Defletor',
            classId: lutador.id,
            mapId: suburbio.id,
            strengthBonus: 0,
            vitalityBonus: 2,
            agilityBonus: 0,
            precisionBonus: 0,
            techniqueBonus: 0,
            willpowerBonus: 2,
            healFlat: 0,
            healPercent: 0,
            usableInCombat: false,
            usableOutOfCombat: false,
            minTier: null,
            maxTier: null,
            isCraftable: true,
        },
    });
    const adagaPontaGrade = await prisma.item.create({
        data: {
            name: 'Adaga de Ponta de Grade',
            description: 'Lâmina curta improvisada com uma ponta de grade afiada.',
            tier: 1,
            rarity: client_1.Rarity.COMMON,
            slot: client_1.ItemSlot.MAIN_HAND,
            family: 'Adaga',
            classId: assassino.id,
            mapId: suburbio.id,
            strengthBonus: 0,
            vitalityBonus: 0,
            agilityBonus: 2,
            precisionBonus: 3,
            techniqueBonus: 0,
            willpowerBonus: 0,
            healFlat: 0,
            healPercent: 0,
            usableInCombat: false,
            usableOutOfCombat: false,
            minTier: null,
            maxTier: null,
            isCraftable: true,
        },
    });
    const pistolaCanoEncurtado = await prisma.item.create({
        data: {
            name: 'Pistola de Cano Encurtado',
            description: 'Arma de fogo improvisada, instável, mas útil nos primeiros confrontos.',
            tier: 1,
            rarity: client_1.Rarity.COMMON,
            slot: client_1.ItemSlot.MAIN_HAND,
            family: 'Pistola',
            classId: atirador.id,
            mapId: suburbio.id,
            strengthBonus: 0,
            vitalityBonus: 0,
            agilityBonus: 0,
            precisionBonus: 4,
            techniqueBonus: 0,
            willpowerBonus: 0,
            healFlat: 0,
            healPercent: 0,
            usableInCombat: false,
            usableOutOfCombat: false,
            minTier: null,
            maxTier: null,
            isCraftable: true,
        },
    });
    const aplicadorClinico = await prisma.item.create({
        data: {
            name: 'Aplicador Clínico Improvisado',
            description: 'Ferramenta médica adaptada para combate e suporte em campo.',
            tier: 1,
            rarity: client_1.Rarity.COMMON,
            slot: client_1.ItemSlot.MAIN_HAND,
            family: 'Aplicador',
            classId: medico.id,
            mapId: suburbio.id,
            strengthBonus: 0,
            vitalityBonus: 1,
            agilityBonus: 0,
            precisionBonus: 2,
            techniqueBonus: 2,
            willpowerBonus: 1,
            healFlat: 0,
            healPercent: 0,
            usableInCombat: false,
            usableOutOfCombat: false,
            minTier: null,
            maxTier: null,
            isCraftable: true,
        },
    });
    const residuoInfectoPalido = await prisma.item.create({
        data: {
            name: 'Resíduo Infecto Pálido',
            description: 'Material raro obtido de infectados fracos do Subúrbio Silencioso.',
            tier: 1,
            rarity: client_1.Rarity.COMMON,
            slot: client_1.ItemSlot.MATERIAL,
            family: 'Drop de Mob',
            classId: null,
            mapId: suburbio.id,
            strengthBonus: 0,
            vitalityBonus: 0,
            agilityBonus: 0,
            precisionBonus: 0,
            techniqueBonus: 0,
            willpowerBonus: 0,
            healFlat: 0,
            healPercent: 0,
            usableInCombat: false,
            usableOutOfCombat: false,
            minTier: null,
            maxTier: null,
            isCraftable: false,
        },
    });
    console.log('Criando consumíveis de cura...');
    const soroRecuperacaoPalido = await prisma.item.create({
        data: {
            name: 'Soro de Recuperação Pálido',
            description: 'Soro básico de campo, preparado com solução salina reaproveitada e estabilizante fraco. Usado para recuperação emergencial nos primeiros tiers.',
            tier: 1,
            rarity: client_1.Rarity.COMMON,
            slot: client_1.ItemSlot.CONSUMABLE,
            family: 'Soro de Cura',
            classId: null,
            mapId: null,
            strengthBonus: 0,
            vitalityBonus: 0,
            agilityBonus: 0,
            precisionBonus: 0,
            techniqueBonus: 0,
            willpowerBonus: 0,
            healFlat: 60,
            healPercent: 5,
            usableInCombat: true,
            usableOutOfCombat: true,
            minTier: 1,
            maxTier: 2,
            isCraftable: true,
        },
    });
    const ampolaAntissepticaAmarelada = await prisma.item.create({
        data: {
            name: 'Ampola Antisséptica Amarelada',
            description: 'Ampola selada com agente antisséptico instável, usada para conter infecção leve e acelerar recuperação de tecidos danificados.',
            tier: 3,
            rarity: client_1.Rarity.UNCOMMON,
            slot: client_1.ItemSlot.CONSUMABLE,
            family: 'Ampola de Cura',
            classId: null,
            mapId: null,
            strengthBonus: 0,
            vitalityBonus: 0,
            agilityBonus: 0,
            precisionBonus: 0,
            techniqueBonus: 0,
            willpowerBonus: 0,
            healFlat: 150,
            healPercent: 8,
            usableInCombat: true,
            usableOutOfCombat: true,
            minTier: 3,
            maxTier: 4,
            isCraftable: true,
        },
    });
    const injetorHemostaticoMilitar = await prisma.item.create({
        data: {
            name: 'Injetor Hemostático Militar',
            description: 'Dispositivo tático de contenção médica usado por equipes de quarentena para estancar sangramento e manter o combatente ativo.',
            tier: 5,
            rarity: client_1.Rarity.RARE,
            slot: client_1.ItemSlot.CONSUMABLE,
            family: 'Injetor de Cura',
            classId: null,
            mapId: null,
            strengthBonus: 0,
            vitalityBonus: 0,
            agilityBonus: 0,
            precisionBonus: 0,
            techniqueBonus: 0,
            willpowerBonus: 0,
            healFlat: 350,
            healPercent: 10,
            usableInCombat: true,
            usableOutOfCombat: true,
            minTier: 5,
            maxTier: 6,
            isCraftable: true,
        },
    });
    const bioampolaHelixInstavel = await prisma.item.create({
        data: {
            name: 'Bioampola Helix Instável',
            description: 'Ampola experimental de bioestimulação criada a partir de protocolos Helix corrompidos. Acelera a regeneração, mas carrega sinais de instabilidade biológica.',
            tier: 7,
            rarity: client_1.Rarity.EPIC,
            slot: client_1.ItemSlot.CONSUMABLE,
            family: 'Bioampola de Cura',
            classId: null,
            mapId: null,
            strengthBonus: 0,
            vitalityBonus: 0,
            agilityBonus: 0,
            precisionBonus: 0,
            techniqueBonus: 0,
            willpowerBonus: 0,
            healFlat: 700,
            healPercent: 12,
            usableInCombat: true,
            usableOutOfCombat: true,
            minTier: 7,
            maxTier: 8,
            isCraftable: true,
        },
    });
    const soroVermelhoEstabilizacaoTotal = await prisma.item.create({
        data: {
            name: 'Soro Vermelho de Estabilização Total',
            description: 'Soro de emergência usado em colapso crítico. Reativa funções vitais, estabiliza trauma extremo e desacelera falência biológica.',
            tier: 9,
            rarity: client_1.Rarity.LEGENDARY,
            slot: client_1.ItemSlot.CONSUMABLE,
            family: 'Soro de Cura',
            classId: null,
            mapId: null,
            strengthBonus: 0,
            vitalityBonus: 0,
            agilityBonus: 0,
            precisionBonus: 0,
            techniqueBonus: 0,
            willpowerBonus: 0,
            healFlat: 1400,
            healPercent: 15,
            usableInCombat: true,
            usableOutOfCombat: true,
            minTier: 9,
            maxTier: 10,
            isCraftable: true,
        },
    });
    console.log('Criando drops iniciais...');
    await prisma.mobDrop.createMany({
        data: [
            {
                mobId: zumbiErrante.id,
                itemId: residuoInfectoPalido.id,
                dropChance: 80,
                minQuantity: 1,
                maxQuantity: 1,
            },
            {
                mobId: zumbiErrante.id,
                itemId: soroRecuperacaoPalido.id,
                dropChance: 20,
                minQuantity: 1,
                maxQuantity: 1,
            },
            {
                mobId: infectadoQuintal.id,
                itemId: residuoInfectoPalido.id,
                dropChance: 100,
                minQuantity: 1,
                maxQuantity: 2,
            },
            {
                mobId: infectadoQuintal.id,
                itemId: soroRecuperacaoPalido.id,
                dropChance: 25,
                minQuantity: 1,
                maxQuantity: 1,
            },
            {
                mobId: infectadoQuintal.id,
                itemId: macaCanoCerca.id,
                dropChance: 15,
                minQuantity: 1,
                maxQuantity: 1,
            },
            {
                mobId: infectadoQuintal.id,
                itemId: defletorPlacaCerca.id,
                dropChance: 10,
                minQuantity: 1,
                maxQuantity: 1,
            },
        ],
    });
    console.log('Seed reset finalizado com sucesso!');
    console.log({
        aviso: 'Reset concluído. Usuários foram preservados, mas personagens e progresso foram apagados.',
        classes: [lutador.name, assassino.name, atirador.name, medico.name],
        mapasCriados: mapDefinitions.length,
        subMapasCriados: mapDefinitions.reduce((total, mapDefinition) => total + mapDefinition.subMaps.length, 0),
        mapaInicial: suburbio.name,
        subMapasTier1: [
            ruaDasCercas.name,
            quintaisAbandonados.name,
            blocoDoSindico.name,
        ],
        mobs: [zumbiErrante.name, infectadoQuintal.name],
        itens: [
            macaCanoCerca.name,
            defletorPlacaCerca.name,
            adagaPontaGrade.name,
            pistolaCanoEncurtado.name,
            aplicadorClinico.name,
            residuoInfectoPalido.name,
        ],
        consumiveis: [
            {
                name: soroRecuperacaoPalido.name,
                rarity: soroRecuperacaoPalido.rarity,
                tiers: `${soroRecuperacaoPalido.minTier}-${soroRecuperacaoPalido.maxTier}`,
                heal: `${soroRecuperacaoPalido.healFlat} + ${soroRecuperacaoPalido.healPercent}% do HP máximo`,
            },
            {
                name: ampolaAntissepticaAmarelada.name,
                rarity: ampolaAntissepticaAmarelada.rarity,
                tiers: `${ampolaAntissepticaAmarelada.minTier}-${ampolaAntissepticaAmarelada.maxTier}`,
                heal: `${ampolaAntissepticaAmarelada.healFlat} + ${ampolaAntissepticaAmarelada.healPercent}% do HP máximo`,
            },
            {
                name: injetorHemostaticoMilitar.name,
                rarity: injetorHemostaticoMilitar.rarity,
                tiers: `${injetorHemostaticoMilitar.minTier}-${injetorHemostaticoMilitar.maxTier}`,
                heal: `${injetorHemostaticoMilitar.healFlat} + ${injetorHemostaticoMilitar.healPercent}% do HP máximo`,
            },
            {
                name: bioampolaHelixInstavel.name,
                rarity: bioampolaHelixInstavel.rarity,
                tiers: `${bioampolaHelixInstavel.minTier}-${bioampolaHelixInstavel.maxTier}`,
                heal: `${bioampolaHelixInstavel.healFlat} + ${bioampolaHelixInstavel.healPercent}% do HP máximo`,
            },
            {
                name: soroVermelhoEstabilizacaoTotal.name,
                rarity: soroVermelhoEstabilizacaoTotal.rarity,
                tiers: `${soroVermelhoEstabilizacaoTotal.minTier}-${soroVermelhoEstabilizacaoTotal.maxTier}`,
                heal: `${soroVermelhoEstabilizacaoTotal.healFlat} + ${soroVermelhoEstabilizacaoTotal.healPercent}% do HP máximo`,
            },
        ],
    });
}
main()
    .catch((error) => {
    console.error('Erro ao executar seed reset:', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.reset.js.map