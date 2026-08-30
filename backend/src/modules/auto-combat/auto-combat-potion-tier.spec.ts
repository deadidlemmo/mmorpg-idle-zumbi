import { InventoryItemType, ItemSlot } from '@prisma/client';
import { AutoCombatService } from './auto-combat.service';
import { CombatService } from '../combat/combat.service';

const potionItem = {
  id: 'potion-tier-3',
  name: 'Pocao de Vida',
  slot: ItemSlot.CONSUMABLE,
  usableInCombat: true,
  healFlat: 100,
  healPercent: 4,
  minTier: 3,
};

function buildCharacter(level: number) {
  return {
    level,
    potionConfig: {
      enabled: true,
      useInAutoCombat: true,
      useInManualCombat: true,
      potionItem,
    },
    inventoryItems: [
      {
        itemId: potionItem.id,
        type: InventoryItemType.CONSUMABLE,
        quantity: 10,
      },
    ],
  };
}

type PotionStateFactory = {
  createAutoPotionState: (character: ReturnType<typeof buildCharacter>) => {
    potionItemId: string;
    availableQuantity: number;
  } | null;
};

function getPrivatePotionStateFactory(prototype: object) {
  const service: unknown = Object.create(prototype);

  return service as PotionStateFactory;
}

describe('combat potion tier defense in depth', () => {
  it('does not create an auto-combat potion state below the required tier', () => {
    const service = getPrivatePotionStateFactory(AutoCombatService.prototype);

    expect(service.createAutoPotionState(buildCharacter(20))).toBeNull();
    expect(service.createAutoPotionState(buildCharacter(21))).toMatchObject({
      potionItemId: potionItem.id,
      availableQuantity: 10,
    });
  });

  it('does not create a manual-combat potion state below the required tier', () => {
    const service = getPrivatePotionStateFactory(CombatService.prototype);

    expect(service.createAutoPotionState(buildCharacter(20))).toBeNull();
    expect(service.createAutoPotionState(buildCharacter(21))).toMatchObject({
      potionItemId: potionItem.id,
      availableQuantity: 10,
    });
  });
});
