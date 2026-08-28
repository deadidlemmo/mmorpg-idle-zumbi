import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { CharacterPet } from '../../pets/types/pets.types';
import { getPetAssetImageUrl } from '../../pets/utils/petAssets';
import { getEquipmentRarityFromItem } from '../constants/equipment-rarity';

interface DashboardEquippedPetSlotProps {
  pet: CharacterPet | null;
  to: string;
}

function formatPetEffect(pet: CharacterPet) {
  const percent = pet.pet.effectPercent.toLocaleString('pt-BR');
  const specialization = pet.pet.specializationLabel.toLocaleLowerCase('pt-BR');

  return `T${pet.pet.tier} · -${percent}% ${specialization}`;
}

export function DashboardEquippedPetSlot({
  pet,
  to,
}: DashboardEquippedPetSlotProps) {
  const imageUrl = pet ? getPetAssetImageUrl(pet.pet, 'PET') : null;
  const rarity = getEquipmentRarityFromItem(pet?.pet);
  const name = pet?.pet.name ?? 'Nenhum pet equipado';
  const meta = pet ? `T${pet.pet.tier} · ${rarity.label}` : 'Slot disponível';
  const effect = pet ? formatPetEffect(pet) : null;
  const accessibleLabel = effect
    ? `Pet equipado: ${name}. ${effect}`
    : `Pet equipado: ${name}`;
  const style = {
    '--equipment-rgb': rarity.rgb,
  } as CSSProperties;

  const className = [
    'equipment-summary-slot',
    'equipment-summary-slot--pet',
    `equipment-summary-slot--rarity-${rarity.key}`,
    rarity.cssClass,
    pet ? 'has-item' : 'is-empty',
    imageUrl
      ? 'equipment-summary-slot--with-image'
      : 'equipment-summary-slot--fallback',
    'is-interactive',
  ].join(' ');

  return (
    <Link
      className={className}
      style={style}
      to={to}
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      <div className="equipment-summary-slot__slot" aria-hidden="true">
        <div className="equipment-summary-slot__icon">
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" />
          ) : (
            <span>P</span>
          )}
        </div>
      </div>

      <div className="equipment-summary-slot__content">
        <span className="equipment-summary-slot__label">Pet equipado</span>
        <strong className="equipment-summary-slot__name">{name}</strong>
      </div>

      <span className="equipment-summary-slot__meta">{meta}</span>
    </Link>
  );
}
