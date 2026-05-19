export type CraftingRarity =
  | 'COMMON'
  | 'UNCOMMON'
  | 'RARE'
  | 'EPIC'
  | 'LEGENDARY'
  | (string & {});

export type CraftingSlot =
  | 'MAIN_HAND'
  | 'OFF_HAND'
  | 'HEAD'
  | 'ARMOR'
  | 'PANTS'
  | 'BOOTS'
  | 'MATERIAL'
  | 'CONSUMABLE'
  | (string & {});

export type CraftingOrigin =
  | 'DESMANCHE'
  | 'COLETA'
  | 'CONTENCAO'
  | 'ARSENAL'
  | 'PATRULHA'
  | 'TECNOVARREDURA'
  | 'DROP_MOBS'
  | (string & {});

export type CraftingIngredientRole =
  | 'MAIN_COMPONENT'
  | 'SHARED_MATERIAL'
  | 'RARE_MOB_DROP'
  | (string & {});

export interface CraftingMapViewModel {
  id: string;
  name: string;
  tier?: number | null;
  minLevel?: number | null;
  maxLevel?: number | null;
}

export interface CraftingClassViewModel {
  id: string;
  name: string;
}

export interface CraftingOutputItemViewModel {
  id: string;
  name: string;
  description?: string | null;
  tier: number;
  rarity: CraftingRarity;
  slot: CraftingSlot;
  family: string;
  classId?: string | null;
  mapId?: string | null;
  class?: CraftingClassViewModel | null;
  map?: CraftingMapViewModel | null;
  bonuses: {
    strength?: number | null;
    vitality?: number | null;
    agility?: number | null;
    precision?: number | null;
    technique?: number | null;
    willpower?: number | null;
  };
}

export interface CraftingIngredientViewModel {
  id: string;
  itemId: string;
  name: string;
  description?: string | null;
  required: number;
  available: number;
  missing: number;
  hasEnough: boolean;
  role: CraftingIngredientRole;
  origin: CraftingOrigin;
  materialOrigin?: CraftingOrigin | string | null;
  mapId?: string | null;
  map?: CraftingMapViewModel | null;
  tier?: number | null;
  rarity?: CraftingRarity | null;
  slot?: CraftingSlot | string | null;
  family?: string | null;
}

export interface CraftingMissingByOriginGroup {
  origin: CraftingOrigin;
  totalMissing: number;
  materials: Array<{
    itemId: string;
    name: string;
    missing: number;
    required: number;
    available: number;
    role: CraftingIngredientRole | string;
    origin: CraftingOrigin | string | null;
    materialOrigin?: CraftingOrigin | string | null;
    mapId?: string | null;
    family?: string | null;
  }>;
}

export interface CraftingNextAction {
  type: 'CRAFT' | 'GATHERING' | 'AUTO_COMBAT' | (string & {});
  priority: number;
  origin?: CraftingOrigin | string | null;
  label: string;
  description?: string | null;
  missingTotal?: number | null;
}

export interface CraftingSkillViewModel {
  id: string;
  characterId: string;
  level: number;
  xp: number;
  totalXp: number;
  xpToNextLevel: number | null;
  xpProgressPercent: number;
  isAtLevelCap: boolean;
  unlockedTier: number;
}

export interface CraftingRecipeViewModel {
  recipeId: string;
  tier: number;
  isActive: boolean;
  outputQuantity: number;
  ownedQuantity: number;
  isEquipped: boolean;
  isUnlocked: boolean;
  requiredCraftingLevel: number;
  requiredCharacterLevel: number;
  craftingXpReward: number;
  lockReason?: string | null;
  canCraft: boolean;
  maxCraftableTimes: number;
  maxOutputQuantity: number;
  progress: {
    percent: number;
    requiredTotal: number;
    availableTotal: number;
    missingTotal: number;
  };
  missingByOrigin: CraftingMissingByOriginGroup[];
  nextActions: CraftingNextAction[];
  outputItem: CraftingOutputItemViewModel;
  ingredients: CraftingIngredientViewModel[];
  missingIngredients: CraftingIngredientViewModel[];
}

export interface CraftingRecipesResponse {
  character: {
    id: string;
    name: string;
    level: number;
    craftingLevel?: number | null;
    unlockedTier?: number | null;
    craftingSkill?: CraftingSkillViewModel | null;
    status: string;
    class: CraftingClassViewModel | null;
  };
  filters: {
    tier: number | null;
    slot: CraftingSlot | null;
    craftableOnly: boolean;
    classId: string | null;
  };
  summary: {
    totalRecipes: number;
    craftableRecipes: number;
    blockedRecipes: number;
    ownedRecipes: number;
    equippedRecipes: number;
  };
  recipes: CraftingRecipeViewModel[];
}

export interface CraftItemPayload {
  characterId: string;
  itemId: string;
  quantity?: number;
}

export interface CraftItemResponse {
  message: string;
  craftedItem: {
    id: string;
    name: string;
    description?: string | null;
    tier: number;
    rarity: CraftingRarity;
    slot: CraftingSlot;
    family: string;
    quantity: number;
  };
  consumed: Array<{
    itemId: string;
    name: string;
    quantity: number;
    role: CraftingIngredientRole;
    origin: CraftingOrigin;
  }>;
  craftingSkill?: CraftingSkillViewModel | null;
  craftingProgress?: {
    xpGained: number;
    previousLevel: number;
    newLevel: number;
    leveledUp: boolean;
    levelsGained: number;
    currentXp: number;
    totalXp: number;
    xpToNextLevel: number | null;
    xpProgressPercent: number;
  };
}

export interface CraftingApiErrorResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}
