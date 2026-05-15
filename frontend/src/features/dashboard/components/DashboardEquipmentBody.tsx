import type { DashboardEquipmentItem } from '../types/dashboard.types';
import { DashboardEquipmentSlot } from './DashboardEquipmentSlot';

interface DashboardEquipmentBodyProps {
  equipment: {
    mainHand?: DashboardEquipmentItem | null;
    offHand?: DashboardEquipmentItem | null;
    head?: DashboardEquipmentItem | null;
    armor?: DashboardEquipmentItem | null;
    pants?: DashboardEquipmentItem | null;
    boots?: DashboardEquipmentItem | null;
  };
  selectedItemId?: string | null;
  onSelectSlot?: (slot: {
    slotKey: EquipmentSlotKey;
    label: string;
    item?: DashboardEquipmentItem | null;
  }) => void;
}

type EquipmentSlotKey =
  | 'head'
  | 'armor'
  | 'pants'
  | 'boots'
  | 'main-hand'
  | 'off-hand';

type EquipmentSlotConfig = {
  slotKey: EquipmentSlotKey;
  label: string;
  item?: DashboardEquipmentItem | null;
};

export function DashboardEquipmentBody({
  equipment,
  selectedItemId = null,
  onSelectSlot,
}: DashboardEquipmentBodyProps) {
  const slots: EquipmentSlotConfig[] = [
    {
      slotKey: 'head',
      label: 'Elmo',
      item: equipment.head,
    },
    {
      slotKey: 'main-hand',
      label: 'Mão principal',
      item: equipment.mainHand,
    },
    {
      slotKey: 'armor',
      label: 'Armadura',
      item: equipment.armor,
    },
    {
      slotKey: 'off-hand',
      label: 'Mão secundária',
      item: equipment.offHand,
    },
    {
      slotKey: 'pants',
      label: 'Calça',
      item: equipment.pants,
    },
    {
      slotKey: 'boots',
      label: 'Botas',
      item: equipment.boots,
    },
  ];

  const equippedCount = slots.filter(({ item }) => Boolean(item)).length;

  return (
    <section className="equipment-summary" aria-label="Equipamentos atuais">
      <div className="equipment-summary__intro">
        <strong>{equippedCount}/6 slots ocupados</strong>
        <span>Confira rapidamente o conjunto ativo do personagem.</span>
      </div>

      <div className="equipment-summary__grid">
        {slots.map(({ slotKey, label, item }) => (
          <DashboardEquipmentSlot
            key={slotKey}
            slotKey={slotKey}
            label={label}
            item={item}
            isSelected={Boolean(
              selectedItemId &&
              item?.id &&
              selectedItemId === `equipped-${item.id}`,
            )}
            onSelect={
              onSelectSlot
                ? () => onSelectSlot({ slotKey, label, item })
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
