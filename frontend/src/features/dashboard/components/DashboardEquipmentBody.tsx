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
}

type EquipmentSlotKey =
  | 'head'
  | 'main-hand'
  | 'armor'
  | 'off-hand'
  | 'pants'
  | 'boots';

type EquipmentSlotConfig = {
  slotKey: EquipmentSlotKey;
  label: string;
  item?: DashboardEquipmentItem | null;
};

export function DashboardEquipmentBody({
  equipment,
}: DashboardEquipmentBodyProps) {
  const slots: EquipmentSlotConfig[] = [
    {
      slotKey: 'head',
      label: 'Elmo',
      item: equipment.head,
    },
    {
      slotKey: 'main-hand',
      label: 'Main Hand',
      item: equipment.mainHand,
    },
    {
      slotKey: 'armor',
      label: 'Armadura',
      item: equipment.armor,
    },
    {
      slotKey: 'off-hand',
      label: 'Off Hand',
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

  return (
    <section className="equipment-loadout" aria-label="Equipamentos atuais">
      <div className="equipment-loadout__stage">
        <div className="equipment-loadout__ambient" aria-hidden="true" />
        <div className="equipment-loadout__aura" aria-hidden="true" />

        <div className="equipment-loadout__silhouette" aria-hidden="true">
          <span className="equipment-loadout__shape equipment-loadout__shape--head" />
          <span className="equipment-loadout__shape equipment-loadout__shape--neck" />
          <span className="equipment-loadout__shape equipment-loadout__shape--torso" />
          <span className="equipment-loadout__shape equipment-loadout__shape--left-arm" />
          <span className="equipment-loadout__shape equipment-loadout__shape--right-arm" />
          <span className="equipment-loadout__shape equipment-loadout__shape--hips" />
          <span className="equipment-loadout__shape equipment-loadout__shape--left-leg" />
          <span className="equipment-loadout__shape equipment-loadout__shape--right-leg" />
          <span className="equipment-loadout__shape equipment-loadout__shape--left-foot" />
          <span className="equipment-loadout__shape equipment-loadout__shape--right-foot" />
        </div>

        <div className="equipment-loadout__slots">
          {slots.map(({ slotKey, label, item }) => (
            <div
              key={slotKey}
              className={`equipment-loadout__slot equipment-loadout__slot--${slotKey}`}
              data-slot={slotKey}
            >
              <DashboardEquipmentSlot
                slotKey={slotKey}
                label={label}
                item={item}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}