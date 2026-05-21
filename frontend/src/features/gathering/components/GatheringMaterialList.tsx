import type {
    GatheringMaterialRecipeUsageViewModel,
    GatheringMaterialViewModel,
    GatheringSkillViewModel,
} from '../types/gathering.types';
import {
    formatGatheringOutputItemSlot,
    getGatheringMaterialPrimaryRecipe,
    getGatheringRequiredLevel,
} from '../types/gathering.types';
import { GatheringMaterialCard } from './GatheringMaterialCard';

interface GatheringMaterialListProps {
  materials: GatheringMaterialViewModel[];
  totalMaterialsCount?: number;
  activeClassFilterLabel?: string;
  isClassFiltered?: boolean;
  gatheringSkill?: GatheringSkillViewModel | null;
  fallbackRatePerHour?: number | null;

  selectedMaterialId?: string | null;
  activeMaterialId?: string | null;
  isBusy?: boolean;
  isStartDisabled?: boolean;
  startDisabledReason?: string | null;

  onSelectMaterial?: (material: GatheringMaterialViewModel) => void;
  onStartMaterial?: (material: GatheringMaterialViewModel) => void | Promise<void>;
  onViewMaterialUsage?: (material: GatheringMaterialViewModel) => void;
}

interface MaterialGroupViewModel {
  key: string;
  label: string;
  order: number;
  materials: GatheringMaterialViewModel[];
}

type RecipeOutputSlot = GatheringMaterialRecipeUsageViewModel['outputItemSlot'];

function normalizeSlotKey(slot?: RecipeOutputSlot | string | null): string {
  return String(slot ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getMaterialPrimarySlot(
  material: GatheringMaterialViewModel,
): RecipeOutputSlot | null {
  const primaryRecipe = getGatheringMaterialPrimaryRecipe(material);

  if (primaryRecipe?.outputItemSlot) {
    return primaryRecipe.outputItemSlot;
  }

  const recipes = material.usedInRecipes ?? [];

  if (recipes.length <= 0) {
    return null;
  }

  const uniqueSlots = Array.from(
    new Set(
      recipes
        .map((recipe) => recipe.outputItemSlot)
        .filter(Boolean),
    ),
  );

  if (uniqueSlots.length === 1) {
    return uniqueSlots[0] ?? null;
  }

  return null;
}

function getMaterialGroupOrder(slot?: RecipeOutputSlot | string | null): number {
  const normalizedSlot = normalizeSlotKey(slot);

  const orderBySlot: Record<string, number> = {
    MAIN_HAND: 10,
    WEAPON: 10,
    ARMA: 10,

    OFF_HAND: 20,
    SECONDARY: 20,
    SHIELD: 20,
    APOIO: 20,

    HEAD: 30,
    HELMET: 30,
    ELMO: 30,

    ARMOR: 40,
    CHEST: 40,
    BODY: 40,
    CAMISA: 40,
    ARMADURA: 40,

    PANTS: 50,
    LEGS: 50,
    CALCA: 50,
    CALÇA: 50,

    BOOTS: 60,
    FEET: 60,
    BOTAS: 60,

    CONSUMABLE: 70,
    CONSUMIVEL: 70,
    CONSUMIVEL_: 70,

    MULTIPLE: 90,
    GENERAL: 100,
  };

  return orderBySlot[normalizedSlot] ?? 999;
}

function getMaterialGroupLabel(slot?: RecipeOutputSlot | string | null): string {
  const normalizedSlot = normalizeSlotKey(slot);

  const labelBySlot: Record<string, string> = {
    MAIN_HAND: 'Armas',
    WEAPON: 'Armas',
    ARMA: 'Armas',

    OFF_HAND: 'Apoios e secundárias',
    SECONDARY: 'Apoios e secundárias',
    SHIELD: 'Apoios e secundárias',
    APOIO: 'Apoios e secundárias',

    HEAD: 'Elmos',
    HELMET: 'Elmos',
    ELMO: 'Elmos',

    ARMOR: 'Armaduras e coletes',
    CHEST: 'Armaduras e coletes',
    BODY: 'Armaduras e coletes',
    CAMISA: 'Armaduras e coletes',
    ARMADURA: 'Armaduras e coletes',

    PANTS: 'Calças e proteção inferior',
    LEGS: 'Calças e proteção inferior',
    CALCA: 'Calças e proteção inferior',
    CALÇA: 'Calças e proteção inferior',

    BOOTS: 'Botas e deslocamento',
    FEET: 'Botas e deslocamento',
    BOTAS: 'Botas e deslocamento',

    CONSUMABLE: 'Consumíveis',
    CONSUMIVEL: 'Consumíveis',

    MULTIPLE: 'Materiais versáteis',
    GENERAL: 'Materiais gerais',
  };

  if (labelBySlot[normalizedSlot]) {
    return labelBySlot[normalizedSlot];
  }

  if (slot) {
    return formatGatheringOutputItemSlot(slot as RecipeOutputSlot);
  }

  return 'Materiais gerais';
}

function getMaterialGroupKey(material: GatheringMaterialViewModel): string {
  const recipes = material.usedInRecipes ?? [];
  const primarySlot = getMaterialPrimarySlot(material);

  if (primarySlot) {
    return normalizeSlotKey(primarySlot);
  }

  if (recipes.length > 1) {
    return 'MULTIPLE';
  }

  return 'GENERAL';
}

function sortMaterials(
  materials: GatheringMaterialViewModel[],
): GatheringMaterialViewModel[] {
  return [...materials].sort((first, second) => {
    const firstRequiredLevel = getGatheringRequiredLevel(first);
    const secondRequiredLevel = getGatheringRequiredLevel(second);

    if (firstRequiredLevel !== secondRequiredLevel) {
      return firstRequiredLevel - secondRequiredLevel;
    }

    const firstTier = Number(first.tier ?? 1);
    const secondTier = Number(second.tier ?? 1);

    if (firstTier !== secondTier) {
      return firstTier - secondTier;
    }

    return first.name.localeCompare(second.name, 'pt-BR');
  });
}

function groupMaterials(
  materials: GatheringMaterialViewModel[],
): MaterialGroupViewModel[] {
  const groupsByKey = new Map<string, MaterialGroupViewModel>();

  for (const material of materials) {
    const slot = getMaterialPrimarySlot(material);
    const key = getMaterialGroupKey(material);
    const currentGroup = groupsByKey.get(key);

    if (currentGroup) {
      currentGroup.materials.push(material);
      continue;
    }

    groupsByKey.set(key, {
      key,
      label: getMaterialGroupLabel(slot ?? key),
      order: getMaterialGroupOrder(slot ?? key),
      materials: [material],
    });
  }

  return [...groupsByKey.values()]
    .map((group) => ({
      ...group,
      materials: sortMaterials(group.materials),
    }))
    .sort((first, second) => {
      if (first.order !== second.order) {
        return first.order - second.order;
      }

      return first.label.localeCompare(second.label, 'pt-BR');
    });
}

export function GatheringMaterialList({
  materials,
  totalMaterialsCount,
  activeClassFilterLabel = 'Todas',
  isClassFiltered = false,
  gatheringSkill,
  fallbackRatePerHour,
  selectedMaterialId,
  activeMaterialId,
  isBusy = false,
  isStartDisabled = false,
  startDisabledReason,
  onSelectMaterial,
  onStartMaterial,
  onViewMaterialUsage,
}: GatheringMaterialListProps) {
  const groups = groupMaterials(materials);
  const visibleMaterialsCount = materials.length;
  const safeTotalMaterialsCount = totalMaterialsCount ?? visibleMaterialsCount;

  if (materials.length <= 0) {
    return (
      <div className="gathering-empty gathering-empty--compact">
        <span className="gathering-empty__icon" aria-hidden="true">
          ▦
        </span>
        <strong>
          {isClassFiltered
            ? 'Nenhum item nesta categoria'
            : 'Nenhum material encontrado'}
        </strong>
        <p>
          {isClassFiltered
            ? 'Tente alternar para Todos ou escolha outra origem/mapa com materiais dessa classe.'
            : 'Não há materiais disponíveis para esta origem neste mapa.'}
        </p>
      </div>
    );
  }

  return (
    <div className="gathering-material-groups">
      <div className="gathering-materials-toolbar gathering-materials-toolbar--compact">
        <p className="gathering-materials-toolbar__summary">
          <span>Resultado</span>
          {isClassFiltered ? (
            <>
              <strong>{visibleMaterialsCount}</strong> de{' '}
              <strong>{safeTotalMaterialsCount}</strong> materiais para{' '}
              <strong>{activeClassFilterLabel}</strong>
            </>
          ) : (
            <>
              <strong>{visibleMaterialsCount}</strong> materiais encontrados
            </>
          )}
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.key} className="gathering-material-group">
          <header className="gathering-material-group__header">
            <div>
              <h3>{group.label}</h3>
            </div>
          </header>

          <div className="gathering-material-grid gathering-material-grid--visual">
            {group.materials.map((material) => (
              <GatheringMaterialCard
                key={material.id}
                material={material}
                gatheringSkill={gatheringSkill}
                fallbackRatePerHour={fallbackRatePerHour}
                isSelected={selectedMaterialId === material.id}
                isActive={activeMaterialId === material.id}
                isBusy={isBusy}
                isStartDisabled={isStartDisabled}
                startDisabledReason={startDisabledReason}
                onSelect={onSelectMaterial}
                onStart={onStartMaterial}
                onViewUsage={onViewMaterialUsage}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default GatheringMaterialList;
