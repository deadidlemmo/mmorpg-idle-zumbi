import { PetEffectType, PetSpecialization } from '@prisma/client';

export const BASIS_POINTS_SCALE = 10_000;

export type PetBonusTarget = {
  effectType: PetEffectType;
  specialization?: PetSpecialization;
};

export type EquippedPetBonus = {
  characterPetId: string;
  petDefinitionId: string;
  petKey: string;
  petName: string;
  tier: number;
  specialization: PetSpecialization;
  effectType: PetEffectType;
  effectBasisPoints: number;
  remainingBasisPoints: number;
};

export function normalizeBasisPoints(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(BASIS_POINTS_SCALE, Math.max(0, Math.trunc(value)));
}

export function matchesPetBonusTarget(
  bonus: Pick<EquippedPetBonus, 'effectType' | 'specialization'>,
  target: PetBonusTarget,
) {
  if (bonus.effectType !== target.effectType) return false;
  return (
    target.specialization === undefined ||
    bonus.specialization === target.specialization
  );
}

export function reduceDurationByBasisPoints(
  durationMs: number,
  effectBasisPoints: number,
  minimumDurationMs = 0,
) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error('A duração base deve ser um número não negativo.');
  }
  if (!Number.isFinite(minimumDurationMs) || minimumDurationMs < 0) {
    throw new Error('A duração mínima deve ser um número não negativo.');
  }

  const normalizedDuration = Math.ceil(durationMs);
  const normalizedMinimum = Math.ceil(minimumDurationMs);
  const basisPoints = normalizeBasisPoints(effectBasisPoints);
  const remainingBasisPoints = BASIS_POINTS_SCALE - basisPoints;
  const reducedDuration = Math.ceil(
    (normalizedDuration * remainingBasisPoints) / BASIS_POINTS_SCALE,
  );

  return Math.max(normalizedMinimum, reducedDuration);
}
