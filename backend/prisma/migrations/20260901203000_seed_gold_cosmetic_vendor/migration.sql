INSERT INTO "cosmetic_collections" (
    "id",
    "key",
    "name",
    "description",
    "coverAssetKey",
    "isActive",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
VALUES (
    gen_random_uuid()::text,
    'acervo-do-abrigo',
    'Acervo do Abrigo',
    'Aparências utilitárias recuperadas por Vera e disponíveis por Gold.',
    'banner-acervo-bancada-manutencao',
    true,
    5,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "coverAssetKey" = EXCLUDED."coverAssetKey",
    "isActive" = EXCLUDED."isActive",
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = CURRENT_TIMESTAMP;

WITH collection AS (
    SELECT "id"
    FROM "cosmetic_collections"
    WHERE "key" = 'acervo-do-abrigo'
), definitions (
    "key",
    "name",
    "description",
    "type",
    "rarity",
    "assetKey",
    "effectPreset",
    "displayText",
    "accentColor",
    "avatarPresentation",
    "avatarRepresentation",
    "representationLabel",
    "sortOrder"
) AS (
    VALUES
        ('avatar-acervo-vigia-oficina', 'Vigia da Oficina', 'Retrato masculino de um sobrevivente da manutenção.', 'AVATAR', 'UNCOMMON', 'avatar-acervo-vigia-oficina', NULL, NULL, '#b58b4a', 'MASCULINE', 'OTHER', 'Latino', 10),
        ('avatar-acervo-batedora-patio', 'Batedora do Pátio', 'Retrato feminino de uma batedora do abrigo.', 'AVATAR', 'UNCOMMON', 'avatar-acervo-batedora-patio', NULL, NULL, '#579b91', 'FEMININE', 'BLACK', NULL, 20),
        ('moldura-acervo-chapa-rebitada', 'Chapa Rebitada', 'Moldura de metal reaproveitado com cantos reforçados.', 'AVATAR_FRAME', 'COMMON', 'frame-shelter-riveted-plate', NULL, NULL, '#9aa28e', NULL, NULL, NULL, 30),
        ('moldura-acervo-lona-marcada', 'Lona Marcada', 'Acabamento de lona costurada usado no inventário.', 'AVATAR_FRAME', 'COMMON', 'frame-shelter-marked-canvas', NULL, NULL, '#b39763', NULL, NULL, NULL, 40),
        ('banner-acervo-bancada-manutencao', 'Bancada de Manutenção', 'Uma bancada simples e funcional para o cartão público.', 'PROFILE_BANNER', 'COMMON', 'banner-acervo-bancada-manutencao', NULL, NULL, '#b58b4a', NULL, NULL, NULL, 50),
        ('banner-acervo-corredor-almoxarifado', 'Corredor do Almoxarifado', 'O corredor de suprimentos aplicado ao cartão público.', 'PROFILE_BANNER', 'COMMON', 'banner-acervo-corredor-almoxarifado', NULL, NULL, '#668a89', NULL, NULL, NULL, 60),
        ('fundo-acervo-oficina-abrigo', 'Oficina do Abrigo', 'Garagem de manutenção aplicada à visão geral.', 'OVERVIEW_BACKGROUND', 'UNCOMMON', 'background-acervo-oficina-abrigo', NULL, NULL, '#a8844d', NULL, NULL, NULL, 70),
        ('fundo-acervo-patio-triagem', 'Pátio de Triagem', 'Área de separação de suprimentos para a visão geral.', 'OVERVIEW_BACKGROUND', 'UNCOMMON', 'background-acervo-patio-triagem', NULL, NULL, '#688d87', NULL, NULL, NULL, 80),
        ('efeito-acervo-poeira-oficina', 'Poeira de Oficina', 'Partículas discretas atravessam o cartão do personagem.', 'PROFILE_EFFECT', 'COMMON', NULL, 'workshop-dust', NULL, '#c0a064', NULL, NULL, NULL, 90),
        ('efeito-acervo-pulso-lanterna', 'Pulso de Lanterna', 'Um facho suave percorre o perfil em intervalos regulares.', 'PROFILE_EFFECT', 'UNCOMMON', NULL, 'flashlight-sweep', NULL, '#80aaa4', NULL, NULL, NULL, 100),
        ('titulo-acervo-mao-na-massa', 'Mão na Massa', 'Título de quem mantém o abrigo funcionando.', 'TITLE', 'COMMON', NULL, NULL, 'Mão na Massa', '#c0a064', NULL, NULL, NULL, 110),
        ('distintivo-acervo-mm', 'Distintivo MM', 'Selo público da manutenção do abrigo.', 'BADGE', 'COMMON', NULL, NULL, 'MM', '#c0a064', NULL, NULL, NULL, 120),
        ('titulo-acervo-olho-vigia', 'Olho de Vigia', 'Título de quem protege o perímetro.', 'TITLE', 'COMMON', NULL, NULL, 'Olho de Vigia', '#77a59e', NULL, NULL, NULL, 130),
        ('distintivo-acervo-ov', 'Distintivo OV', 'Selo público dos vigias do abrigo.', 'BADGE', 'COMMON', NULL, NULL, 'OV', '#77a59e', NULL, NULL, NULL, 140)
)
INSERT INTO "cosmetics" (
    "id",
    "key",
    "name",
    "description",
    "type",
    "accessType",
    "rarity",
    "assetKey",
    "effectPreset",
    "displayText",
    "accentColor",
    "avatarPresentation",
    "avatarRepresentation",
    "representationLabel",
    "collectionId",
    "isActive",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    definitions."key",
    definitions."name",
    definitions."description",
    definitions."type"::"CosmeticType",
    'ENTITLEMENT'::"CosmeticAccessType",
    definitions."rarity"::"Rarity",
    definitions."assetKey",
    definitions."effectPreset",
    definitions."displayText",
    definitions."accentColor",
    CASE
        WHEN definitions."avatarPresentation" IS NULL THEN NULL
        ELSE definitions."avatarPresentation"::"AvatarPresentation"
    END,
    CASE
        WHEN definitions."avatarRepresentation" IS NULL THEN NULL
        ELSE definitions."avatarRepresentation"::"AvatarRepresentation"
    END,
    definitions."representationLabel",
    collection."id",
    true,
    definitions."sortOrder",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM definitions
CROSS JOIN collection
ON CONFLICT ("key") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "type" = EXCLUDED."type",
    "accessType" = EXCLUDED."accessType",
    "rarity" = EXCLUDED."rarity",
    "assetKey" = EXCLUDED."assetKey",
    "effectPreset" = EXCLUDED."effectPreset",
    "displayText" = EXCLUDED."displayText",
    "accentColor" = EXCLUDED."accentColor",
    "avatarPresentation" = EXCLUDED."avatarPresentation",
    "avatarRepresentation" = EXCLUDED."avatarRepresentation",
    "representationLabel" = EXCLUDED."representationLabel",
    "collectionId" = EXCLUDED."collectionId",
    "isActive" = EXCLUDED."isActive",
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = CURRENT_TIMESTAMP;
