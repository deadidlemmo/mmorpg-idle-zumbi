import { Link } from 'react-router-dom';
import type { CharacterPet } from '../../pets/types/pets.types';
import { getPetAssetImageUrl } from '../../pets/utils/petAssets';

interface DashboardEquippedPetSlotProps {
  pet: CharacterPet | null;
  to: string;
}

function normalizePetRarity(rarity?: string | null) {
  const normalized = rarity?.trim().toLowerCase();

  if (
    normalized === 'uncommon' ||
    normalized === 'rare' ||
    normalized === 'epic' ||
    normalized === 'legendary'
  ) {
    return normalized;
  }

  return 'common';
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
  const rarity = normalizePetRarity(pet?.pet.rarity);
  const name = pet?.pet.name ?? 'Nenhum pet equipado';
  const meta = pet ? formatPetEffect(pet) : 'Slot disponível';

  const className = [
    'equipment-summary-slot',
    'equipment-summary-slot--pet',
    `equipment-summary-slot--rarity-${rarity}`,
    pet ? 'has-item' : 'is-empty',
    imageUrl
      ? 'equipment-summary-slot--with-image'
      : 'equipment-summary-slot--fallback',
    'is-interactive',
  ].join(' ');

  return (
    <Link
      className={className}
      to={to}
      title={`Pet equipado: ${name}`}
      aria-label={`Pet equipado: ${name}`}
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
