import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import npcArsenalNogueira from '../../../assets/images/npcs/npc_arsenal_nogueira.png';
import {
  CheckCircle2,
  ChevronRight,
  Hammer,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type { DashboardCharacterViewModel } from '../../dashboard/types/dashboard.types';
import '../../gathering/styles/gathering.css';
import { buildGatheringDashboardCharacter } from '../../gathering/utils/gathering-dashboard-character';
import {
  craftItemRequest,
  extractCraftingApiError,
  listCraftingRecipesRequest,
} from '../api/crafting.api';
import '../styles/crafting.css';
import type {
  CraftingIngredientViewModel,
  CraftingOrigin,
  CraftingRecipeViewModel,
  CraftingRecipesResponse,
  CraftingSkillViewModel,
  CraftingSlot,
} from '../types/crafting.types';

type CraftingTierFilter = 'CURRENT' | 'ALL' | number;
type CraftingClassFilter = 'ALL' | string;

const SLOT_FILTERS: Array<{ key: CraftingSlot | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'Todos' },
  { key: 'MAIN_HAND', label: 'Arma' },
  { key: 'OFF_HAND', label: 'Apoio' },
  { key: 'HEAD', label: 'Elmo' },
  { key: 'ARMOR', label: 'Armadura' },
  { key: 'PANTS', label: 'Pernas' },
  { key: 'BOOTS', label: 'Pés' },
];

const TIER_FILTERS: CraftingTierFilter[] = [
  'CURRENT',
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  'ALL',
];

const EMPTY_RECIPES: CraftingRecipeViewModel[] = [];

const CRAFTING_NPC = {
  name: 'Nogueira, mestre de bancada',
  role: 'Serviço de criação',
  title: 'Toda peça tem um segundo destino',
  quote:
    'Se dá para desmontar, dá para reforçar. Se dá para reforçar, dá para vender.',
  description:
    'Use materiais de expedição, resíduos e biomateriais para montar equipamentos de qualquer classe e alimentar a economia do abrigo.',
};

const ORIGIN_TO_GATHERING_SLUG: Partial<Record<CraftingOrigin, string>> = {
  DESMANCHE: 'desmanche',
  COLETA: 'coleta',
  PATRULHA: 'patrulha',
  ARSENAL: 'arsenal',
  TECNOVARREDURA: 'tecnovarredura',
  CONTENCAO: 'contencao',
};

function normalizeText(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatNumber(value?: number | null) {
  const safeValue = Math.max(0, Math.floor(Number(value) || 0));

  return safeValue.toLocaleString('pt-BR');
}

function clampPercent(value?: number | null) {
  const percent = Number(value ?? 0);

  if (!Number.isFinite(percent)) {
    return 0;
  }

  return Math.max(0, Math.min(100, percent));
}

function formatSlot(slot?: string | null) {
  switch (slot) {
    case 'MAIN_HAND':
      return 'Arma';
    case 'OFF_HAND':
      return 'Apoio';
    case 'HEAD':
      return 'Elmo';
    case 'ARMOR':
      return 'Armadura';
    case 'PANTS':
      return 'Pernas';
    case 'BOOTS':
      return 'Pés';
    default:
      return slot ?? 'Item';
  }
}

function formatOrigin(origin?: string | null) {
  switch (origin) {
    case 'DESMANCHE':
      return 'Desmanche';
    case 'COLETA':
      return 'Coleta';
    case 'CONTENCAO':
      return 'Contenção';
    case 'ARSENAL':
      return 'Arsenal';
    case 'PATRULHA':
      return 'Patrulha';
    case 'TECNOVARREDURA':
      return 'Tecnovarredura';
    case 'DROP_MOBS':
      return 'Mobs';
    default:
      return origin ?? 'Origem';
  }
}

function formatRole(role?: string | null) {
  switch (role) {
    case 'MAIN_COMPONENT':
      return 'Principal';
    case 'SHARED_MATERIAL':
      return 'Secundário';
    case 'RARE_MOB_DROP':
      return 'Drop de mob';
    default:
      return role ?? 'Ingrediente';
  }
}

function getItemInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function getRarityClassName(rarity?: string | null) {
  return `rarity-${String(rarity ?? 'COMMON').toLowerCase()}`;
}

function getTierBandClassName(tier?: number | null) {
  const safeTier = Number(tier) || 1;

  if (safeTier >= 9) return 'tier-band-legendary';
  if (safeTier >= 7) return 'tier-band-epic';
  if (safeTier >= 5) return 'tier-band-rare';
  if (safeTier >= 3) return 'tier-band-uncommon';

  return 'tier-band-common';
}

function getCurrentCraftingTier(
  recipesResponse?: CraftingRecipesResponse | null,
) {
  const responseTier = Number(
    recipesResponse?.character.craftingSkill?.unlockedTier ??
      recipesResponse?.character.unlockedTier ??
      1,
  );

  if (Number.isFinite(responseTier) && responseTier > 0) {
    return Math.max(1, Math.min(10, Math.floor(responseTier)));
  }

  return 1;
}

function getResolvedTierFilter(
  tierFilter: CraftingTierFilter,
  currentCraftingTier: number,
) {
  return tierFilter === 'CURRENT' ? currentCraftingTier : tierFilter;
}

function getRecipeClassKey(recipe: CraftingRecipeViewModel) {
  return recipe.outputItem.classId ?? 'GENERAL';
}

function getRecipeClassLabel(recipe: CraftingRecipeViewModel) {
  return recipe.outputItem.class?.name ?? 'Geral';
}

function getBonusEntries(recipe?: CraftingRecipeViewModel | null) {
  const bonuses = recipe?.outputItem.bonuses;

  if (!bonuses) return [];

  const entries: Array<[string, number | null | undefined]> = [
    ['Força', bonuses.strength],
    ['Vitalidade', bonuses.vitality],
    ['Agilidade', bonuses.agility],
    ['Precisão', bonuses.precision],
    ['Técnica', bonuses.technique],
    ['Vontade', bonuses.willpower],
  ];

  return entries
    .map(([label, value]) => [label, Math.floor(Number(value) || 0)] as const)
    .filter(([, value]) => value > 0);
}

function recipeMatchesSearch(recipe: CraftingRecipeViewModel, search: string) {
  const normalizedSearch = normalizeText(search).trim();

  if (!normalizedSearch) {
    return true;
  }

  const haystack = normalizeText(
    [
      recipe.outputItem.name,
      recipe.outputItem.family,
      getRecipeClassLabel(recipe),
      recipe.outputItem.map?.name,
      formatSlot(recipe.outputItem.slot),
      ...recipe.ingredients.map((ingredient) => ingredient.name),
    ].join(' '),
  );

  return haystack.includes(normalizedSearch);
}

function getRecipeStatusLabel(recipe: CraftingRecipeViewModel) {
  if (!recipe.isUnlocked) return `Criação Nv. ${recipe.requiredCraftingLevel}`;
  if (recipe.canCraft) return 'Pronta';
  if (recipe.ownedQuantity > 0) return 'Já possui';

  return `Faltam ${formatNumber(recipe.progress.missingTotal)}`;
}

function RecipeCard({
  recipe,
  isSelected,
  onSelect,
  onCraft,
  isBusy,
}: {
  recipe: CraftingRecipeViewModel;
  isSelected: boolean;
  onSelect: (recipe: CraftingRecipeViewModel) => void;
  onCraft: (recipe: CraftingRecipeViewModel) => void;
  isBusy: boolean;
}) {
  const progressPercent = clampPercent(recipe.progress.percent);

  return (
    <article
      className={[
        'crafting-recipe-card',
        getRarityClassName(recipe.outputItem.rarity),
        isSelected ? 'is-selected' : '',
        recipe.canCraft ? 'is-ready' : '',
        !recipe.isUnlocked ? 'is-locked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="crafting-recipe-card__select"
        onClick={() => onSelect(recipe)}
        aria-pressed={isSelected}
      >
        <span className="crafting-recipe-card__icon" aria-hidden="true">
          {getItemInitials(recipe.outputItem.name)}
        </span>

        <span className="crafting-recipe-card__body">
          <span className="crafting-recipe-card__meta">
            <em
              className={`crafting-tier-pill ${getTierBandClassName(
                recipe.outputItem.tier,
              )}`}
            >
              T{recipe.outputItem.tier}
            </em>
            <em>{getRecipeClassLabel(recipe)}</em>
            <em>{formatSlot(recipe.outputItem.slot)}</em>
            <em>+{formatNumber(recipe.craftingXpReward)} XP</em>
          </span>

          <strong>{recipe.outputItem.name}</strong>

          <span className="crafting-recipe-card__subline">
            {recipe.outputItem.map?.name ?? 'Mapa não vinculado'}
          </span>

          <span
            className="crafting-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPercent)}
          >
            <i style={{ width: `${progressPercent}%` }} />
          </span>
        </span>

        <ChevronRight aria-hidden="true" size={18} />
      </button>

      <div className="crafting-recipe-card__footer">
        <span
          className={[
            'crafting-status-pill',
            recipe.canCraft ? 'crafting-status-pill--ready' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {recipe.canCraft ? (
            <CheckCircle2 aria-hidden="true" size={14} />
          ) : (
            <ShieldAlert aria-hidden="true" size={14} />
          )}
          {getRecipeStatusLabel(recipe)}
        </span>

        <button
          type="button"
          className="crafting-button crafting-button--compact"
          onClick={() => onCraft(recipe)}
          disabled={!recipe.canCraft || isBusy}
        >
          <Hammer aria-hidden="true" size={14} />
          {recipe.isUnlocked ? 'Criar' : 'Bloqueado'}
        </button>
      </div>
    </article>
  );
}

function IngredientRow({
  ingredient,
}: {
  ingredient: CraftingIngredientViewModel;
}) {
  const percent =
    ingredient.required <= 0
      ? 0
      : clampPercent((ingredient.available / ingredient.required) * 100);

  return (
    <li
      className={[
        'crafting-ingredient',
        ingredient.hasEnough ? 'is-complete' : 'is-missing',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="crafting-ingredient__main">
        <span className="crafting-ingredient__icon" aria-hidden="true">
          {ingredient.origin === 'DROP_MOBS' ? 'DM' : getItemInitials(ingredient.name)}
        </span>

        <div>
          <strong>{ingredient.name}</strong>
          <span>
            {formatRole(ingredient.role)} • {formatOrigin(ingredient.origin)}
          </span>
        </div>
      </div>

      <div className="crafting-ingredient__amount">
        <strong>
          {formatNumber(ingredient.available)} / {formatNumber(ingredient.required)}
        </strong>
        {ingredient.missing > 0 ? (
          <span>Faltam {formatNumber(ingredient.missing)}</span>
        ) : (
          <span>Completo</span>
        )}
      </div>

      <span className="crafting-ingredient__bar" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </span>
    </li>
  );
}

function CraftingDetailsPanel({
  recipe,
  characterId,
  quantity,
  onQuantityChange,
  onCraft,
  isBusy,
  craftingLevel,
  craftingSkill,
}: {
  recipe: CraftingRecipeViewModel | null;
  characterId: string;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onCraft: (recipe: CraftingRecipeViewModel) => void;
  isBusy: boolean;
  craftingLevel: number;
  craftingSkill?: CraftingSkillViewModel | null;
}) {
  if (!recipe) {
    return (
      <aside className="crafting-side-card crafting-side-card--empty">
        <Package aria-hidden="true" size={34} />
        <strong>Selecione uma receita</strong>
        <p>Escolha um item da lista para ver ingredientes, atributos e ações.</p>
      </aside>
    );
  }

  const bonusEntries = getBonusEntries(recipe);
  const maxQuantity = Math.max(1, recipe.maxCraftableTimes);
  const safeQuantity = Math.max(1, Math.min(quantity, maxQuantity));
  const xpRewardLabel = craftingSkill?.isAtLevelCap
    ? 'Criação no nível máximo'
    : `+${formatNumber(recipe.craftingXpReward)} XP de criação`;

  return (
    <aside className={`crafting-side-card ${getRarityClassName(recipe.outputItem.rarity)}`}>
      <div className="crafting-side-card__header">
        <span className="crafting-side-card__icon" aria-hidden="true">
          {getItemInitials(recipe.outputItem.name)}
        </span>

        <div>
          <span className="crafting-page__eyebrow">
            {formatSlot(recipe.outputItem.slot)}
          </span>
          <h2>{recipe.outputItem.name}</h2>
          <p>{recipe.outputItem.description ?? 'Equipamento craftável.'}</p>
          <span className="crafting-side-card__reward">
            {xpRewardLabel}
          </span>
        </div>
      </div>

      {!recipe.isUnlocked ? (
        <div className="crafting-lock-warning">
          <ShieldAlert aria-hidden="true" size={16} />
          <span>
            Requer criação Nv. {recipe.requiredCraftingLevel}. Seu nível atual:{' '}
            {formatNumber(craftingLevel)}.
          </span>
        </div>
      ) : null}

      {bonusEntries.length > 0 ? (
        <section className="crafting-side-card__section">
          <h3>Atributos</h3>

          <div className="crafting-bonus-grid">
            {bonusEntries.map(([label, value]) => (
              <span key={label}>
                <em>+{value}</em>
                {label}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="crafting-side-card__section">
        <div className="crafting-section-heading">
          <h3>Ingredientes</h3>
          <span>
            {formatNumber(recipe.progress.availableTotal)} /{' '}
            {formatNumber(recipe.progress.requiredTotal)}
          </span>
        </div>

        <ul className="crafting-ingredients-list">
          {recipe.ingredients.map((ingredient) => (
            <IngredientRow key={ingredient.id} ingredient={ingredient} />
          ))}
        </ul>
      </section>

      {!recipe.canCraft ? (
        <section className="crafting-side-card__section">
          <h3>Onde buscar</h3>

          <div className="crafting-next-actions">
            {recipe.missingByOrigin.map((group) => {
              const gatheringSlug = ORIGIN_TO_GATHERING_SLUG[group.origin];
              const label =
                group.origin === 'DROP_MOBS'
                  ? 'Auto-combate'
                  : formatOrigin(group.origin);
              const to =
                group.origin === 'DROP_MOBS'
                  ? `/dashboard/${characterId}/auto-combat`
                  : `/dashboard/${characterId}/gathering/${gatheringSlug}`;

              return (
                <Link
                  key={group.origin}
                  className="crafting-action-link"
                  to={to}
                >
                  <span>
                    <strong>{label}</strong>
                    <em>{formatNumber(group.totalMissing)} faltando</em>
                  </span>
                  <ChevronRight aria-hidden="true" size={16} />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="crafting-side-card__actions">
        {recipe.canCraft ? (
          <label className="crafting-quantity">
            <span>Qtd.</span>
            <input
              type="number"
              min={1}
              max={maxQuantity}
              value={safeQuantity}
              onChange={(event) =>
                onQuantityChange(Number(event.currentTarget.value))
              }
            />
          </label>
        ) : null}

        <button
          type="button"
          className="crafting-button crafting-button--primary"
          onClick={() => onCraft(recipe)}
          disabled={!recipe.canCraft || isBusy}
        >
          <Hammer aria-hidden="true" size={16} />
          {!recipe.isUnlocked
            ? 'Nível insuficiente'
            : recipe.canCraft
              ? 'Criar item'
              : 'Materiais insuficientes'}
        </button>
      </div>
    </aside>
  );
}

export function CraftingPage() {
  const { characterId } = useParams();
  const safeCharacterId = characterId ?? '';

  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [recipesResponse, setRecipesResponse] =
    useState<CraftingRecipesResponse | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<CraftingTierFilter>('CURRENT');
  const [classFilter, setClassFilter] = useState<CraftingClassFilter>('ALL');
  const [slotFilter, setSlotFilter] = useState<CraftingSlot | 'ALL'>('ALL');
  const [craftableOnly, setCraftableOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [craftQuantity, setCraftQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isCrafting, setIsCrafting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const recipes = useMemo(
    () => recipesResponse?.recipes ?? EMPTY_RECIPES,
    [recipesResponse],
  );

  const classFilters = useMemo(() => {
    const filters = new Map<string, { key: string; label: string; count: number }>();

    for (const recipe of recipes) {
      const key = getRecipeClassKey(recipe);
      const label = getRecipeClassLabel(recipe);
      const current = filters.get(key);

      filters.set(key, {
        key,
        label,
        count: (current?.count ?? 0) + 1,
      });
    }

    return Array.from(filters.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [recipes]);

  const currentCraftingTier = getCurrentCraftingTier(recipesResponse);
  const currentCraftingSkill = recipesResponse?.character.craftingSkill ?? null;
  const currentCraftingLevel =
    currentCraftingSkill?.level ?? recipesResponse?.character.craftingLevel ?? 1;
  const currentCraftingXp = Math.max(0, Number(currentCraftingSkill?.xp ?? 0));
  const currentCraftingXpToNext =
    currentCraftingSkill?.xpToNextLevel ?? null;
  const currentCraftingProgressPercent = clampPercent(
    currentCraftingSkill?.xpProgressPercent ?? 0,
  );

  const loadCraftingData = useCallback(async () => {
    if (!safeCharacterId) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [overviewResponse, recipesData] = await Promise.all([
        getCharacterOverview(safeCharacterId),
        listCraftingRecipesRequest({ characterId: safeCharacterId }),
      ]);

      setCharacter(buildGatheringDashboardCharacter(overviewResponse));
      setRecipesResponse(recipesData);
    } catch (error) {
      setErrorMessage(extractCraftingApiError(error));
    } finally {
      setIsLoading(false);
    }
  }, [safeCharacterId]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadCraftingData();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadCraftingData]);

  const filteredRecipes = useMemo(() => {
    const resolvedTierFilter = getResolvedTierFilter(
      tierFilter,
      currentCraftingTier,
    );

    return recipes.filter((recipe) => {
      if (
        resolvedTierFilter !== 'ALL' &&
        recipe.outputItem.tier !== resolvedTierFilter
      ) {
        return false;
      }

      if (classFilter !== 'ALL' && getRecipeClassKey(recipe) !== classFilter) {
        return false;
      }

      if (slotFilter !== 'ALL' && recipe.outputItem.slot !== slotFilter) {
        return false;
      }

      if (craftableOnly && !recipe.canCraft) {
        return false;
      }

      return recipeMatchesSearch(recipe, searchTerm);
    });
  }, [
    classFilter,
    craftableOnly,
    currentCraftingTier,
    recipes,
    searchTerm,
    slotFilter,
    tierFilter,
  ]);

  const selectedRecipe = useMemo(() => {
    return (
      filteredRecipes.find((recipe) => recipe.recipeId === selectedRecipeId) ??
      filteredRecipes[0] ??
      null
    );
  }, [filteredRecipes, selectedRecipeId]);

  const handleSelectRecipe = useCallback((recipe: CraftingRecipeViewModel) => {
    setSelectedRecipeId(recipe.recipeId);
    setCraftQuantity(1);
    setFeedback(null);
  }, []);

  async function handleCraft(recipe: CraftingRecipeViewModel) {
    if (!safeCharacterId || !recipe.canCraft || isCrafting) return;

    const safeQuantity = Math.max(
      1,
      Math.min(Math.floor(craftQuantity || 1), recipe.maxCraftableTimes || 1),
    );

    setIsCrafting(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const result = await craftItemRequest({
        characterId: safeCharacterId,
        itemId: recipe.outputItem.id,
        quantity: safeQuantity,
      });
      const xpGained = result.craftingProgress?.xpGained ?? 0;
      const levelText = result.craftingProgress?.leveledUp
        ? ` Criação subiu para Nv. ${result.craftingProgress.newLevel}.`
        : '';

      setFeedback(
        `${result.craftedItem.name} criado com sucesso${
          safeQuantity > 1 ? ` x${safeQuantity}` : ''
        }. +${formatNumber(xpGained)} XP de criação.${levelText}`,
      );
      await loadCraftingData();
    } catch (error) {
      setErrorMessage(extractCraftingApiError(error));
    } finally {
      setIsCrafting(false);
    }
  }

  if (!safeCharacterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando criação...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar criação</h1>
        <p>{errorMessage || 'Não foi possível carregar este personagem.'}</p>
        <Link to="/characters" className="btn btn-primary">
          Voltar para seleção
        </Link>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="crafting-page gathering-page gathering-page--clean">
        <section className="gathering-origin-intro-grid crafting-intro-grid">
          <article
            className="gathering-origin-lore-card gathering-origin-lore-card--npc gathering-origin-npc crafting-lore-card"
            aria-label="Guia de criação"
          >
            <div className="gathering-origin-npc__stage" aria-hidden="true">
              <div className="gathering-origin-npc__portrait">
                <img src={npcArsenalNogueira} alt="" />
              </div>
            </div>

            <div className="gathering-origin-npc__content">
              <div className="gathering-origin-npc__meta">
                <strong className="gathering-origin-npc__name">
                  {CRAFTING_NPC.name}
                </strong>

                <span className="gathering-origin-npc__role">
                  {CRAFTING_NPC.role}
                </span>
              </div>

              <h2>{CRAFTING_NPC.title}</h2>
              <blockquote>{CRAFTING_NPC.quote}</blockquote>
              <p>{CRAFTING_NPC.description}</p>

              <div className="gathering-origin-npc__chips">
                <span>Nv. criação {formatNumber(currentCraftingLevel)}</span>
                <span>
                  {currentCraftingXpToNext
                    ? `${formatNumber(currentCraftingXp)} / ${formatNumber(
                        currentCraftingXpToNext,
                      )} XP`
                    : 'XP máximo'}
                </span>
                <span>Tier liberado T{currentCraftingTier}</span>
                <span>Receitas multi-classe</span>
                <button
                  type="button"
                  className="crafting-button crafting-button--compact"
                  onClick={() => void loadCraftingData()}
                  disabled={isLoading || isCrafting}
                >
                  <RefreshCw aria-hidden="true" size={14} />
                  Atualizar
                </button>
              </div>

              <span
                className="crafting-skill-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(currentCraftingProgressPercent)}
              >
                <i style={{ width: `${currentCraftingProgressPercent}%` }} />
              </span>
            </div>
          </article>
        </section>

        {errorMessage ? (
          <div className="crafting-feedback crafting-feedback--error">
            {errorMessage}
          </div>
        ) : null}

        {feedback ? (
          <div className="crafting-feedback crafting-feedback--success">
            {feedback}
          </div>
        ) : null}

        <section className="crafting-layout" aria-label="Receitas de criação">
          <main className="crafting-main-panel">
            <div className="crafting-panel-header">
              <div>
                <span className="crafting-page__eyebrow">Receitas</span>
                <h2>Itens disponíveis</h2>
                <p>
                  Separe a bancada por tier, classe e tipo de equipamento.
                </p>
              </div>

              <label className="crafting-search">
                <Search aria-hidden="true" size={16} />
                <input
                  type="search"
                  placeholder="Buscar item ou material"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.currentTarget.value)}
                />
              </label>
            </div>

            <section className="crafting-filter-panel" aria-label="Filtros">
              <div className="crafting-filter-group">
                <span>Tier</span>
                <div className="crafting-filter-row">
                  {TIER_FILTERS.map((tier) => {
                    const tierLabel =
                      tier === 'CURRENT'
                        ? `Meu tier (T${currentCraftingTier})`
                        : tier === 'ALL'
                          ? 'Todos'
                          : `T${tier}`;
                    const tierClass =
                      typeof tier === 'number'
                        ? `crafting-tier-filter ${getTierBandClassName(tier)}`
                        : 'crafting-tier-filter crafting-tier-filter--all';

                    return (
                      <button
                        key={tier}
                        type="button"
                        className={[
                          tierFilter === tier ? 'is-active' : '',
                          tierClass,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => setTierFilter(tier)}
                      >
                        {tierLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="crafting-filter-group">
                <span>Classe</span>
                <div className="crafting-filter-row">
                  <button
                    type="button"
                    className={classFilter === 'ALL' ? 'is-active' : ''}
                    onClick={() => setClassFilter('ALL')}
                  >
                    Todas
                  </button>
                  {classFilters.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className={classFilter === filter.key ? 'is-active' : ''}
                      onClick={() => setClassFilter(filter.key)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="crafting-filter-group">
                <span>Tipo</span>
                <div className="crafting-filter-row">
                  {SLOT_FILTERS.map((slot) => (
                    <button
                      key={slot.key}
                      type="button"
                      className={slotFilter === slot.key ? 'is-active' : ''}
                      onClick={() => setSlotFilter(slot.key)}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="crafting-filter-group crafting-filter-group--compact">
                <span>Estado</span>
                <label
                  className={[
                    'crafting-checkbox-filter',
                    craftableOnly ? 'is-checked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={craftableOnly}
                    onChange={(event) =>
                      setCraftableOnly(event.currentTarget.checked)
                    }
                  />
                  <span
                    className="crafting-checkbox-filter__box"
                    aria-hidden="true"
                  >
                    <CheckCircle2 size={11} />
                  </span>
                  <span>Craftáveis</span>
                </label>
              </div>
            </section>

            {isLoading ? (
              <div className="crafting-state-card">
                <div className="loading-spinner" />
                <span>Carregando receitas...</span>
              </div>
            ) : null}

            {!isLoading && filteredRecipes.length <= 0 ? (
              <div className="crafting-state-card">
                <Package aria-hidden="true" size={24} />
                <strong>Nenhuma receita encontrada</strong>
                <span>Ajuste os filtros para visualizar outros itens.</span>
              </div>
            ) : null}

            <div className="crafting-recipe-list">
              {filteredRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.recipeId}
                  recipe={recipe}
                  isSelected={recipe.recipeId === selectedRecipe?.recipeId}
                  onSelect={handleSelectRecipe}
                  onCraft={(nextRecipe) => void handleCraft(nextRecipe)}
                  isBusy={isCrafting}
                />
              ))}
            </div>
          </main>

          <CraftingDetailsPanel
            recipe={selectedRecipe}
            characterId={safeCharacterId}
            quantity={craftQuantity}
            onQuantityChange={setCraftQuantity}
            onCraft={(recipe) => void handleCraft(recipe)}
            isBusy={isCrafting}
            craftingLevel={currentCraftingLevel}
            craftingSkill={currentCraftingSkill}
          />
        </section>
      </section>
    </DashboardLayout>
  );
}

export default CraftingPage;
