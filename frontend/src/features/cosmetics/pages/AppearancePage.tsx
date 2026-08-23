import { isAxiosError } from "axios";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Crown,
  Frame,
  Image,
  Layers3,
  Lock,
  Package,
  RotateCcw,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type { CharacterOverviewResponse } from "../../dashboard/types/dashboard.types";
import { buildDashboardCharacter } from "../../dashboard/utils/buildDashboardCharacter";
import {
  getCharacterCosmetics,
  updateCharacterAppearance,
} from "../api/cosmetics.api";
import { CharacterProfileCard } from "../components/CharacterProfileCard";
import {
  getCosmeticEffectClass,
  getCosmeticFrameClass,
  getCosmeticImage,
} from "../constants/cosmetic-assets";
import type {
  AvatarPresentation,
  CharacterCosmeticsCatalogResponse,
  CosmeticCollection,
  CosmeticItem,
  CosmeticType,
  ResolvedCharacterAppearance,
  UpdateCharacterAppearancePayload,
} from "../types/cosmetics.types";
import "../styles/appearance.css";

type Selection = Record<CosmeticType, string | null>;
type AvatarPresentationFilter = AvatarPresentation;

interface AppearanceTab {
  key: string;
  label: string;
  icon: LucideIcon;
  types: CosmeticType[];
}

const APPEARANCE_TABS: AppearanceTab[] = [
  { key: "avatar", label: "Avatar", icon: UserRound, types: ["AVATAR"] },
  {
    key: "frame",
    label: "Moldura",
    icon: Frame,
    types: ["AVATAR_FRAME"],
  },
  {
    key: "card",
    label: "Cartão",
    icon: Image,
    types: ["PROFILE_BANNER"],
  },
  {
    key: "background",
    label: "Visão geral",
    icon: Layers3,
    types: ["OVERVIEW_BACKGROUND"],
  },
  {
    key: "effect",
    label: "Efeito",
    icon: Sparkles,
    types: ["PROFILE_EFFECT"],
  },
  {
    key: "identity",
    label: "Identidade",
    icon: BadgeCheck,
    types: ["TITLE", "BADGE"],
  },
];

const EMPTY_SELECTION: Selection = {
  AVATAR: null,
  AVATAR_FRAME: null,
  PROFILE_BANNER: null,
  OVERVIEW_BACKGROUND: null,
  PROFILE_EFFECT: null,
  TITLE: null,
  BADGE: null,
};

const AVATAR_PRESENTATION_FILTERS: ReadonlyArray<{
  key: AvatarPresentationFilter;
  label: string;
}> = [
  { key: "MASCULINE", label: "Masculinos" },
  { key: "FEMININE", label: "Femininos" },
];

const COLLECTION_STYLE_TYPES: CosmeticType[] = [
  "AVATAR_FRAME",
  "PROFILE_BANNER",
  "OVERVIEW_BACKGROUND",
  "PROFILE_EFFECT",
  "TITLE",
  "BADGE",
];

function selectionFromCatalog(
  catalog: CharacterCosmeticsCatalogResponse,
): Selection {
  const selection: Selection = {
    AVATAR: catalog.appearance.avatar?.key ?? null,
    AVATAR_FRAME: catalog.appearance.avatarFrame?.key ?? null,
    PROFILE_BANNER: catalog.appearance.profileBanner?.key ?? null,
    OVERVIEW_BACKGROUND: catalog.appearance.overviewBackground?.key ?? null,
    PROFILE_EFFECT: catalog.appearance.profileEffect?.key ?? null,
    TITLE: catalog.appearance.title?.key ?? null,
    BADGE: catalog.appearance.badge?.key ?? null,
  };

  for (const item of catalog.collections.flatMap(
    (collection) => collection.items,
  )) {
    if (item.isSelected) selection[item.type] = item.key;
  }

  return selection;
}

function payloadFromSelection(selection: Selection, saved: Selection) {
  const payload: UpdateCharacterAppearancePayload = {};
  if (selection.AVATAR !== saved.AVATAR) {
    payload.avatarCosmeticKey = selection.AVATAR;
  }
  if (selection.AVATAR_FRAME !== saved.AVATAR_FRAME) {
    payload.avatarFrameCosmeticKey = selection.AVATAR_FRAME;
  }
  if (selection.PROFILE_BANNER !== saved.PROFILE_BANNER) {
    payload.profileBannerCosmeticKey = selection.PROFILE_BANNER;
  }
  if (selection.OVERVIEW_BACKGROUND !== saved.OVERVIEW_BACKGROUND) {
    payload.overviewBackgroundCosmeticKey = selection.OVERVIEW_BACKGROUND;
  }
  if (selection.PROFILE_EFFECT !== saved.PROFILE_EFFECT) {
    payload.profileEffectCosmeticKey = selection.PROFILE_EFFECT;
  }
  if (selection.TITLE !== saved.TITLE) {
    payload.titleCosmeticKey = selection.TITLE;
  }
  if (selection.BADGE !== saved.BADGE) {
    payload.badgeCosmeticKey = selection.BADGE;
  }
  return payload;
}

function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] })
      ?.message;
    if (Array.isArray(message)) return message.join(" ");
    if (message) return message;
  }
  return "Não foi possível atualizar a aparência.";
}

function buildPreviewAppearance(
  catalog: CharacterCosmeticsCatalogResponse,
  selection: Selection,
) {
  const items = catalog.collections.flatMap((collection) => collection.items);
  const byKey = new Map(items.map((item) => [item.key, item]));
  const get = (type: CosmeticType) =>
    selection[type] ? (byKey.get(selection[type] ?? "") ?? null) : null;
  const avatar = get("AVATAR");
  const avatarFrame = get("AVATAR_FRAME");
  const profileBanner = get("PROFILE_BANNER");

  return {
    baseAvatarKey: catalog.appearance.baseAvatarKey,
    avatarKey: avatar?.assetKey ?? catalog.appearance.baseAvatarKey,
    avatar,
    avatarFrame,
    profileBanner,
    overviewBackground: get("OVERVIEW_BACKGROUND"),
    profileEffect: get("PROFILE_EFFECT"),
    title: get("TITLE"),
    badge: get("BADGE"),
    accentColor:
      profileBanner?.accentColor ??
      avatarFrame?.accentColor ??
      avatar?.accentColor ??
      null,
  } satisfies ResolvedCharacterAppearance;
}

function CosmeticThumbnail({ item }: { item: CosmeticItem }) {
  const image = getCosmeticImage(item.assetKey);
  const frameClass = getCosmeticFrameClass(item.assetKey);
  const effectClass = getCosmeticEffectClass(item.effectPreset);

  if (image) {
    return (
      <span
        className={`appearance-item__image appearance-item__image--${item.type.toLowerCase()}`}
        style={{ backgroundImage: `url("${image}")` }}
        aria-hidden="true"
      />
    );
  }

  if (item.type === "AVATAR_FRAME") {
    return (
      <span
        className={`appearance-item__frame-preview character-portrait ${frameClass}`}
        aria-hidden="true"
      >
        <span className="character-portrait__frame" />
      </span>
    );
  }

  if (item.type === "PROFILE_EFFECT") {
    return (
      <span
        className={`appearance-item__effect-preview cosmetic-surface ${effectClass}`}
        aria-hidden="true"
      >
        <span className="cosmetic-effect-layer" />
        <Sparkles size={24} />
      </span>
    );
  }

  if (item.displayText) {
    return (
      <span className="appearance-item__text-preview" aria-hidden="true">
        {item.displayText}
      </span>
    );
  }

  return (
    <span className="appearance-item__icon-preview" aria-hidden="true">
      <Sparkles size={24} />
    </span>
  );
}

function CosmeticChoice({
  item,
  isSelected,
  onSelect,
}: {
  item: CosmeticItem;
  isSelected: boolean;
  onSelect: (item: CosmeticItem) => void;
}) {
  return (
    <button
      type="button"
      className={[
        "appearance-item",
        isSelected ? "is-selected" : "",
        item.isOwned ? "" : "is-locked",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={isSelected}
      onClick={() => onSelect(item)}
    >
      <CosmeticThumbnail item={item} />
      <span className="appearance-item__body">
        <strong>{item.name}</strong>
        <em>
          {isSelected ? (
            <>
              <Check size={12} /> Em uso
            </>
          ) : item.isOwned ? (
            "Disponível"
          ) : (
            <>
              <Lock size={12} /> Bloqueado
            </>
          )}
        </em>
      </span>
    </button>
  );
}

function CosmeticChoiceGrid({
  items,
  selection,
  onSelect,
}: {
  items: CosmeticItem[];
  selection: Selection;
  onSelect: (item: CosmeticItem) => void;
}) {
  return (
    <div className="appearance-items">
      {items.map((item) => (
        <CosmeticChoice
          key={item.id}
          item={item}
          isSelected={selection[item.type] === item.key}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function CollectionSection({
  collection,
  items,
  focusedItem,
  selection,
  onSelect,
  onApplyCollection,
}: {
  collection: CosmeticCollection;
  items: CosmeticItem[];
  focusedItem: CosmeticItem | null;
  selection: Selection;
  onSelect: (item: CosmeticItem) => void;
  onApplyCollection: () => void;
}) {
  const ownedItems = items.filter((item) => item.isOwned);
  const lockedItems = items.filter((item) => !item.isOwned);
  const ownedStyleItems = collection.items.filter(
    (item) => item.isOwned && COLLECTION_STYLE_TYPES.includes(item.type),
  );
  const focusedItemIsSelected = focusedItem
    ? selection[focusedItem.type] === focusedItem.key
    : false;

  return (
    <section className="appearance-collection">
      <header>
        <div>
          <span>
            <Package size={14} aria-hidden="true" /> Coleção
          </span>
          <h2>{collection.name}</h2>
          <p>{collection.description}</p>
        </div>
        <button
          type="button"
          disabled={ownedStyleItems.length === 0}
          onClick={onApplyCollection}
          title="Aplicar os elementos visuais da coleção sem trocar o avatar"
        >
          <Check size={15} aria-hidden="true" /> Aplicar estilo
        </button>
      </header>

      {ownedItems.length ? (
        <div className="appearance-choice-group">
          <div className="appearance-choice-group__title">
            <span>Disponíveis</span>
            <small>{ownedItems.length}</small>
          </div>
          <CosmeticChoiceGrid
            items={ownedItems}
            selection={selection}
            onSelect={onSelect}
          />
        </div>
      ) : (
        <p className="appearance-empty">Nenhum item disponível nesta coleção.</p>
      )}

      {lockedItems.length ? (
        <details className="appearance-locked-options">
          <summary>
            <span>
              <Lock size={14} aria-hidden="true" /> Outras opções
            </span>
            <span>
              {lockedItems.length} bloqueadas
              <ChevronDown size={15} aria-hidden="true" />
            </span>
          </summary>
          <CosmeticChoiceGrid
            items={lockedItems}
            selection={selection}
            onSelect={onSelect}
          />
        </details>
      ) : null}

      {focusedItem ? (
        <div className="appearance-item-details" aria-live="polite">
          <div>
            <span>Item em foco</span>
            <strong>{focusedItem.name}</strong>
            <p>{focusedItem.description}</p>
          </div>
          <em
            className={focusedItem.isOwned ? "is-owned" : "is-locked"}
          >
            {focusedItemIsSelected ? (
              <>
                <Check size={13} aria-hidden="true" /> Selecionado
              </>
            ) : focusedItem.isOwned ? (
              "Disponível"
            ) : (
              <>
                <Lock size={13} aria-hidden="true" />
                {focusedItem.accessType === "PREMIUM"
                  ? "Premium"
                  : "Pacote exclusivo"}
              </>
            )}
          </em>
        </div>
      ) : null}
    </section>
  );
}

export function AppearancePage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [catalog, setCatalog] =
    useState<CharacterCosmeticsCatalogResponse | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [savedSelection, setSavedSelection] =
    useState<Selection>(EMPTY_SELECTION);
  const [activeTabKey, setActiveTabKey] = useState(APPEARANCE_TABS[0].key);
  const [avatarPresentationFilter, setAvatarPresentationFilter] =
    useState<AvatarPresentationFilter>("MASCULINE");
  const [activeCollectionKey, setActiveCollectionKey] = useState<string | null>(
    null,
  );
  const [focusedItemKey, setFocusedItemKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!characterId) return;
    const [nextOverview, nextCatalog] = await Promise.all([
      getCharacterOverview(characterId),
      getCharacterCosmetics(characterId),
    ]);
    const nextSelection = selectionFromCatalog(nextCatalog);
    setOverview(nextOverview);
    setCatalog(nextCatalog);
    setSelection(nextSelection);
    setSavedSelection(nextSelection);
    const selectedAvatar = nextCatalog.collections
      .flatMap((collection) => collection.items)
      .find((item) => item.key === nextSelection.AVATAR);
    if (selectedAvatar?.avatarPresentation) {
      setAvatarPresentationFilter(selectedAvatar.avatarPresentation);
    }
    setFocusedItemKey(selectedAvatar?.key ?? null);
    setActiveCollectionKey((current) => {
      if (
        current &&
        nextCatalog.collections.some((collection) => collection.key === current)
      ) {
        return current;
      }
      return (
        selectedAvatar?.collection?.key ??
        nextCatalog.collections.find((collection) =>
          collection.items.some((item) => item.isOwned),
        )?.key ??
        nextCatalog.collections[0]?.key ??
        null
      );
    });
  }, [characterId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void load()
        .catch((loadError) => setError(getErrorMessage(loadError)))
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const character = useMemo(
    () => (overview ? buildDashboardCharacter(overview) : null),
    [overview],
  );
  const activeTab =
    APPEARANCE_TABS.find((tab) => tab.key === activeTabKey) ??
    APPEARANCE_TABS[0];
  const availableCollections = useMemo(() => {
    if (!catalog) return [];
    return catalog.collections
      .map((collection) => ({
        collection,
        items: collection.items.filter((item) =>
          activeTab.types.includes(item.type),
        ),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [activeTab.types, catalog]);
  const activeCollectionEntry =
    availableCollections.find(
      (entry) => entry.collection.key === activeCollectionKey,
    ) ?? availableCollections[0];
  const activeCollectionItems = useMemo(() => {
    if (!activeCollectionEntry) return [];
    if (activeTab.key !== "avatar") return activeCollectionEntry.items;
    return activeCollectionEntry.items.filter(
      (item) => item.avatarPresentation === avatarPresentationFilter,
    );
  }, [activeCollectionEntry, activeTab.key, avatarPresentationFilter]);
  const allItems = useMemo(
    () => catalog?.collections.flatMap((collection) => collection.items) ?? [],
    [catalog],
  );
  const selectedItems = Object.values(selection)
    .filter((key): key is string => Boolean(key))
    .map((key) => allItems.find((item) => item.key === key))
    .filter((item): item is CosmeticItem => Boolean(item));
  const focusedItem =
    activeCollectionItems.find((item) => item.key === focusedItemKey) ??
    activeCollectionItems.find(
      (item) => selection[item.type] === item.key,
    ) ??
    activeCollectionItems.find((item) => item.isOwned) ??
    activeCollectionItems[0] ??
    null;
  const hasLockedSelection = selectedItems.some(
    (item) => !item.isOwned && savedSelection[item.type] !== item.key,
  );
  const isDirty = JSON.stringify(selection) !== JSON.stringify(savedSelection);
  const previewAppearance = catalog
    ? buildPreviewAppearance(catalog, selection)
    : null;

  if (!characterId) return <Navigate to="/characters" replace />;
  if (isLoading && (!character || !catalog)) {
    return <main className="dashboard-loading">Carregando aparência...</main>;
  }
  if (!character || !catalog) {
    return (
      <main className="dashboard-error">
        {error ?? "Catálogo indisponível."}
      </main>
    );
  }

  async function handleSave() {
    if (!characterId || hasLockedSelection || !isDirty) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await updateCharacterAppearance(
        characterId,
        payloadFromSelection(selection, savedSelection),
      );
      setMessage(response.message);
      await load();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function applyCollection(collection: CosmeticCollection) {
    setSelection((current) => {
      const next = { ...current };
      for (const item of collection.items) {
        if (item.isOwned && COLLECTION_STYLE_TYPES.includes(item.type)) {
          next[item.type] = item.key;
        }
      }
      return next;
    });
    setMessage(null);
    setError(null);
  }

  return (
    <DashboardLayout
      character={{ ...character, appearance: previewAppearance }}
      hideHero
    >
      <main className="appearance-page">
        <header className="appearance-header">
          <div>
            <span>Identidade do sobrevivente</span>
            <h1>Aparência</h1>
          </div>
          <div className="appearance-header__membership">
            <Crown size={17} aria-hidden="true" />
            <span>
              <strong>
                {catalog.membership.isPremiumActive
                  ? "Premium ativo"
                  : "Conta padrão"}
              </strong>
              <small>
                {selectedItems.filter((item) => item.isOwned).length} itens no
                conjunto
              </small>
            </span>
          </div>
        </header>

        <div className="appearance-workspace">
          <section
            className="appearance-catalog"
            aria-label="Catálogo cosmético"
          >
            <div
              className="appearance-tabs"
              role="tablist"
              aria-label="Tipo cosmético"
            >
              {APPEARANCE_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab.key === tab.key}
                    className={activeTab.key === tab.key ? "is-active" : ""}
                    onClick={() => {
                      setActiveTabKey(tab.key);
                      setFocusedItemKey(null);
                    }}
                  >
                    <Icon size={16} aria-hidden="true" /> {tab.label}
                  </button>
                );
              })}
            </div>

            {availableCollections.length ? (
              <div
                className="appearance-collection-switcher"
                role="tablist"
                aria-label="Coleção cosmética"
              >
                {availableCollections.map(({ collection, items }) => {
                  const coverImage = getCosmeticImage(collection.coverAssetKey);
                  const isActive =
                    activeCollectionEntry?.collection.key === collection.key;
                  const selectedCount = items.filter(
                    (item) => selection[item.type] === item.key,
                  ).length;
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={isActive ? "is-active" : ""}
                      onClick={() => {
                        setActiveCollectionKey(collection.key);
                        setFocusedItemKey(null);
                      }}
                    >
                      <span
                        className="appearance-collection-switcher__cover"
                        style={
                          coverImage
                            ? { backgroundImage: `url("${coverImage}")` }
                            : undefined
                        }
                        aria-hidden="true"
                      >
                        {!coverImage ? <Package size={18} /> : null}
                      </span>
                      <span>
                        <strong>{collection.name}</strong>
                        <small>
                          {items.filter((item) => item.isOwned).length} de{" "}
                          {items.length} disponíveis
                        </small>
                      </span>
                      {selectedCount > 0 ? (
                        <Check size={15} aria-label="Coleção em uso" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {activeTab.key === "avatar" ? (
              <div
                className="appearance-avatar-filter"
                role="group"
                aria-label="Apresentação do avatar"
              >
                {AVATAR_PRESENTATION_FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    className={
                      avatarPresentationFilter === filter.key ? "is-active" : ""
                    }
                    aria-pressed={avatarPresentationFilter === filter.key}
                    onClick={() => {
                      setAvatarPresentationFilter(filter.key);
                      setFocusedItemKey(null);
                    }}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="appearance-slot-actions">
              <strong>{activeTab.label}</strong>
              <button
                type="button"
                onClick={() => {
                  setSelection((current) => {
                    const next = { ...current };
                    for (const type of activeTab.types) next[type] = null;
                    return next;
                  });
                  setFocusedItemKey(null);
                  setMessage(null);
                  setError(null);
                }}
              >
                <RotateCcw size={14} aria-hidden="true" /> Usar padrão
              </button>
            </div>

            {activeCollectionEntry && activeCollectionItems.length ? (
              <CollectionSection
                key={activeCollectionEntry.collection.id}
                collection={activeCollectionEntry.collection}
                items={activeCollectionItems}
                focusedItem={focusedItem}
                selection={selection}
                onSelect={(item) => {
                  setFocusedItemKey(item.key);
                  setSelection((current) => ({
                    ...current,
                    [item.type]: item.key,
                  }));
                  setMessage(null);
                  setError(null);
                }}
                onApplyCollection={() =>
                  applyCollection(activeCollectionEntry.collection)
                }
              />
            ) : (
              <p className="appearance-empty">
                Nenhum item disponível neste slot.
              </p>
            )}
          </section>

          <aside
            className="appearance-preview"
            aria-label="Prévia da aparência"
          >
            <span>Prévia pública</span>
            <CharacterProfileCard
              name={character.name}
              className={character.className ?? catalog.character.class.name}
              level={character.level}
              mapName={character.currentMapName}
              avatarKey={character.avatarKey}
              appearance={previewAppearance}
            />

            {hasLockedSelection ? (
              <p className="appearance-preview__locked">
                <Lock size={15} aria-hidden="true" /> O conjunto contém item
                bloqueado.
              </p>
            ) : null}
            {message ? (
              <p className="appearance-notice is-success">{message}</p>
            ) : null}
            {error ? (
              <p className="appearance-notice is-error">{error}</p>
            ) : null}

            <div className="appearance-preview__actions">
              <button
                type="button"
                onClick={() => setSelection(savedSelection)}
                disabled={!isDirty || isSaving}
                title="Descartar alterações"
              >
                <RotateCcw size={16} aria-hidden="true" /> Descartar
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => void handleSave()}
                disabled={!isDirty || hasLockedSelection || isSaving}
              >
                <Save size={16} aria-hidden="true" />
                {isSaving ? "Salvando" : "Salvar"}
              </button>
            </div>
          </aside>
        </div>
      </main>
    </DashboardLayout>
  );
}
