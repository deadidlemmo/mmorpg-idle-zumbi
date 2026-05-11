"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recipeDefinitions = void 0;
const client_1 = require("@prisma/client");
const TIER1_MAIN_COMPONENT_QUANTITY = 7;
const TIER1_SHARED_MATERIAL_QUANTITY = 6;
const TIER1_RARE_DROP_QUANTITY = 2;
function makeTier1RecipeIngredients(params) {
    return [
        {
            itemName: params.mainComponent,
            quantity: TIER1_MAIN_COMPONENT_QUANTITY,
            role: client_1.CraftIngredientRole.MAIN_COMPONENT,
            origin: params.mainOrigin,
        },
        {
            itemName: params.sharedMaterialA,
            quantity: TIER1_SHARED_MATERIAL_QUANTITY,
            role: client_1.CraftIngredientRole.SHARED_MATERIAL,
            origin: params.sharedOriginA,
        },
        {
            itemName: params.sharedMaterialB,
            quantity: TIER1_SHARED_MATERIAL_QUANTITY,
            role: client_1.CraftIngredientRole.SHARED_MATERIAL,
            origin: params.sharedOriginB,
        },
        {
            itemName: params.rareDrop,
            quantity: TIER1_RARE_DROP_QUANTITY,
            role: client_1.CraftIngredientRole.RARE_MOB_DROP,
            origin: client_1.MaterialOrigin.DROP_MOBS,
        },
    ];
}
exports.recipeDefinitions = [
    {
        outputItemName: 'Maça de Cano de Cerca',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Cano de Cerca Amassado',
            sharedMaterialA: 'Tecido Grosso de Sobrevivência',
            sharedMaterialB: 'Lacre Antisséptico Básico',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Machado de Quintal Remendado',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Lâmina de Machado Lascada',
            sharedMaterialA: 'Tecido Grosso de Sobrevivência',
            sharedMaterialB: 'Lacre Antisséptico Básico',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Braçadeira de Couro de Garagem',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Placa de Sucata de Garagem',
            sharedMaterialA: 'Correia de Couro Ressecado',
            sharedMaterialB: 'Filtro de Punho Selado',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Defletor de Placa de Cerca',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Placa de Cerca Entortada',
            sharedMaterialA: 'Correia de Couro Ressecado',
            sharedMaterialB: 'Filtro de Punho Selado',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Capacete Acolchoado de Lona Costurada',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Lona Acolchoada de Sobrevivência',
            sharedMaterialA: 'Forro de Sobrevivência',
            sharedMaterialB: 'Máscara de Contenção Rudimentar',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Capacete de Couro e Borracha de Garagem',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Casco de Couro com Borracha Remendada',
            sharedMaterialA: 'Forro de Sobrevivência',
            sharedMaterialB: 'Máscara de Contenção Rudimentar',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Colete de Tecido Civil Reforçado',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Chapa Torácica Gasta',
            sharedMaterialA: 'Tecido Civil Reforçado',
            sharedMaterialB: 'Revestimento Imune Simples',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Jaqueta de Couro de Garagem',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Reforço de Sucata de Garagem',
            sharedMaterialA: 'Tecido Civil Reforçado',
            sharedMaterialB: 'Revestimento Imune Simples',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Calça de Lona Costurada',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Articulação de Liga Gasta',
            sharedMaterialA: 'Lona Costurada',
            sharedMaterialB: 'Isolante Biológico de Perna',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Calça de Couro de Garagem',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Reforço de Sucata de Joelho',
            sharedMaterialA: 'Lona Costurada',
            sharedMaterialB: 'Isolante Biológico de Perna',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Botas de Couro Costurado',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Solado Metálico Gasto',
            sharedMaterialA: 'Palmilha de Marcha',
            sharedMaterialB: 'Vedação de Bota Contaminada',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
    {
        outputItemName: 'Botas de Borracha de Quintal',
        tier: 1,
        ingredients: makeTier1RecipeIngredients({
            mainComponent: 'Reforço de Borracha de Pneu',
            sharedMaterialA: 'Palmilha de Marcha',
            sharedMaterialB: 'Vedação de Bota Contaminada',
            rareDrop: 'Resíduo Infecto Pálido',
            mainOrigin: client_1.MaterialOrigin.DESMANCHE,
            sharedOriginA: client_1.MaterialOrigin.COLETA,
            sharedOriginB: client_1.MaterialOrigin.CONTENCAO,
        }),
    },
];
//# sourceMappingURL=recipes.seed-data.js.map