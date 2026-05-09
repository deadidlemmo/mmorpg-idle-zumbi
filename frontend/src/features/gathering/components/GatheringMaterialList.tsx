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
  gatheringSkill?: GatheringSkillViewModel | null;
  fallbackRatePerHour?: number | null;

  selectedMaterialId?: string | null;
  activeMaterialId?: string | null;
  isBusy?: boolean;

  onSelectMaterial?: (material: GatheringMaterialViewModel) => void;
  onStartMaterial?: (material: GatheringMaterialViewModel) => void | Promise<void>;
  onViewMaterialUsage?: (material: GatheringMaterialViewModel) => void;
}

interface MaterialGroup {
  key: string;
  title: string;
  description: string;
  materials: GatheringMaterialViewModel[];
}

const GROUP_ORDER = [
  'MAIN_HAND',
  'OFF_HAND',
  'HEAD',
  'ARMOR',
  'PANTS',
  'BOOTS',
  'CONSUMABLE',
  'MULTIPLE',
  'UNLINKED',
] as const;

function getRecipeSlotKey(
  recipe?: GatheringMaterialRecipeUsageViewModel | null,
): string {
  if (!recipe) {
    return 'UNLINKED';
  }

  const slot = recipe.outputItemSlot;

  if (
    slot === 'MAIN_HAND' ||
    slot === 'OFF_HAND' ||
    slot === 'HEAD' ||
    slot === 'ARMOR' ||
    slot === 'PANTS' ||
    slot === 'BOOTS' ||
    slot === 'CONSUMABLE'
  ) {
    return slot;
  }

  return 'MULTIPLE';
}

function getMaterialGroupKey(material: GatheringMaterialViewModel): string {
  const recipes = material.usedInRecipes ?? [];

  if (recipes.length <= 0) {
    return 'UNLINKED';
  }

  const uniqueSlots = Array.from(
    new Set(recipes.map((recipe) => recipe.outputItemSlot)),
  );

  if (uniqueSlots.length > 1) {
    return 'MULTIPLE';
  }

  return getRecipeSlotKey(recipes[0]);
}

function getGroupTitle(groupKey: string): string {
  switch (groupKey) {
    case 'MAIN_HAND':
      return 'Armas';

    case 'OFF_HAND':
      return 'Apoios e secundárias';

    case 'HEAD':
      return 'Elmos e proteção de cabeça';

    case 'ARMOR':
      return 'Armaduras e coletes';

    case 'PANTS':
      return 'Calças e proteção inferior';

    case 'BOOTS':
      return 'Botas e deslocamento';

    case 'CONSUMABLE':
      return 'Consumíveis';

    case 'MULTIPLE':
      return 'Materiais versáteis';

    case 'UNLINKED':
      return 'Materiais sem receita vinculada';

    default:
      return formatGatheringOutputItemSlot(groupKey);
  }
}

function getGroupDescription(groupKey: string): string {
  switch (groupKey) {
    case 'MAIN_HAND':
      return 'Materiais usados principalmente para criar armas.';

    case 'OFF_HAND':
      return 'Materiais usados em escudos, apoios e itens secundários.';

    case 'HEAD':
      return 'Materiais usados em elmos, máscaras e proteção de cabeça.';

    case 'ARMOR':
      return 'Materiais usados em coletes, jaquetas e armaduras.';

    case 'PANTS':
      return 'Materiais usados em calças e proteções inferiores.';

    case 'BOOTS':
      return 'Materiais usados em botas e equipamentos de marcha.';

    case 'CONSUMABLE':
      return 'Materiais usados em itens de uso e suporte.';

    case 'MULTIPLE':
      return 'Materiais usados em mais de um tipo de equipamento.';

    case 'UNLINKED':
      return 'Materiais ainda sem uso de receita exibido pela API.';

    default:
      return 'Materiais desta categoria.';
  }
}

function compareMaterials(
  first: GatheringMaterialViewModel,
  second: GatheringMaterialViewModel,
): number {
  const firstRequiredLevel = getGatheringRequiredLevel(first);
  const secondRequiredLevel = getGatheringRequiredLevel(second);

  if (firstRequiredLevel !== secondRequiredLevel) {
    return firstRequiredLevel - secondRequiredLevel;
  }

  if (first.tier !== second.tier) {
    return first.tier - second.tier;
  }

  return first.name.localeCompare(second.name, 'pt-BR');
}

function buildMaterialGroups(
  materials: GatheringMaterialViewModel[],
): MaterialGroup[] {
  const groupsByKey = new Map<string, GatheringMaterialViewModel[]>();

  for (const material of materials) {
    const groupKey = getMaterialGroupKey(material);
    const currentGroup = groupsByKey.get(groupKey) ?? [];

    currentGroup.push(material);
    groupsByKey.set(groupKey, currentGroup);
  }

  const orderedKeys = [
    ...GROUP_ORDER.filter((groupKey) => groupsByKey.has(groupKey)),
    ...Array.from(groupsByKey.keys()).filter(
      (groupKey) =>
        !GROUP_ORDER.includes(groupKey as (typeof GROUP_ORDER)[number]),
    ),
  ];

  return orderedKeys.map((groupKey) => ({
    key: groupKey,
    title: getGroupTitle(groupKey),
    description: getGroupDescription(groupKey),
    materials: [...(groupsByKey.get(groupKey) ?? [])].sort(compareMaterials),
  }));
}

function getMaterialUsageCount(material: GatheringMaterialViewModel): number {
  return material.usedInRecipeCount ?? material.usedInRecipes?.length ?? 0;
}

function getMaterialListSummary(materials: GatheringMaterialViewModel[]): string {
  if (materials.length <= 0) {
    return 'Nenhum material encontrado.';
  }

  const recipeLinkedCount = materials.filter(
    (material) => getMaterialUsageCount(material) > 0,
  ).length;

  if (recipeLinkedCount <= 0) {
    return `${materials.length} material(is) disponível(is).`;
  }

  return `${materials.length} material(is) · ${recipeLinkedCount} com receita vinculada`;
}

function getGroupUsageHint(materials: GatheringMaterialViewModel[]): string {
  const recipeNames = materials
    .map((material) => getGatheringMaterialPrimaryRecipe(material))
    .filter((recipe): recipe is GatheringMaterialRecipeUsageViewModel =>
      Boolean(recipe),
    )
    .map((recipe) => recipe.outputItemName);

  const uniqueRecipeNames = Array.from(new Set(recipeNames));

  if (uniqueRecipeNames.length <= 0) {
    return 'Sem item fabricado vinculado.';
  }

  const displayedRecipes = uniqueRecipeNames.slice(0, 3);
  const hiddenCount = Math.max(
    0,
    uniqueRecipeNames.length - displayedRecipes.length,
  );

  if (hiddenCount > 0) {
    return `Fabrica: ${displayedRecipes.join(' / ')} +${hiddenCount}`;
  }

  return `Fabrica: ${displayedRecipes.join(' / ')}`;
}

export function GatheringMaterialList({
  materials,
  gatheringSkill,
  fallbackRatePerHour,
  selectedMaterialId,
  activeMaterialId,
  isBusy = false,
  onSelectMaterial,
  onStartMaterial,
  onViewMaterialUsage,
}: GatheringMaterialListProps) {
  const safeMaterials = Array.isArray(materials) ? materials : [];
  const materialGroups = buildMaterialGroups(safeMaterials);

  if (safeMaterials.length <= 0) {
    return (
      <div className="gathering-empty gathering-empty--compact">
        <strong>Nenhum material disponível.</strong>
        <p>
          Não encontramos materiais para este tipo de gathering no mapa atual.
        </p>
      </div>
    );
  }

  return (
    <div className="gathering-materials">
      <div className="gathering-materials-toolbar gathering-materials-toolbar--compact">
        <span className="gathering-materials-toolbar__summary">
          <strong>{getMaterialListSummary(safeMaterials)}</strong>
        </span>
      </div>

      <div className="gathering-material-groups">
        {materialGroups.map((group) => (
          <section key={group.key} className="gathering-material-group">
            <header className="gathering-material-group__header">
              <div>
                <h3>{group.title}</h3>
                <p>{group.description}</p>
                <span>{getGroupUsageHint(group.materials)}</span>
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
                  onSelect={onSelectMaterial}
                  onStart={onStartMaterial}
                  onViewUsage={onViewMaterialUsage}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default GatheringMaterialList;