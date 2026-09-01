import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Anvil,
  ArrowRight,
  Check,
  Hammer,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import goldIcon from "../../../assets/images/coins/gold.webp";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import { getEquipmentRarityFromItem } from "../../dashboard/constants/equipment-rarity";
import "../../dashboard/dashboard.css";
import { getGatheringMaterialImageUrl } from "../../gathering/utils/gatheringMaterialAssets";
import {
  extractInventoryActionApiError,
  getCharacterEquipment,
  reinforceEquippedItem,
  type CharacterEquipmentResponse,
  type EquipmentReinforcementCandidate,
  type EquipmentReinforcementState,
} from "../../inventory/api/inventory.api";
import { EquipmentItemArtwork } from "../components/EquipmentItemArtwork";
import "../styles/blacksmith.css";
import { getEquipmentItemImageUrl } from "../utils/equipmentItemAssets";
import {
  getReinforcementStatChanges,
  type ReinforcementStatChange,
} from "../utils/reinforcementPresentation";

interface ReinforcementConfirmation {
  itemName: string;
  level: number;
  statChanges: ReinforcementStatChange[];
  materialRemaining: number;
  goldRemaining: number;
}

const SLOT_LABELS: Record<string, string> = {
  MAIN_HAND: "Mão principal",
  OFF_HAND: "Mão secundária",
  HEAD: "Cabeça",
  ARMOR: "Armadura",
  PANTS: "Calças",
  BOOTS: "Botas",
};

const EQUIPPED_SLOT_ORDER: Record<string, number> = {
  HEAD: 0,
  MAIN_HAND: 1,
  OFF_HAND: 2,
  ARMOR: 3,
  PANTS: 4,
  BOOTS: 5,
};

function getLegacyCandidates(
  reinforcement?: EquipmentReinforcementState,
): EquipmentReinforcementCandidate[] {
  if (!reinforcement) return [];

  return reinforcement.slots.flatMap((slot) => {
    if (!slot.item || !slot.nextItem || !slot.cost) return [];

    return [
      {
        key: `equipped:${slot.slot}`,
        location: "EQUIPPED" as const,
        quantity: 1,
        target: { type: "EQUIPPED" as const, slot: slot.slot },
        item: slot.item,
        nextItem: slot.nextItem,
        cost: slot.cost,
        canReinforce: slot.canReinforce,
        reason: slot.reason,
      },
    ];
  });
}

function getCandidateSlot(candidate: EquipmentReinforcementCandidate) {
  const slot =
    candidate.target.type === "EQUIPPED"
      ? candidate.target.slot
      : candidate.item.slot;

  return SLOT_LABELS[slot ?? ""] ?? "Equipamento";
}

function getCandidateDisplayName(candidate: EquipmentReinforcementCandidate) {
  return candidate.item.name.replace(/\s+\+[1-3]\s*$/i, "");
}

function sortEquippedCandidates(
  left: EquipmentReinforcementCandidate,
  right: EquipmentReinforcementCandidate,
) {
  const leftSlot =
    left.target.type === "EQUIPPED" ? left.target.slot : left.item.slot;
  const rightSlot =
    right.target.type === "EQUIPPED" ? right.target.slot : right.item.slot;

  return (
    (EQUIPPED_SLOT_ORDER[leftSlot ?? ""] ?? Number.MAX_SAFE_INTEGER) -
      (EQUIPPED_SLOT_ORDER[rightSlot ?? ""] ?? Number.MAX_SAFE_INTEGER) ||
    left.item.name.localeCompare(right.item.name, "pt-BR")
  );
}

interface BlacksmithItemGridProps {
  candidates: EquipmentReinforcementCandidate[];
  selectedKey: string | null;
  emptyTitle: string;
  emptyDescription: string;
  onSelect: (candidate: EquipmentReinforcementCandidate) => void;
}

function BlacksmithItemGrid({
  candidates,
  selectedKey,
  emptyTitle,
  emptyDescription,
  onSelect,
}: BlacksmithItemGridProps) {
  if (!candidates.length) {
    return (
      <div className="blacksmith-empty blacksmith-empty--group">
        <PackageOpen size={27} />
        <strong>{emptyTitle}</strong>
        <span>{emptyDescription}</span>
      </div>
    );
  }

  return (
    <div className="blacksmith-grid">
      {candidates.map((candidate) => {
        const rarity = getEquipmentRarityFromItem(candidate.item);
        const imageUrl = getEquipmentItemImageUrl(candidate.item);
        const level = Number(candidate.item.enhancementLevel) || 0;
        const displayName = getCandidateDisplayName(candidate);
        const isSelected = selectedKey === candidate.key;
        const locationLabel =
          candidate.location === "EQUIPPED" ? "Equipado" : "Mochila";
        const readinessLabel = candidate.canReinforce
          ? `Pronto para +${candidate.cost.level}`
          : candidate.reason;
        const accessibleLabel = [
          displayName,
          locationLabel,
          `Tier ${candidate.item.tier}`,
          getCandidateSlot(candidate),
          `reforço atual +${level}`,
          readinessLabel,
        ]
          .filter(Boolean)
          .join(". ");

        return (
          <button
            key={candidate.key}
            type="button"
            className={`blacksmith-item${isSelected ? " is-selected" : ""}${candidate.canReinforce ? " is-ready" : " is-missing-resources"}`}
            data-target-key={candidate.key}
            data-enhancement-level={level}
            style={
              { "--blacksmith-item-rgb": rarity.rgb } as CSSProperties
            }
            onClick={() => onSelect(candidate)}
            aria-label={accessibleLabel}
            aria-pressed={isSelected}
            title={readinessLabel ?? undefined}
          >
            <span className="blacksmith-item__visual">
              <EquipmentItemArtwork
                item={candidate.item}
                imageUrl={imageUrl}
                loading="lazy"
                fallback={<Anvil size={31} strokeWidth={1.6} />}
              />
              <span className="blacksmith-item__tier">
                T{candidate.item.tier}
              </span>
              {candidate.location === "INVENTORY" && candidate.quantity > 1 ? (
                <span className="blacksmith-item__quantity">
                  x{candidate.quantity.toLocaleString("pt-BR")}
                </span>
              ) : null}
              <span className="blacksmith-item__state" aria-hidden="true">
                {candidate.canReinforce ? (
                  <Check size={11} />
                ) : (
                  <AlertCircle size={11} />
                )}
              </span>
            </span>
            <span className="blacksmith-item__copy">
              <strong>{displayName}</strong>
              <small>{getCandidateSlot(candidate)}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function BlacksmithPage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof getCharacterOverview>
  > | null>(null);
  const [equipmentResponse, setEquipmentResponse] =
    useState<CharacterEquipmentResponse | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [confirmation, setConfirmation] =
    useState<ReinforcementConfirmation | null>(null);
  const [requestIds, setRequestIds] = useState<Record<string, string>>({});

  const loadPageData = useCallback(
    async (initialLoad = false) => {
      if (!characterId) return null;

      if (initialLoad) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const [overviewData, equipmentData] = await Promise.all([
          getCharacterOverview(characterId),
          getCharacterEquipment(characterId),
        ]);
        setOverview(overviewData);
        setEquipmentResponse(equipmentData);
        setError("");
        return equipmentData;
      } catch (loadError) {
        setError(
          extractInventoryActionApiError(
            loadError,
            "Não foi possível carregar o Ferreiro.",
          ),
        );
        return null;
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

  useEffect(() => {
    if (!isDetailOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDetailOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDetailOpen]);

  const reinforcement = equipmentResponse?.reinforcement;
  const candidates = useMemo(() => {
    const source = reinforcement?.items ?? getLegacyCandidates(reinforcement);
    return [...source].sort(
      (left, right) =>
        Number(right.canReinforce) - Number(left.canReinforce) ||
        Number(right.item.tier) - Number(left.item.tier) ||
        Number(right.item.enhancementLevel) -
          Number(left.item.enhancementLevel) ||
        left.item.name.localeCompare(right.item.name, "pt-BR"),
    );
  }, [reinforcement]);
  const equippedCandidates = useMemo(
    () =>
      candidates
        .filter((candidate) => candidate.location === "EQUIPPED")
        .sort(sortEquippedCandidates),
    [candidates],
  );
  const inventoryCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.location === "INVENTORY"),
    [candidates],
  );
  const selectedCandidate =
    candidates.find((candidate) => candidate.key === selectedKey) ??
    candidates[0] ??
    null;
  const statChanges = getReinforcementStatChanges(
    selectedCandidate?.item,
    selectedCandidate?.nextItem,
  );
  const selectedFragmentImageUrl = getGatheringMaterialImageUrl({
    name: selectedCandidate?.cost.materialName,
  });
  const readyCount = candidates.filter(
    (candidate) => candidate.canReinforce,
  ).length;
  const character = useMemo(() => {
    if (!overview) return null;
    return {
      ...overview.character,
      equipment: equipmentResponse?.equipment ?? overview.equipment ?? {},
    };
  }, [equipmentResponse?.equipment, overview]);

  function selectCandidate(candidate: EquipmentReinforcementCandidate) {
    setSelectedKey(candidate.key);
    setFeedback(null);
    if (window.matchMedia("(max-width: 820px)").matches) {
      setIsDetailOpen(true);
    }
  }

  async function reinforceSelected() {
    if (!characterId || !selectedCandidate || !selectedCandidate.canReinforce) {
      return;
    }

    const candidate = selectedCandidate;
    const requestId = requestIds[candidate.key] ?? crypto.randomUUID();
    setRequestIds((current) => ({ ...current, [candidate.key]: requestId }));
    setActionKey(candidate.key);
    setFeedback(null);

    try {
      const response = await reinforceEquippedItem({
        characterId,
        requestId,
        ...(candidate.target.type === "EQUIPPED"
          ? { slot: candidate.target.slot }
          : { inventoryItemId: candidate.target.inventoryItemId }),
      });
      setRequestIds((current) => {
        const next = { ...current };
        delete next[candidate.key];
        return next;
      });
      setConfirmation({
        itemName: response.reinforcedItem?.name ?? candidate.nextItem.name,
        level:
          response.reinforcedItem?.enhancementLevel ?? candidate.cost.level,
        statChanges,
        materialRemaining: Math.max(
          0,
          candidate.cost.materialBalance - candidate.cost.fragmentCost,
        ),
        goldRemaining: Math.max(
          0,
          candidate.cost.goldBalance - candidate.cost.goldCost,
        ),
      });
      setFeedback({
        tone: "success",
        message: response.message ?? "Equipamento reforçado com sucesso.",
      });

      const refreshed = await loadPageData(false);
      const refreshedCandidates =
        refreshed?.reinforcement?.items ??
        getLegacyCandidates(refreshed?.reinforcement);
      const reinforcedSelection = refreshedCandidates.find(
        (entry) => entry.item.id === response.reinforcedItem?.id,
      );
      setSelectedKey(reinforcedSelection?.key ?? null);
    } catch (actionError) {
      setFeedback({
        tone: "error",
        message: extractInventoryActionApiError(
          actionError,
          "Não foi possível reforçar o equipamento.",
        ),
      });
    } finally {
      setActionKey(null);
    }
  }

  if (!characterId) return <Navigate to="/characters" replace />;

  if (isLoading) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Preparando o Ferreiro...</span>
      </main>
    );
  }

  if (!character || error) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar o Ferreiro</h1>
        <p>{error || "Personagem não encontrado."}</p>
        <button type="button" onClick={() => void loadPageData(true)}>
          Tentar novamente
        </button>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <main className="blacksmith-page" aria-label="Ferreiro do Abrigo">
        <header className="blacksmith-page__header">
          <span className="blacksmith-page__emblem" aria-hidden="true">
            <Anvil size={24} strokeWidth={1.8} />
          </span>
          <div>
            <span>OFICINA DO ABRIGO</span>
            <h1>Ferreiro</h1>
            <p>Selecione uma peça para consultar e aplicar o próximo reforço.</p>
          </div>
          <div className="blacksmith-page__summary">
            <span>{candidates.length} elegíveis</span>
            <strong>{readyCount} prontas</strong>
            <button
              type="button"
              className="blacksmith-icon-button"
              onClick={() => void loadPageData(false)}
              disabled={isRefreshing}
              aria-label="Atualizar Ferreiro"
              title="Atualizar"
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
            className={`blacksmith-feedback blacksmith-feedback--${feedback.tone}`}
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

        {confirmation ? (
          <div
            className="blacksmith-confirmation"
            role="status"
            data-testid="reinforcement-confirmation"
          >
            <ShieldCheck size={19} />
            <span>
              <strong>
                {confirmation.itemName} agora está no +{confirmation.level}
              </strong>
              <small>
                {confirmation.statChanges
                  .map((stat) => `${stat.short} +${stat.delta}`)
                  .join(" · ") || "Atributos atualizados"}
                {" · "}
                Saldo: {confirmation.materialRemaining} frag. e{" "}
                {confirmation.goldRemaining.toLocaleString("pt-BR")} Gold
              </small>
            </span>
          </div>
        ) : null}

        <div className="blacksmith-workspace">
          <section
            className="blacksmith-catalog"
            aria-labelledby="blacksmith-catalog-title"
          >
            <div className="blacksmith-section-heading">
              <div>
                <span>PEÇAS DO PERSONAGEM</span>
                <h2 id="blacksmith-catalog-title">Itens reforçáveis</h2>
              </div>
              <small>{candidates.length} disponíveis</small>
            </div>

            <section
              className="blacksmith-item-group"
              aria-labelledby="blacksmith-equipped-title"
            >
              <div className="blacksmith-item-group__heading">
                <div>
                  <span>EM USO</span>
                  <h3 id="blacksmith-equipped-title">Equipados</h3>
                </div>
                <small>{equippedCandidates.length}</small>
              </div>
              <BlacksmithItemGrid
                candidates={equippedCandidates}
                selectedKey={selectedCandidate?.key ?? null}
                emptyTitle="Nenhum equipado disponível"
                emptyDescription="Equipe uma peça reforçável para vê-la aqui."
                onSelect={selectCandidate}
              />
            </section>

            <section
              className="blacksmith-item-group"
              aria-labelledby="blacksmith-inventory-title"
            >
              <div className="blacksmith-item-group__heading">
                <div>
                  <span>GUARDADOS</span>
                  <h3 id="blacksmith-inventory-title">Mochila</h3>
                </div>
                <small>{inventoryCandidates.length}</small>
              </div>
              <BlacksmithItemGrid
                candidates={inventoryCandidates}
                selectedKey={selectedCandidate?.key ?? null}
                emptyTitle="Nenhuma peça na mochila"
                emptyDescription="Peças reforçáveis guardadas aparecerão nesta grade."
                onSelect={selectCandidate}
              />
            </section>
          </section>

          <div
            className={`blacksmith-detail-shell${isDetailOpen ? " is-mobile-open" : ""}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsDetailOpen(false);
            }}
          >
            <aside
              className="blacksmith-detail"
              aria-labelledby="blacksmith-detail-title"
              role={isDetailOpen ? "dialog" : undefined}
              aria-modal={isDetailOpen ? true : undefined}
            >
              <button
                type="button"
                className="blacksmith-detail__close"
                onClick={() => setIsDetailOpen(false)}
                aria-label="Fechar detalhes do reforço"
                title="Fechar"
              >
                <X size={19} />
              </button>

              {selectedCandidate ? (
                <>
                  <div className="blacksmith-section-heading">
                    <div>
                      <span>PRÓXIMO REFORÇO</span>
                      <h2 id="blacksmith-detail-title">
                        +{selectedCandidate.cost.level}
                      </h2>
                    </div>
                    <small>Máximo +{reinforcement?.maxLevel ?? 3}</small>
                  </div>

                  <div className="blacksmith-detail__transition">
                    <span>
                      <small>Atual</small>
                      <strong>{selectedCandidate.item.name}</strong>
                    </span>
                    <ArrowRight size={20} aria-hidden="true" />
                    <span>
                      <small>Resultado</small>
                      <strong>{selectedCandidate.nextItem.name}</strong>
                    </span>
                  </div>

                  <div className="blacksmith-detail__stats">
                    {statChanges.map((stat) => (
                      <div key={stat.key}>
                        <span>{stat.label}</span>
                        <strong>
                          {stat.current} <ArrowRight size={12} /> {stat.next}
                        </strong>
                        <em>+{stat.delta}</em>
                      </div>
                    ))}
                  </div>

                  <div className="blacksmith-detail__costs">
                    <div
                      className={
                        selectedCandidate.cost.materialBalance >=
                        selectedCandidate.cost.fragmentCost
                          ? "is-sufficient"
                          : "is-insufficient"
                      }
                    >
                      <span className="blacksmith-detail__cost-icon">
                        {selectedFragmentImageUrl ? (
                          <img src={selectedFragmentImageUrl} alt="" />
                        ) : (
                          <Hammer size={19} />
                        )}
                      </span>
                      <span>
                        <small>{selectedCandidate.cost.materialName}</small>
                        <strong>
                          {selectedCandidate.cost.materialBalance} /{" "}
                          {selectedCandidate.cost.fragmentCost}
                        </strong>
                      </span>
                    </div>
                    <div
                      className={
                        selectedCandidate.cost.goldBalance >=
                        selectedCandidate.cost.goldCost
                          ? "is-sufficient"
                          : "is-insufficient"
                      }
                    >
                      <span className="blacksmith-detail__cost-icon">
                        <img src={goldIcon} alt="" />
                      </span>
                      <span>
                        <small>Gold</small>
                        <strong>
                          {selectedCandidate.cost.goldBalance.toLocaleString(
                            "pt-BR",
                          )}{" "}
                          /{" "}
                          {selectedCandidate.cost.goldCost.toLocaleString(
                            "pt-BR",
                          )}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="blacksmith-detail__action"
                    disabled={
                      !selectedCandidate.canReinforce || Boolean(actionKey)
                    }
                    onClick={() => void reinforceSelected()}
                    title={selectedCandidate.reason ?? "Aplicar reforço"}
                  >
                    <Anvil size={18} />
                    {actionKey === selectedCandidate.key
                      ? "Reforçando..."
                      : `Reforçar para +${selectedCandidate.cost.level}`}
                  </button>
                  {!selectedCandidate.canReinforce &&
                  selectedCandidate.reason ? (
                    <p className="blacksmith-detail__reason">
                      {selectedCandidate.reason}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="blacksmith-empty blacksmith-empty--detail">
                  <Anvil size={32} />
                  <strong>Selecione uma peça</strong>
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>
    </DashboardLayout>
  );
}

export default BlacksmithPage;
