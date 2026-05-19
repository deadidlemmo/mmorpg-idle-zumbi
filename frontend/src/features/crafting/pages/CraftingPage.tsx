import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import npcArsenalNogueira from '../../../assets/images/npcs/npc_arsenal_nogueira.png';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Hammer,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import {
  ATTRIBUTE_STATS_CONFIG,
  type DashboardAttributeKey,
} from '../../dashboard/constants/stats-config';
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
  CraftingSessionViewModel,
  CraftingSkillViewModel,
  CraftingSlot,
} from '../types/crafting.types';

const CHARACTER_CLASS_FILTER = 'CHARACTER';
const CRAFTING_FILTER_STORAGE_PREFIX = 'dead_idle_crafting_filters';

type CraftingTierFilter = 'CURRENT' | 'ALL' | number;
type CraftingClassFilter = 'ALL' | typeof CHARACTER_CLASS_FILTER | string;
type CraftingDropdownOption = {
  value: string;
  label: string;
  className?: string;
};
type CraftingStoredFilters = {
  tier: CraftingTierFilter;
  class: CraftingClassFilter;
  slot: CraftingSlot | 'ALL';
  craftableOnly: boolean;
};
type CraftingBonusEntry = {
  key: DashboardAttributeKey;
  label: string;
  icon: string;
  tone: DashboardAttributeKey;
  value: number;
};

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

function formatDuration(totalSeconds?: number | null) {
  const safeSeconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${seconds}s`;
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

function getTierFilterValue(tierFilter: CraftingTierFilter) {
  return String(tierFilter);
}

function parseTierFilterValue(value: string): CraftingTierFilter {
  if (value === 'CURRENT' || value === 'ALL') {
    return value;
  }

  const tier = Number(value);

  if (!Number.isFinite(tier)) {
    return 'CURRENT';
  }

  return Math.max(1, Math.min(10, Math.floor(tier)));
}

function getCraftingFilterStorageKey(characterId: string) {
  return `${CRAFTING_FILTER_STORAGE_PREFIX}:${characterId}`;
}

function readStoredCraftingFilters(characterId: string): CraftingStoredFilters {
  const fallback: CraftingStoredFilters = {
    tier: 'CURRENT',
    class: CHARACTER_CLASS_FILTER,
    slot: 'ALL',
    craftableOnly: false,
  };

  if (!characterId || typeof window === 'undefined') {
    return fallback;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      getCraftingFilterStorageKey(characterId),
    );

    if (!rawValue) {
      return fallback;
    }

    const parsed = JSON.parse(rawValue) as Partial<
      Record<keyof CraftingStoredFilters, unknown>
    >;

    return {
      tier:
        typeof parsed.tier === 'string'
          ? parseTierFilterValue(parsed.tier)
          : fallback.tier,
      class:
        typeof parsed.class === 'string'
          ? parsed.class
          : fallback.class,
      slot:
        typeof parsed.slot === 'string'
          ? (parsed.slot as CraftingSlot | 'ALL')
          : fallback.slot,
      craftableOnly:
        typeof parsed.craftableOnly === 'boolean'
          ? parsed.craftableOnly
          : fallback.craftableOnly,
    };
  } catch {
    return fallback;
  }
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

  return ATTRIBUTE_STATS_CONFIG.map<CraftingBonusEntry>((config) => ({
    key: config.key,
    label: config.label,
    icon: config.icon,
    tone: config.tone,
    value: Math.floor(Number(bonuses[config.key]) || 0),
  })).filter((entry) => entry.value > 0);
}

function getCraftingDurationForQuantity(
  recipe: CraftingRecipeViewModel,
  quantity: number,
) {
  const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const baseDuration = Math.max(
    0,
    Math.floor(Number(recipe.craftingDurationSeconds) || 0),
  );

  return baseDuration * safeQuantity;
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

function CraftingDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: CraftingDropdownOption[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="crafting-dropdown-filter">
      <span>{label}</span>

      <div
        className="crafting-dropdown"
        onBlur={(event) => {
          const nextFocus = event.relatedTarget;

          if (
            nextFocus instanceof Node &&
            event.currentTarget.contains(nextFocus)
          ) {
            return;
          }

          setIsOpen(false);
        }}
      >
        <button
          type="button"
          className="crafting-dropdown__button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="crafting-dropdown__value">
            {selectedOption?.label ?? 'Selecionar'}
          </span>
          <ChevronDown aria-hidden="true" size={15} />
        </button>

        {isOpen ? (
          <div className="crafting-dropdown__menu" role="listbox">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={[
                  'crafting-dropdown__option',
                  option.className ?? '',
                  option.value === value ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
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

function CraftingDetailsModal({
  isOpen,
  recipe,
  characterId,
  quantity,
  onQuantityChange,
  onCraft,
  isBusy,
  craftingLevel,
  craftingSkill,
  onClose,
}: {
  isOpen: boolean;
  recipe: CraftingRecipeViewModel | null;
  characterId: string;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onCraft: (recipe: CraftingRecipeViewModel) => void;
  isBusy: boolean;
  craftingLevel: number;
  craftingSkill?: CraftingSkillViewModel | null;
  onClose: () => void;
}) {
  if (!isOpen || !recipe) {
    return null;
  }

  const bonusEntries = getBonusEntries(recipe);
  const maxQuantity = Math.max(1, recipe.maxCraftableTimes);
  const safeQuantity = Math.max(1, Math.min(quantity, maxQuantity));
  const totalDurationSeconds = getCraftingDurationForQuantity(
    recipe,
    safeQuantity,
  );
  const totalCraftingXp = recipe.craftingXpReward * safeQuantity;
  const xpRewardLabel = craftingSkill?.isAtLevelCap
    ? 'Criação no nível máximo'
    : `+${formatNumber(recipe.craftingXpReward)} XP por item`;

  return (
    <div
      className="crafting-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className={`crafting-side-card crafting-details-modal ${getRarityClassName(recipe.outputItem.rarity)}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crafting-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="crafting-modal-close"
          onClick={onClose}
          aria-label="Fechar detalhes"
        >
          <X aria-hidden="true" size={16} />
        </button>

        <div className="crafting-side-card__header">
          <span className="crafting-side-card__icon" aria-hidden="true">
            {getItemInitials(recipe.outputItem.name)}
          </span>

          <div>
            <span className="crafting-page__eyebrow">
              {formatSlot(recipe.outputItem.slot)}
            </span>
            <h2 id="crafting-details-title">{recipe.outputItem.name}</h2>
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

        <div className="crafting-modal-divider" aria-hidden="true" />

        {bonusEntries.length > 0 ? (
          <section className="crafting-side-card__section crafting-side-card__section--compact">
            <h3>Atributos</h3>

            <div className="crafting-bonus-grid">
              {bonusEntries.map((entry) => (
                <span
                  key={entry.key}
                  className={`crafting-bonus-card crafting-bonus-card--${entry.tone}`}
                >
                  <img src={entry.icon} alt="" />
                  <span>
                    <em>+{entry.value}</em>
                    <strong>{entry.label}</strong>
                  </span>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <div className="crafting-modal-divider" aria-hidden="true" />

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

        <div className="crafting-modal-divider" aria-hidden="true" />

        <div className="crafting-craft-summary">
          <span>
            <Clock3 aria-hidden="true" size={15} />
            Tempo total
            <strong>{formatDuration(totalDurationSeconds)}</strong>
          </span>
          <span>
            XP total
            <strong>
              {craftingSkill?.isAtLevelCap
                ? 'Nível máximo'
                : `+${formatNumber(totalCraftingXp)}`}
            </strong>
          </span>
        </div>

        <div className="crafting-side-card__actions">
          {recipe.canCraft ? (
            <div className="crafting-quantity-group">
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
              <button
                type="button"
                className="crafting-quantity-max"
                onClick={() => onQuantityChange(maxQuantity)}
                disabled={maxQuantity <= 1}
              >
                Máx.
              </button>
            </div>
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
                ? safeQuantity > 1
                  ? `Iniciar x${safeQuantity}`
                  : 'Iniciar criação'
                : 'Materiais insuficientes'}
          </button>
        </div>
      </aside>
    </div>
  );
}

function CraftingActivityPanel({
  session,
  remainingSeconds,
  progressPercent,
  onRefresh,
  isBusy,
}: {
  session?: CraftingSessionViewModel | null;
  remainingSeconds: number;
  progressPercent: number;
  onRefresh: () => void;
  isBusy: boolean;
}) {
  return (
    <section className="crafting-right-section">
      <div className="crafting-right-section__heading">
        <span className="crafting-page__eyebrow">Atividade atual</span>
        <button
          type="button"
          className="crafting-icon-button"
          onClick={onRefresh}
          disabled={isBusy}
          aria-label="Atualizar atividade de criação"
        >
          <RefreshCw aria-hidden="true" size={14} />
        </button>
      </div>

      <aside
        className={[
          'crafting-activity-card',
          session ? 'is-active' : 'is-empty',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Atividade atual de criação"
      >
        <div className="crafting-activity-card__header">
          <span className="crafting-side-card__icon" aria-hidden="true">
            {session ? getItemInitials(session.outputItem.name) : 'CR'}
          </span>

          <div>
            <strong>
              {session ? session.outputItem.name : 'Nenhuma criação ativa'}
            </strong>
            <span>
              {session
                ? `Produzindo ${formatNumber(session.outputQuantity)} item${
                    session.outputQuantity > 1 ? 's' : ''
                  }`
                : 'Escolha uma receita para iniciar uma fabricação.'}
            </span>
          </div>
        </div>

        {session ? (
          <>
            <span
              className="crafting-skill-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressPercent)}
            >
              <i style={{ width: `${progressPercent}%` }} />
            </span>

            <div className="crafting-activity-card__metrics">
              <span>Qtd. {formatNumber(session.outputQuantity)}</span>
              <span>
                <Clock3 aria-hidden="true" size={13} />
                Pronto em {formatDuration(remainingSeconds)}
              </span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
          </>
        ) : null}
      </aside>
    </section>
  );
}

function CraftingSkillPanel({
  skill,
  level,
  unlockedTier,
  xp,
  xpToNext,
  progressPercent,
  onRefresh,
  isBusy,
}: {
  skill?: CraftingSkillViewModel | null;
  level: number;
  unlockedTier: number;
  xp: number;
  xpToNext: number | null;
  progressPercent: number;
  onRefresh: () => void;
  isBusy: boolean;
}) {
  return (
    <section className="crafting-right-section">
      <div className="crafting-right-section__heading">
        <span className="crafting-page__eyebrow">Sua proficiência</span>
        <button
          type="button"
          className="crafting-icon-button"
          onClick={onRefresh}
          disabled={isBusy}
          aria-label="Atualizar criação"
        >
          <RefreshCw aria-hidden="true" size={14} />
        </button>
      </div>

      <aside className="crafting-skill-card" aria-label="Sua proficiência">
        <div className="crafting-skill-card__header">
          <span className="crafting-side-card__icon" aria-hidden="true">
            CR
          </span>

          <div>
            <strong>Criação</strong>
            <span>Tier liberado T{unlockedTier}</span>
          </div>
        </div>

        <span
          className="crafting-skill-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPercent)}
        >
          <i style={{ width: `${progressPercent}%` }} />
        </span>

        <div className="crafting-skill-card__metrics">
          <span>Nv. {formatNumber(level)}</span>
          <span>
            {skill?.isAtLevelCap || xpToNext === null
              ? 'Nível máximo'
              : `${formatNumber(Math.max(0, xpToNext - xp))} XP necessários`}
          </span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
      </aside>
    </section>
  );
}

export function CraftingPage() {
  const { characterId } = useParams();
  const safeCharacterId = characterId ?? '';
  const storedFilters = useMemo(
    () => readStoredCraftingFilters(safeCharacterId),
    [safeCharacterId],
  );

  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [recipesResponse, setRecipesResponse] =
    useState<CraftingRecipesResponse | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [tierFilter, setTierFilter] = useState<CraftingTierFilter>(
    storedFilters.tier,
  );
  const [classFilter, setClassFilter] = useState<CraftingClassFilter>(
    storedFilters.class,
  );
  const [slotFilter, setSlotFilter] = useState<CraftingSlot | 'ALL'>(
    storedFilters.slot,
  );
  const [craftableOnly, setCraftableOnly] = useState(
    storedFilters.craftableOnly,
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [craftQuantity, setCraftQuantity] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());
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
  const characterClassId = recipesResponse?.character.class?.id ?? null;
  const characterClassName = recipesResponse?.character.class?.name ?? null;
  const activeCraftingSession = recipesResponse?.activeSession ?? null;
  const activeCraftingSessionId = activeCraftingSession?.id ?? null;
  const activeCraftingRemainingSeconds = activeCraftingSession
    ? Math.max(
        0,
        Math.ceil(
          (new Date(activeCraftingSession.completesAt).getTime() - nowMs) /
            1000,
        ),
      )
    : 0;
  const activeCraftingProgressPercent = activeCraftingSession
    ? clampPercent(
        ((Math.max(1, activeCraftingSession.durationSeconds) -
          activeCraftingRemainingSeconds) /
          Math.max(1, activeCraftingSession.durationSeconds)) *
          100,
      )
    : 0;
  const tierFilterOptions = useMemo<CraftingDropdownOption[]>(
    () =>
      TIER_FILTERS.map((tier) => ({
        value: getTierFilterValue(tier),
        label:
          tier === 'CURRENT'
            ? `Meu tier (T${currentCraftingTier})`
            : tier === 'ALL'
              ? 'Todos os tiers'
              : `Tier ${tier}`,
        className:
          typeof tier === 'number'
            ? `crafting-dropdown__option--tier ${getTierBandClassName(tier)}`
            : undefined,
      })),
    [currentCraftingTier],
  );
  const classFilterOptions = useMemo<CraftingDropdownOption[]>(
    () => [
      { value: 'ALL', label: 'Todas as classes' },
      {
        value: CHARACTER_CLASS_FILTER,
        label: characterClassName
          ? `Minha classe (${characterClassName})`
          : 'Minha classe',
      },
      ...classFilters.map((filter) => ({
        value: filter.key,
        label: filter.label,
      })),
    ],
    [characterClassName, classFilters],
  );
  const slotFilterOptions = useMemo<CraftingDropdownOption[]>(
    () =>
      SLOT_FILTERS.map((slot) => ({
        value: slot.key,
        label: slot.key === 'ALL' ? 'Todos os tipos' : slot.label,
      })),
    [],
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

      const completedSessions = recipesData.completedSessions ?? [];

      if (completedSessions.length > 0) {
        const completedLabel = completedSessions
          .map(
            (session) =>
              `${session.outputItem.name} x${formatNumber(
                session.outputQuantity,
              )}`,
          )
          .join(', ');

        setFeedback(`Fabricação concluída: ${completedLabel}.`);
      }
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

  useEffect(() => {
    if (!safeCharacterId || typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(
      getCraftingFilterStorageKey(safeCharacterId),
      JSON.stringify({
        tier: getTierFilterValue(tierFilter),
        class: classFilter,
        slot: slotFilter,
        craftableOnly,
      }),
    );
  }, [classFilter, craftableOnly, safeCharacterId, slotFilter, tierFilter]);

  useEffect(() => {
    if (!activeCraftingSessionId) {
      return;
    }

    const tickTimer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(tickTimer);
  }, [activeCraftingSessionId]);

  useEffect(() => {
    if (!activeCraftingSessionId || activeCraftingRemainingSeconds > 0) {
      return;
    }

    const refreshTimer = window.setTimeout(() => {
      void loadCraftingData();
    }, 500);

    return () => window.clearTimeout(refreshTimer);
  }, [
    activeCraftingRemainingSeconds,
    activeCraftingSessionId,
    loadCraftingData,
  ]);

  const filteredRecipes = useMemo(() => {
    const resolvedTierFilter = getResolvedTierFilter(
      tierFilter,
      currentCraftingTier,
    );
    const resolvedClassFilter =
      classFilter === CHARACTER_CLASS_FILTER
        ? (characterClassId ?? 'ALL')
        : classFilter;

    return recipes.filter((recipe) => {
      if (
        resolvedTierFilter !== 'ALL' &&
        recipe.outputItem.tier !== resolvedTierFilter
      ) {
        return false;
      }

      if (
        resolvedClassFilter !== 'ALL' &&
        getRecipeClassKey(recipe) !== resolvedClassFilter
      ) {
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
    characterClassId,
    searchTerm,
    slotFilter,
    tierFilter,
  ]);

  const selectedRecipe = useMemo(() => {
    if (!selectedRecipeId) {
      return null;
    }

    return (
      filteredRecipes.find((recipe) => recipe.recipeId === selectedRecipeId) ??
      null
    );
  }, [filteredRecipes, selectedRecipeId]);

  const handleSelectRecipe = useCallback((recipe: CraftingRecipeViewModel) => {
    setSelectedRecipeId(recipe.recipeId);
    setCraftQuantity(1);
    setFeedback(null);
    setIsDetailsModalOpen(true);
  }, []);

  async function handleCraft(recipe: CraftingRecipeViewModel) {
    if (!safeCharacterId || !recipe.canCraft || isCrafting) return;

    if (activeCraftingSession) {
      setErrorMessage(
        'Aguarde a fabricação atual terminar antes de iniciar outra.',
      );
      return;
    }

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
      const sessionDuration =
        result.craftingSession?.durationSeconds ??
        getCraftingDurationForQuantity(recipe, safeQuantity);

      setFeedback(
        `Fabricação iniciada: ${result.craftedItem.name}${
          safeQuantity > 1 ? ` x${safeQuantity}` : ''
        }. Pronto em ${formatDuration(sessionDuration)}.`,
      );
      setIsDetailsModalOpen(false);
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
              <div className="crafting-filter-select-grid">
                <CraftingDropdown
                  label="Tier"
                  value={getTierFilterValue(tierFilter)}
                  options={tierFilterOptions}
                  onChange={(value) => setTierFilter(parseTierFilterValue(value))}
                />

                <CraftingDropdown
                  label="Classe"
                  value={classFilter}
                  options={classFilterOptions}
                  onChange={setClassFilter}
                />

                <CraftingDropdown
                  label="Tipo"
                  value={slotFilter}
                  options={slotFilterOptions}
                  onChange={(value) => setSlotFilter(value as CraftingSlot | 'ALL')}
                />

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
                  isBusy={isCrafting || Boolean(activeCraftingSession)}
                />
              ))}
            </div>
          </main>

          <aside className="crafting-side-column">
            <CraftingActivityPanel
              session={activeCraftingSession}
              remainingSeconds={activeCraftingRemainingSeconds}
              progressPercent={activeCraftingProgressPercent}
              onRefresh={() => void loadCraftingData()}
              isBusy={isLoading || isCrafting}
            />

            <CraftingSkillPanel
              skill={currentCraftingSkill}
              level={currentCraftingLevel}
              unlockedTier={currentCraftingTier}
              xp={currentCraftingXp}
              xpToNext={currentCraftingXpToNext}
              progressPercent={currentCraftingProgressPercent}
              onRefresh={() => void loadCraftingData()}
              isBusy={isLoading || isCrafting}
            />
          </aside>
        </section>

        <CraftingDetailsModal
          isOpen={isDetailsModalOpen}
          recipe={selectedRecipe}
          characterId={safeCharacterId}
          quantity={craftQuantity}
          onQuantityChange={setCraftQuantity}
          onCraft={(recipe) => void handleCraft(recipe)}
          isBusy={isCrafting || Boolean(activeCraftingSession)}
          craftingLevel={currentCraftingLevel}
          craftingSkill={currentCraftingSkill}
          onClose={() => setIsDetailsModalOpen(false)}
        />
      </section>
    </DashboardLayout>
  );
}

export default CraftingPage;
