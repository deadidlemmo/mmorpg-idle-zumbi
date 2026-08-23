export const PRODUCT_EVENT_ACTIONS = {
  CHARACTER_CREATED: 'PRODUCT_CHARACTER_CREATED',
  TUTORIAL_STEP_COMPLETED: 'PRODUCT_TUTORIAL_STEP_COMPLETED',
  TUTORIAL_COMPLETED: 'PRODUCT_TUTORIAL_COMPLETED',
  FIRST_RESOURCE_COLLECTED: 'PRODUCT_FIRST_RESOURCE_COLLECTED',
  FIRST_T1_CRAFTED: 'PRODUCT_FIRST_T1_CRAFTED',
  FIRST_T1_EQUIPPED: 'PRODUCT_FIRST_T1_EQUIPPED',
  FIRST_T1_SET_COMPLETED: 'PRODUCT_FIRST_T1_SET_COMPLETED',
} as const;

export const PRODUCT_MILESTONE_KEYS = {
  characterCreated: (characterId: string) =>
    `product:character:${characterId}:created`,
  tutorialStep: (characterId: string, step: number) =>
    `product:character:${characterId}:tutorial:${step}`,
  tutorialCompleted: (characterId: string) =>
    `product:character:${characterId}:tutorial:completed`,
  firstResourceCollected: (characterId: string) =>
    `product:character:${characterId}:resource:first`,
  firstT1Crafted: (characterId: string) =>
    `product:character:${characterId}:t1:crafted:first`,
  firstT1Equipped: (characterId: string) =>
    `product:character:${characterId}:t1:equipped:first`,
  firstT1SetCompleted: (characterId: string) =>
    `product:character:${characterId}:t1:set:first`,
} as const;
