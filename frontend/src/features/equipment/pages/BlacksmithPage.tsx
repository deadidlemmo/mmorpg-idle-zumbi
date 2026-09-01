import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Anvil,
  ArrowRight,
  Check,
  Coins,
  Hammer,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import { getEquipmentRarityFromItem } from "../../dashboard/constants/equipment-rarity";
import "../../dashboard/dashboard.css";
import {
  extractInventoryActionApiError,
  getCharacterEquipment,
  reinforceEquippedItem,
  type CharacterEquipmentResponse,
  type EquipmentReinforcementCandidate,
  type EquipmentReinforcementState,
} from "../../inventory/api/inventory.api";
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
  return SLOT_LABELS[candidate.item.slot ?? ""] ?? "Equipamento";
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
  const selectedCandidate =
    candidates.find((candidate) => candidate.key === selectedKey) ??
    candidates[0] ??
    null;
  const statChanges = getReinforcementStatChanges(
    selectedCandidate?.item,
    selectedCandidate?.nextItem,
  );
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

        <section
          className="blacksmith-materials"
          aria-label="Materiais de reforço disponíveis"
        >
          <div>
            <Coins size={17} />
            <span>
              <small>Gold</small>
              <strong>{(reinforcement?.gold ?? 0).toLocaleString("pt-BR")}</strong>
            </span>
          </div>
          {(reinforcement?.materials ?? []).map((material) => (
            <div key={material.tier}>
              <Hammer size={16} />
              <span>
                <small>T{material.tier}</small>
                <strong>{material.quantity}</strong>
              </span>
            </div>
          ))}
        </section>

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
              <small>Equipados e na mochila</small>
            </div>

            {candidates.length ? (
              <div className="blacksmith-grid">
                {candidates.map((candidate) => {
                  const rarity = getEquipmentRarityFromItem(candidate.item);
                  const imageUrl = getEquipmentItemImageUrl(candidate.item);
                  const level = Number(candidate.item.enhancementLevel) || 0;
                  const isSelected = selectedCandidate?.key === candidate.key;

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
                      onClick={() => selectCandidate(candidate)}
                      aria-pressed={isSelected}
                    >
                      <span className="blacksmith-item__visual">
                        {imageUrl ? (
                          <img src={imageUrl} alt="" loading="lazy" />
                        ) : (
                          <Anvil size={27} strokeWidth={1.6} />
                        )}
                      </span>
                      <span className="blacksmith-item__copy">
                        <small>
                          {candidate.location === "EQUIPPED"
                            ? "Equipado"
                            : `Mochila · ${candidate.quantity}x`}
                        </small>
                        <strong>{candidate.item.name}</strong>
                        <em>
                          T{candidate.item.tier} · {getCandidateSlot(candidate)}
                        </em>
                      </span>
                      <span
                        className="blacksmith-item__levels"
                        aria-label={`Reforço atual +${level}`}
                      >
                        {[1, 2, 3].map((step) => (
                          <i key={step} className={step <= level ? "is-active" : ""}>
                            +{step}
                          </i>
                        ))}
                      </span>
                      <span className="blacksmith-item__status">
                        {candidate.canReinforce
                          ? `Pronto para +${candidate.cost.level}`
                          : candidate.reason}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="blacksmith-empty">
                <PackageOpen size={34} />
                <strong>Nenhuma peça disponível para reforço</strong>
                <span>
                  Peças no +3 e equipamentos fora dos tiers T1–T5 não aparecem
                  aqui.
                </span>
              </div>
            )}
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
                      <Hammer size={17} />
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
                      <Coins size={17} />
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
