import type { ComponentType, CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  Check,
  Coins,
  Footprints,
  HardHat,
  Hammer,
  PackageOpen,
  RefreshCw,
  Rows3,
  Shield,
  Shirt,
  Sword,
  Unlink,
} from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import { getEquipmentRarityFromItem } from "../../dashboard/constants/equipment-rarity";
import "../../dashboard/dashboard.css";
import type {
  DashboardEquipmentItem,
  DashboardEquipmentViewModel,
  DashboardStats,
} from "../../dashboard/types/dashboard.types";
import {
  equipInventoryItem,
  extractInventoryActionApiError,
  getCharacterEquipment,
  getCharacterInventory,
  reinforceEquippedItem,
  unequipInventoryItem,
  type CharacterEquipmentResponse,
} from "../../inventory/api/inventory.api";
import type {
  InventoryEntry,
  InventoryItemDetails,
} from "../../inventory/types/inventory.types";
import { formatInventoryRarity } from "../../inventory/utils/inventory.utils";
import "../styles/equipment.css";
import { getEquipmentItemImageUrl } from "../utils/equipmentItemAssets";

type EquipmentSlot =
  "MAIN_HAND" | "OFF_HAND" | "HEAD" | "ARMOR" | "PANTS" | "BOOTS";

type EquipmentViewKey = keyof DashboardEquipmentViewModel;

interface SlotConfig {
  slot: EquipmentSlot;
  viewKey: EquipmentViewKey;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

type StatKey = keyof DashboardStats;

const SLOT_CONFIGS: SlotConfig[] = [
  { slot: "HEAD", viewKey: "head", label: "Cabeça", Icon: HardHat },
  { slot: "ARMOR", viewKey: "armor", label: "Armadura", Icon: Shirt },
  { slot: "PANTS", viewKey: "pants", label: "Calças", Icon: Rows3 },
  { slot: "BOOTS", viewKey: "boots", label: "Botas", Icon: Footprints },
  {
    slot: "MAIN_HAND",
    viewKey: "mainHand",
    label: "Mão principal",
    Icon: Sword,
  },
  {
    slot: "OFF_HAND",
    viewKey: "offHand",
    label: "Mão secundária",
    Icon: Shield,
  },
];

const STAT_CONFIGS: Array<{ key: StatKey; label: string; short: string }> = [
  { key: "strength", label: "Força", short: "FOR" },
  { key: "vitality", label: "Vitalidade", short: "VIT" },
  { key: "agility", label: "Agilidade", short: "AGI" },
  { key: "precision", label: "Precisão", short: "PRE" },
  { key: "technique", label: "Técnica", short: "TEC" },
  { key: "willpower", label: "Vontade", short: "VON" },
];

const ITEM_STAT_KEYS: Record<StatKey, keyof InventoryItemDetails> = {
  strength: "strengthBonus",
  vitality: "vitalityBonus",
  agility: "agilityBonus",
  precision: "precisionBonus",
  technique: "techniqueBonus",
  willpower: "willpowerBonus",
};

function normalizeName(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getRequiredLevel(item: InventoryItemDetails) {
  const mapLevel = Number(item.map?.minLevel);

  if (Number.isFinite(mapLevel) && mapLevel > 0) return mapLevel;

  const tier = Math.max(1, Math.floor(Number(item.tier) || 1));
  return (tier - 1) * 10 + 1;
}

function getItemStat(
  item: InventoryItemDetails | DashboardEquipmentItem | null | undefined,
  stat: StatKey,
) {
  if (!item) return 0;
  return Number(item[ITEM_STAT_KEYS[stat] as keyof typeof item]) || 0;
}

function isEquipmentEntry(entry: InventoryEntry) {
  return String(entry.type).toUpperCase() === "EQUIPMENT";
}

export function EquipmentPage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof getCharacterOverview>
  > | null>(null);
  const [equipmentResponse, setEquipmentResponse] =
    useState<CharacterEquipmentResponse | null>(null);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot>("MAIN_HAND");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const reinforcementRequestIds = useRef<Record<string, string>>({});

  const loadPageData = useCallback(
    async (initialLoad = false) => {
      if (!characterId) return;

      if (initialLoad) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const [overviewData, equipmentData, inventoryData] = await Promise.all([
          getCharacterOverview(characterId),
          getCharacterEquipment(characterId),
          getCharacterInventory(characterId),
        ]);

        setOverview(overviewData);
        setEquipmentResponse(equipmentData);
        setInventory(inventoryData.items ?? []);
        setError("");
      } catch (loadError) {
        setError(
          extractInventoryActionApiError(
            loadError,
            "Não foi possível carregar os equipamentos.",
          ),
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [characterId],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPageData(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPageData]);

  const equipment = useMemo<DashboardEquipmentViewModel>(
    () => equipmentResponse?.equipment ?? overview?.equipment ?? {},
    [equipmentResponse?.equipment, overview?.equipment],
  );
  const character = useMemo(() => {
    if (!overview) return null;

    return {
      ...overview.character,
      equipment,
    };
  }, [equipment, overview]);
  const selectedSlotConfig =
    SLOT_CONFIGS.find((config) => config.slot === selectedSlot) ??
    SLOT_CONFIGS[0];
  const equippedItem = equipment[selectedSlotConfig.viewKey] ?? null;
  const candidates = useMemo(
    () =>
      inventory
        .filter(
          (entry) =>
            isEquipmentEntry(entry) && entry.item.slot === selectedSlot,
        )
        .sort(
          (left, right) =>
            Number(right.item.tier ?? 0) - Number(left.item.tier ?? 0) ||
            left.item.name.localeCompare(right.item.name, "pt-BR"),
        ),
    [inventory, selectedSlot],
  );
  const selectedCandidate =
    candidates.find((entry) => entry.item.id === selectedCandidateId) ??
    candidates[0] ??
    null;
  const selectedCandidateClass = selectedCandidate?.item.class?.name;
  const currentClassName =
    character?.class?.name ??
    character?.gameClass?.name ??
    character?.className;
  const classCompatible =
    !selectedCandidateClass ||
    normalizeName(selectedCandidateClass) === normalizeName(currentClassName);
  const requiredLevel = selectedCandidate
    ? getRequiredLevel(selectedCandidate.item)
    : 1;
  const levelCompatible = Number(character?.level ?? 0) >= requiredLevel;
  const canEquip = Boolean(
    selectedCandidate && classCompatible && levelCompatible && !actionItemId,
  );
  const equippedCount = SLOT_CONFIGS.filter(
    (slot) => equipment[slot.viewKey],
  ).length;
  const reinforcementSlot = equipmentResponse?.reinforcement?.slots.find(
    (entry) => entry.slot === selectedSlot,
  );
  const reinforcementLevel = Math.max(
    0,
    Number(reinforcementSlot?.item?.enhancementLevel ?? 0),
  );
  const reinforcementActionId = `reinforce:${selectedSlot}`;

  async function reinforceSelectedEquipment() {
    if (!characterId || !reinforcementSlot?.canReinforce) return;

    const requestId =
      reinforcementRequestIds.current[selectedSlot] ?? crypto.randomUUID();
    reinforcementRequestIds.current[selectedSlot] = requestId;

    await runEquipmentAction(reinforcementActionId, async () => {
      const response = await reinforceEquippedItem({
        characterId,
        slot: selectedSlot,
        requestId,
      });
      delete reinforcementRequestIds.current[selectedSlot];
      return response;
    });
  }

  async function runEquipmentAction(
    itemId: string,
    action: () => Promise<{ message?: string }>,
  ) {
    setActionItemId(itemId);
    setFeedback(null);

    try {
      const result = await action();
      setFeedback({
        tone: "success",
        message: result.message ?? "Equipamentos atualizados.",
      });
      setSelectedCandidateId(null);
      await loadPageData(false);
    } catch (actionError) {
      setFeedback({
        tone: "error",
        message: extractInventoryActionApiError(
          actionError,
          "Não foi possível atualizar o equipamento.",
        ),
      });
    } finally {
      setActionItemId(null);
    }
  }

  if (!characterId) return <Navigate to="/characters" replace />;

  if (isLoading) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando equipamentos...</span>
      </main>
    );
  }

  if (!character || error) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar equipamentos</h1>
        <p>{error || "Personagem não encontrado."}</p>
        <button type="button" onClick={() => void loadPageData(true)}>
          Tentar novamente
        </button>
      </main>
    );
  }

  const totalStats = equipmentResponse?.stats?.totalPrimaryStats;
  const equipmentStats = equipmentResponse?.stats?.equipmentBonusStats;
  const derivedStats = equipmentResponse?.stats?.derivedCombatStats;
  const equipmentProgression = equipmentResponse?.stats?.equipmentProgression;

  return (
    <DashboardLayout character={character} hideHero>
      <main className="equipment-page" aria-label="Equipamentos do personagem">
        <header className="equipment-page__header">
          <div>
            <span>ARSENAL PESSOAL</span>
            <h1>Equipamentos</h1>
          </div>

          <div className="equipment-page__header-actions">
            <strong>{equippedCount}/6 equipados</strong>
            <button
              type="button"
              className="equipment-icon-button"
              onClick={() => void loadPageData(false)}
              disabled={isRefreshing}
              aria-label="Atualizar equipamentos"
              title="Atualizar equipamentos"
            >
              <RefreshCw
                size={18}
                className={isRefreshing ? "is-spinning" : ""}
              />
            </button>
          </div>
        </header>

        {feedback ? (
          <div
            className={`equipment-feedback equipment-feedback--${feedback.tone}`}
            role="status"
          >
            {feedback.tone === "success" ? (
              <Check size={17} />
            ) : (
              <AlertCircle size={17} />
            )}
            <span>{feedback.message}</span>
          </div>
        ) : null}

        <div className="equipment-overview-grid">
          <section
            className="equipment-loadout"
            aria-labelledby="loadout-title"
          >
            <div className="equipment-section-heading">
              <div>
                <span>CONJUNTO ATUAL</span>
                <h2 id="loadout-title">Loadout</h2>
              </div>
              <small>Nível {character.level}</small>
            </div>

            <div className="equipment-loadout__grid">
              {SLOT_CONFIGS.map((slotConfig) => {
                const item = equipment[slotConfig.viewKey] ?? null;
                const rarity = getEquipmentRarityFromItem(item);
                const imageUrl = getEquipmentItemImageUrl(item);
                const isActive = selectedSlot === slotConfig.slot;

                return (
                  <button
                    key={slotConfig.slot}
                    type="button"
                    className={`equipment-slot${isActive ? " is-active" : ""}${item ? " has-item" : " is-empty"}`}
                    style={{ "--equipment-rgb": rarity.rgb } as CSSProperties}
                    onClick={() => {
                      setSelectedSlot(slotConfig.slot);
                      setSelectedCandidateId(null);
                      setFeedback(null);
                    }}
                    aria-pressed={isActive}
                  >
                    <span className="equipment-slot__visual">
                      {imageUrl ? (
                        <img src={imageUrl} alt="" loading="lazy" />
                      ) : (
                        <slotConfig.Icon size={27} strokeWidth={1.7} />
                      )}
                    </span>
                    <span className="equipment-slot__copy">
                      <small>{slotConfig.label}</small>
                      <strong>{item?.name ?? "Slot vazio"}</strong>
                      <em>
                        {item
                          ? `T${item.tier} · ${rarity.label}`
                          : "Sem equipamento"}
                      </em>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside
            className="equipment-stats"
            aria-labelledby="equipment-stats-title"
          >
            <div className="equipment-section-heading">
              <div>
                <span>ATRIBUTOS</span>
                <h2 id="equipment-stats-title">Totais ativos</h2>
              </div>
            </div>

            <dl className="equipment-stats__primary">
              {STAT_CONFIGS.map((stat) => (
                <div key={stat.key}>
                  <dt>{stat.label}</dt>
                  <dd>
                    <strong>{totalStats?.[stat.key] ?? 0}</strong>
                    <span>+{equipmentStats?.[stat.key] ?? 0}</span>
                  </dd>
                </div>
              ))}
            </dl>

            <dl className="equipment-stats__combat">
              <div>
                <dt>Ataque</dt>
                <dd>{derivedStats?.attack ?? 0}</dd>
              </div>
              <div>
                <dt>Defesa</dt>
                <dd>{derivedStats?.defense ?? 0}</dd>
              </div>
              <div>
                <dt>Velocidade</dt>
                <dd>{derivedStats?.speed ?? 0}</dd>
              </div>
              <div>
                <dt>Vida máxima</dt>
                <dd>{derivedStats?.maxHp ?? character.maxHp}</dd>
              </div>
            </dl>

            {equipmentProgression ? (
              <div className="equipment-progression">
                <div>
                  <span>SINERGIA DE EQUIPAMENTO</span>
                  <strong>{equipmentProgression.craftedPieces}/6 peças</strong>
                </div>
                <div
                  className="equipment-progression__track"
                  aria-hidden="true"
                >
                  {Array.from({ length: 6 }, (_, index) => (
                    <i
                      key={index}
                      className={
                        index < equipmentProgression.craftedPieces
                          ? "is-active"
                          : ""
                      }
                    />
                  ))}
                </div>
                <small>
                  +{equipmentProgression.bonusPercent}% em ataque, defesa e vida
                  {equipmentProgression.nextMilestone
                    ? ` · próximo bônus com ${equipmentProgression.nextMilestone} peças`
                    : " · bônus máximo ativo"}
                </small>
              </div>
            ) : null}
          </aside>
        </div>

        <section
          className="equipment-reinforcement"
          aria-labelledby="equipment-reinforcement-title"
        >
          <div className="equipment-section-heading">
            <div>
              <span>OFICINA DE INCURSÃO</span>
              <h2 id="equipment-reinforcement-title">Reforço garantido</h2>
            </div>
            <small>
              Máximo +{equipmentResponse?.reinforcement?.maxLevel ?? 3}
            </small>
          </div>

          {reinforcementSlot?.item ? (
            <div className="equipment-reinforcement__body">
              <div className="equipment-reinforcement__item">
                <span className="equipment-reinforcement__visual">
                  {getEquipmentItemImageUrl(reinforcementSlot.item) ? (
                    <img
                      src={
                        getEquipmentItemImageUrl(reinforcementSlot.item) ?? ""
                      }
                      alt=""
                    />
                  ) : (
                    <selectedSlotConfig.Icon size={30} strokeWidth={1.6} />
                  )}
                </span>
                <span>
                  <small>{selectedSlotConfig.label}</small>
                  <strong>{reinforcementSlot.item.name}</strong>
                  <em>
                    T{reinforcementSlot.item.tier} · +{reinforcementLevel}
                  </em>
                </span>
              </div>

              <div className="equipment-reinforcement__progress">
                <span>Nível de reforço</span>
                <div aria-label={`Reforço atual +${reinforcementLevel}`}>
                  {[1, 2, 3].map((level) => (
                    <i
                      key={level}
                      className={level <= reinforcementLevel ? "is-active" : ""}
                    >
                      +{level}
                    </i>
                  ))}
                </div>
                <small>
                  +3 supera levemente o próximo tier base; o próximo tier +1
                  volta a ser superior.
                </small>
              </div>

              {reinforcementSlot.nextItem && reinforcementSlot.cost ? (
                <div className="equipment-reinforcement__upgrade">
                  <span className="equipment-reinforcement__target">
                    <small>Próximo resultado</small>
                    <strong>{reinforcementSlot.nextItem.name}</strong>
                  </span>
                  <span className="equipment-reinforcement__costs">
                    <em>
                      <Hammer size={14} />
                      {reinforcementSlot.cost.fragmentCost} fragmentos
                      <small>
                        ({reinforcementSlot.cost.materialBalance} disponíveis)
                      </small>
                    </em>
                    <em>
                      <Coins size={14} />
                      {reinforcementSlot.cost.goldCost.toLocaleString(
                        "pt-BR",
                      )}{" "}
                      Gold
                      <small>
                        (
                        {reinforcementSlot.cost.goldBalance.toLocaleString(
                          "pt-BR",
                        )}{" "}
                        disponíveis)
                      </small>
                    </em>
                  </span>
                  <button
                    type="button"
                    className="equipment-reinforcement__button"
                    disabled={
                      !reinforcementSlot.canReinforce || Boolean(actionItemId)
                    }
                    onClick={() => void reinforceSelectedEquipment()}
                    title={reinforcementSlot.reason ?? "Aplicar reforço"}
                  >
                    <ArrowUp size={17} />
                    {actionItemId === reinforcementActionId
                      ? "Reforçando..."
                      : `Reforçar para +${reinforcementSlot.cost.level}`}
                  </button>
                  {!reinforcementSlot.canReinforce &&
                  reinforcementSlot.reason ? (
                    <small className="equipment-reinforcement__reason">
                      {reinforcementSlot.reason}
                    </small>
                  ) : null}
                </div>
              ) : (
                <div className="equipment-reinforcement__maximum">
                  <Check size={18} />
                  <span>
                    <strong>Reforço máximo alcançado</strong>
                    <small>Esta peça já está no +3.</small>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="equipment-reinforcement__empty">
              <Hammer size={23} />
              <span>Equipe uma peça T1 a T5 neste slot para reforçá-la.</span>
            </div>
          )}
        </section>

        <div className="equipment-management-grid">
          <section
            className="equipment-candidates"
            aria-labelledby="equipment-candidates-title"
          >
            <div className="equipment-section-heading">
              <div>
                <span>{selectedSlotConfig.label.toUpperCase()}</span>
                <h2 id="equipment-candidates-title">Itens disponíveis</h2>
              </div>
              <small>{candidates.length} na mochila</small>
            </div>

            {candidates.length ? (
              <div className="equipment-candidates__list">
                {candidates.map((entry) => {
                  const item = entry.item;
                  const rarity = getEquipmentRarityFromItem(item);
                  const imageUrl = getEquipmentItemImageUrl(item);
                  const isSelected = selectedCandidate?.item.id === item.id;

                  return (
                    <button
                      key={entry.inventoryItemId}
                      type="button"
                      className={`equipment-candidate${isSelected ? " is-selected" : ""}`}
                      style={{ "--equipment-rgb": rarity.rgb } as CSSProperties}
                      onClick={() => {
                        setSelectedCandidateId(item.id);
                        setFeedback(null);
                      }}
                      aria-pressed={isSelected}
                    >
                      <span className="equipment-candidate__visual">
                        {imageUrl ? (
                          <img src={imageUrl} alt="" loading="lazy" />
                        ) : (
                          <selectedSlotConfig.Icon
                            size={23}
                            strokeWidth={1.7}
                          />
                        )}
                      </span>
                      <span className="equipment-candidate__copy">
                        <strong>{item.name}</strong>
                        <small>
                          T{item.tier ?? "?"} ·{" "}
                          {formatInventoryRarity(item.rarity)}
                        </small>
                      </span>
                      <span className="equipment-candidate__quantity">
                        {entry.quantity}x
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="equipment-empty-state">
                <PackageOpen size={28} />
                <strong>Nenhum item compatível na mochila</strong>
              </div>
            )}
          </section>

          <section
            className="equipment-comparison"
            aria-labelledby="comparison-title"
          >
            <div className="equipment-section-heading">
              <div>
                <span>COMPARAÇÃO</span>
                <h2 id="comparison-title">
                  {selectedCandidate?.item.name ?? "Nenhum item selecionado"}
                </h2>
              </div>
            </div>

            {selectedCandidate ? (
              <>
                <div className="equipment-comparison__items">
                  <div>
                    <small>Equipado</small>
                    <strong>{equippedItem?.name ?? "Slot vazio"}</strong>
                  </div>
                  <div>
                    <small>Novo item</small>
                    <strong>{selectedCandidate.item.name}</strong>
                  </div>
                </div>

                <dl className="equipment-comparison__stats">
                  {STAT_CONFIGS.map((stat) => {
                    const currentValue = getItemStat(equippedItem, stat.key);
                    const candidateValue = getItemStat(
                      selectedCandidate.item,
                      stat.key,
                    );
                    const difference = candidateValue - currentValue;

                    return (
                      <div key={stat.key}>
                        <dt>{stat.short}</dt>
                        <dd>{candidateValue}</dd>
                        <span
                          className={
                            difference > 0
                              ? "is-positive"
                              : difference < 0
                                ? "is-negative"
                                : ""
                          }
                        >
                          {difference > 0 ? "+" : ""}
                          {difference}
                        </span>
                      </div>
                    );
                  })}
                </dl>

                <div className="equipment-requirements">
                  <span className={levelCompatible ? "is-valid" : "is-invalid"}>
                    Nível {requiredLevel}
                  </span>
                  <span className={classCompatible ? "is-valid" : "is-invalid"}>
                    {selectedCandidateClass ?? "Todas as classes"}
                  </span>
                </div>

                <button
                  type="button"
                  className="equipment-primary-action"
                  disabled={!canEquip}
                  onClick={() =>
                    void runEquipmentAction(selectedCandidate.item.id, () =>
                      equipInventoryItem({
                        characterId,
                        itemId: selectedCandidate.item.id,
                      }),
                    )
                  }
                >
                  <Sword size={18} />
                  {actionItemId === selectedCandidate.item.id
                    ? "Equipando..."
                    : "Equipar item"}
                </button>
              </>
            ) : (
              <div className="equipment-empty-state equipment-empty-state--comparison">
                <PackageOpen size={28} />
                <strong>Sem item para comparar</strong>
              </div>
            )}

            {equippedItem ? (
              <button
                type="button"
                className="equipment-secondary-action"
                disabled={Boolean(actionItemId)}
                onClick={() =>
                  void runEquipmentAction(equippedItem.id, () =>
                    unequipInventoryItem({ characterId, slot: selectedSlot }),
                  )
                }
              >
                <Unlink size={17} />
                {actionItemId === equippedItem.id
                  ? "Removendo..."
                  : "Desequipar"}
              </button>
            ) : null}
          </section>
        </div>
      </main>
    </DashboardLayout>
  );
}

export default EquipmentPage;
