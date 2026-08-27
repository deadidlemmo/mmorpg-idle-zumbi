import { isAxiosError } from "axios";
import {
  Check,
  Coins,
  Dna,
  FlaskConical,
  PawPrint,
  Recycle,
  ShieldCheck,
  Tag,
  Timer,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import autoCombatActivityIcon from "../../../assets/images/auto-combat/auto-combat-activity-icon.webp";
import huntingActivityIcon from "../../../assets/images/auto-combat/hunting-activity-icon.webp";
import gatheringArsenalIcon from "../../../assets/images/gathering/skills/gathering-arsenal.webp";
import gatheringColetaIcon from "../../../assets/images/gathering/skills/gathering-coleta.webp";
import gatheringContencaoIcon from "../../../assets/images/gathering/skills/gathering-contencao.webp";
import gatheringDesmancheIcon from "../../../assets/images/gathering/skills/gathering-desmanche.webp";
import gatheringPatrulhaIcon from "../../../assets/images/gathering/skills/gathering-patrulha.webp";
import gatheringTecnovarreduraIcon from "../../../assets/images/gathering/skills/gathering-tecnovarredura.webp";
import {
  claimPetIncubation,
  convertDuplicateCocoons,
  equipPet,
  getPetsState,
  sellDuplicateCocoons,
  sellPet,
  startPetIncubation,
  unequipPet,
} from "../api/pets.api";
import type {
  CharacterPet,
  PetDefinitionState,
  PetSpecialization,
  PetsStateResponse,
} from "../types/pets.types";
import { getPetAssetImageUrl } from "../utils/petAssets";
import "../styles/pets.css";

interface PetIncubatorPanelProps {
  characterId: string;
  tier: number;
}

type CollectionFilter = "ALL" | "COCOONS" | "PETS";
type CollectionItemKind = "COCOON" | "PET" | "INCUBATION" | "MISSING";

interface CollectionSelection {
  definitionId: string;
  kind: CollectionItemKind;
}

const SPECIALIZATION_ASSETS: Partial<Record<PetSpecialization, string>> = {
  GATHERING_DESMANCHE: gatheringDesmancheIcon,
  GATHERING_COLETA: gatheringColetaIcon,
  GATHERING_PATRULHA: gatheringPatrulhaIcon,
  GATHERING_ARSENAL: gatheringArsenalIcon,
  GATHERING_TECNOVARREDURA: gatheringTecnovarreduraIcon,
  GATHERING_CONTENCAO: gatheringContencaoIcon,
  AUTO_COMBAT_TTK: autoCombatActivityIcon,
  AUTO_COMBAT_HUNTING: huntingActivityIcon,
};

const FILTER_OPTIONS: Array<{ value: CollectionFilter; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "COCOONS", label: "Casulos" },
  { value: "PETS", label: "Pets" },
];

function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)
      ?.message;
    if (Array.isArray(message)) return message.join(" ");
    if (typeof message === "string") return message;
  }
  return error instanceof Error
    ? error.message
    : "Não foi possível atualizar a coleção.";
}

function formatRemaining(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${seconds}s`;
  return `${seconds}s`;
}

function formatEffect(definition: PetDefinitionState) {
  return `-${definition.effectPercent.toLocaleString("pt-BR")}% no tempo de ${definition.specializationLabel.toLocaleLowerCase("pt-BR")}`;
}

function PetSpecializationIcon({
  definition,
}: {
  definition: PetDefinitionState;
}) {
  const specializationAsset = SPECIALIZATION_ASSETS[definition.specialization];

  return (
    <span className="pet-specialization-icon" aria-hidden="true">
      {specializationAsset ? (
        <img src={specializationAsset} alt="" />
      ) : (
        <Dna />
      )}
    </span>
  );
}

function getCollectionKind(definition: PetDefinitionState): CollectionItemKind {
  if (
    definition.characterPet?.status === "INCUBATING" ||
    definition.characterPet?.status === "READY"
  ) {
    return "INCUBATION";
  }
  if (definition.characterPet?.status === "AVAILABLE") return "PET";
  if (definition.balances.cocoons > 0) return "COCOON";
  return "MISSING";
}

function getKindLabel(kind: CollectionItemKind, isReady = false) {
  if (kind === "PET") return "Companheiro";
  if (kind === "COCOON") return "Casulo";
  if (kind === "INCUBATION") return isReady ? "Pronto" : "Incubando";
  return "Não obtido";
}

function PetVisual({
  definition,
  kind,
  size = "card",
}: {
  definition: PetDefinitionState;
  kind: CollectionItemKind;
  size?: "card" | "panel" | "modal";
}) {
  const specializationAsset = SPECIALIZATION_ASSETS[definition.specialization];
  const isCocoon = kind === "COCOON" || kind === "INCUBATION";
  const itemAsset = getPetAssetImageUrl(
    definition,
    isCocoon ? "COCOON" : "PET",
  );

  return (
    <span
      className={`pet-visual pet-visual--${size} pet-visual--tier-${definition.tier} pet-visual--${kind.toLowerCase()}`}
      aria-hidden="true"
    >
      {itemAsset ? (
        <img src={itemAsset} alt="" />
      ) : specializationAsset ? (
        <img src={specializationAsset} alt="" />
      ) : (
        <Dna />
      )}
      {isCocoon ? (
        <span className="pet-visual__type">
          <FlaskConical />
        </span>
      ) : null}
    </span>
  );
}

function getIncubationTiming(
  incubation: CharacterPet | null,
  nowMs: number,
) {
  if (!incubation) {
    return { remainingSeconds: 0, progressPercent: 0, isReady: false };
  }

  const startedAt = new Date(incubation.incubationStartedAt).getTime();
  const endsAt = new Date(incubation.incubationEndsAt).getTime();
  const remainingSeconds = Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
  const progressPercent = Math.min(
    100,
    Math.max(0, ((nowMs - startedAt) / Math.max(1, endsAt - startedAt)) * 100),
  );

  return {
    remainingSeconds,
    progressPercent,
    isReady: remainingSeconds === 0,
  };
}

export function PetIncubatorPanel({
  characterId,
  tier,
}: PetIncubatorPanelProps) {
  const [data, setData] = useState<PetsStateResponse | null>(null);
  const [filter, setFilter] = useState<CollectionFilter>("ALL");
  const [selection, setSelection] = useState<CollectionSelection | null>(null);
  const [pendingSalePetId, setPendingSalePetId] = useState<string | null>(null);
  const [duplicateQuantity, setDuplicateQuantity] = useState(1);
  const [nowMs, setNowMs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pendingRequestId = useRef<string | null>(null);
  const pendingDuplicateRequest = useRef<{
    action: "SELL" | "CONVERT";
    petDefinitionId: string;
    quantity: number;
    requestId: string;
  } | null>(null);

  const load = useCallback(async () => {
    const response = await getPetsState(characterId);
    setData(response);
    setNowMs(Date.now());
    setError(null);
    return response;
  }, [characterId]);

  useEffect(() => {
    let disposed = false;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      void load()
        .catch((loadError) => {
          if (!disposed) setError(getErrorMessage(loadError));
        })
        .finally(() => {
          if (!disposed) setIsLoading(false);
        });
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [load]);

  useEffect(() => {
    if (!data?.activeIncubation) return;
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [data?.activeIncubation]);

  useEffect(() => {
    if (!selection) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isBusy) setSelection(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isBusy, selection]);

  const tierDefinitions = useMemo(
    () => data?.pets.filter((pet) => pet.tier === tier) ?? [],
    [data?.pets, tier],
  );
  const visibleDefinitions = useMemo(() => {
    if (filter === "COCOONS") {
      return tierDefinitions.filter((definition) => definition.balances.cocoons > 0);
    }
    if (filter === "PETS") {
      return tierDefinitions.filter((definition) => Boolean(definition.characterPet));
    }
    return tierDefinitions;
  }, [filter, tierDefinitions]);
  const tierCocoonCount = tierDefinitions.filter(
    (definition) => definition.balances.cocoons > 0,
  ).length;
  const tierPetCount = tierDefinitions.filter((definition) =>
    Boolean(definition.characterPet),
  ).length;

  const activeDefinition = data?.activeIncubation
    ? (data.pets.find((pet) => pet.id === data.activeIncubation?.pet.id) ?? null)
    : null;
  const equippedDefinition = data?.equippedPet
    ? (data.pets.find((pet) => pet.id === data.equippedPet?.pet.id) ?? null)
    : null;
  const selectedDefinition = selection
    ? (data?.pets.find((pet) => pet.id === selection.definitionId) ?? null)
    : null;
  const activeIncubation = data?.activeIncubation ?? null;
  const activeTiming = getIncubationTiming(activeIncubation, nowMs);
  const selectedTiming = getIncubationTiming(
    selectedDefinition?.characterPet?.status === "INCUBATING" ||
      selectedDefinition?.characterPet?.status === "READY"
      ? selectedDefinition.characterPet
      : null,
    nowMs,
  );
  const selectedOwnedPet =
    selectedDefinition?.characterPet?.status === "AVAILABLE"
      ? selectedDefinition.characterPet
      : null;
  const selectedKind = selectedDefinition
    ? selection?.kind === "COCOON"
      ? "COCOON"
      : getCollectionKind(selectedDefinition)
    : null;
  const effectiveDuplicateQuantity = selectedDefinition
    ? Math.max(
        1,
        Math.min(
          duplicateQuantity,
          selectedDefinition.balances.duplicateCocoons,
        ),
      )
    : 1;

  async function runAction(
    action: () => Promise<{ message: string }>,
    onSuccess?: (response: PetsStateResponse) => void,
  ) {
    if (isBusy) return false;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      setMessage(result.message);
      setPendingSalePetId(null);
      const refreshed = await load();
      onSuccess?.(refreshed);
      return true;
    } catch (actionError) {
      setError(getErrorMessage(actionError));
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStart() {
    if (!selectedDefinition?.canIncubate || isBusy) return;
    const requestId = pendingRequestId.current ?? crypto.randomUUID();
    pendingRequestId.current = requestId;

    const completed = await runAction(
      () => startPetIncubation(characterId, selectedDefinition.id, requestId),
      () => setSelection({ definitionId: selectedDefinition.id, kind: "INCUBATION" }),
    );
    if (completed) pendingRequestId.current = null;
  }

  async function handleClaim() {
    if (!activeIncubation || !selectedTiming.isReady || isBusy) return;
    await runAction(
      () => claimPetIncubation(characterId, activeIncubation.id),
      () =>
        setSelection({
          definitionId: selectedDefinition?.id ?? activeIncubation.pet.id,
          kind: "PET",
        }),
    );
  }

  async function handleDuplicateRecovery(action: "SELL" | "CONVERT") {
    if (
      !selectedDefinition?.duplicateRecovery ||
      selectedDefinition.balances.duplicateCocoons < effectiveDuplicateQuantity ||
      isBusy
    ) {
      return;
    }

    const pending = pendingDuplicateRequest.current;
    const request =
      pending?.action === action &&
      pending.petDefinitionId === selectedDefinition.id &&
      pending.quantity === effectiveDuplicateQuantity
        ? pending
        : {
            action,
            petDefinitionId: selectedDefinition.id,
            quantity: effectiveDuplicateQuantity,
            requestId: crypto.randomUUID(),
          };
    pendingDuplicateRequest.current = request;

    const completed = await runAction(() =>
      action === "SELL"
        ? sellDuplicateCocoons(
            characterId,
            request.petDefinitionId,
            request.quantity,
            request.requestId,
          )
        : convertDuplicateCocoons(
            characterId,
            request.petDefinitionId,
            request.quantity,
            request.requestId,
          ),
    );
    if (completed) {
      pendingDuplicateRequest.current = null;
      setDuplicateQuantity(1);
    }
  }

  function openSelection(
    definition: PetDefinitionState,
    kind = getCollectionKind(definition),
  ) {
    setSelection({ definitionId: definition.id, kind });
    setPendingSalePetId(null);
    setDuplicateQuantity(1);
    setError(null);
    setMessage(null);
  }

  return (
    <section
      className={`pets-incubator${activeIncubation ? " is-active" : ""}`}
      aria-label="Coleção e incubadora de companheiros"
    >
      <header className="pets-incubator__header">
        <div>
          <small>Arquivo de companheiros</small>
          <strong>Coleção de companheiros</strong>
        </div>
        <span className="pets-incubator__collection">
          <PawPrint size={15} aria-hidden="true" />
          <span>
            <strong>
              {data?.collection.owned ?? 0}/{data?.collection.total ?? 0}
            </strong>
            <small>descobertos</small>
          </span>
        </span>
      </header>

      {isLoading ? (
        <p className="pets-incubator__status">Carregando coleção...</p>
      ) : (
        <div className="pets-collection">
          <main className="pets-collection__browser">
            <div className="pets-collection__filters">
              <label htmlFor={`pets-collection-filter-${characterId}-${tier}`}>
                <span>Exibir</span>
                <select
                  id={`pets-collection-filter-${characterId}-${tier}`}
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as CollectionFilter)
                  }
                >
                  {FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="pets-collection__summary">
                {tierPetCount} pets · {tierCocoonCount} casulos
              </span>
            </div>

            {visibleDefinitions.length > 0 ? (
              <ul className="pets-collection__grid">
                {visibleDefinitions.map((definition) => {
                  const kind =
                    filter === "COCOONS" ? "COCOON" : getCollectionKind(definition);
                  const isReady =
                    kind === "INCUBATION" &&
                    definition.characterPet?.id === activeIncubation?.id &&
                    activeTiming.isReady;
                  const isSelected = selection?.definitionId === definition.id;
                  const displayName =
                    kind === "COCOON"
                      ? definition.cocoonItem.name
                      : definition.name;
                  const displayDetail =
                    kind === "MISSING"
                      ? definition.specializationLabel
                      : kind === "COCOON"
                        ? `Casulo de ${definition.specializationLabel}`
                        : formatEffect(definition);

                  return (
                    <li key={`${filter}:${definition.id}`}>
                      <button
                        type="button"
                        className={`pets-collection-card is-${kind.toLowerCase()}${isSelected ? " is-selected" : ""}`}
                        onClick={() => openSelection(definition, kind)}
                        aria-label={`${
                          kind === "COCOON"
                            ? definition.cocoonItem.name
                            : definition.name
                        }. ${getKindLabel(kind, isReady)}.`}
                        title={
                          kind === "COCOON"
                            ? definition.cocoonItem.name
                            : definition.name
                        }
                      >
                        <span className="pets-collection-card__meta">
                          <em>T{definition.tier}</em>
                          {kind === "COCOON" ? (
                            <strong>x{definition.balances.cocoons}</strong>
                          ) : definition.characterPet?.isEquipped ? (
                            <strong>Ativo</strong>
                          ) : null}
                        </span>
                        <span className="pets-collection-card__art">
                          <PetVisual definition={definition} kind={kind} />
                        </span>
                        <span className="pets-collection-card__identity">
                          <strong>{displayName}</strong>
                          <span className="pets-collection-card__detail">
                            <PetSpecializationIcon definition={definition} />
                            <span>{displayDetail}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="pets-collection__empty">
                <FlaskConical size={24} aria-hidden="true" />
                <strong>
                  {filter === "COCOONS"
                    ? "Nenhum casulo neste tier"
                    : "Nenhum pet neste tier"}
                </strong>
                <span>Altere o filtro ou participe de uma Ameaça Global.</span>
              </div>
            )}
          </main>

          <aside className="pets-collection__status" aria-label="Estado dos pets">
            <header className="pets-collection__status-heading">
              <small>Estação de vínculo</small>
              <strong>Companheiro e incubação</strong>
            </header>
            <section className="pets-incubator__equipped">
              <header>
                <span>
                  <ShieldCheck size={15} aria-hidden="true" />
                  Vínculo ativo
                </span>
                <small>{data?.equippedPet ? "Ativo" : "Vazio"}</small>
              </header>
              {data?.equippedPet && equippedDefinition ? (
                <button
                  type="button"
                  onClick={() => openSelection(equippedDefinition, "PET")}
                >
                  <PetVisual definition={equippedDefinition} kind="PET" size="panel" />
                  <span>
                    <strong>{data.equippedPet.pet.name}</strong>
                    <span className="pets-incubator__effect">
                      <PetSpecializationIcon definition={equippedDefinition} />
                      <span>{formatEffect(equippedDefinition)}</span>
                    </span>
                  </span>
                </button>
              ) : (
                <div className="pets-collection__vacant">
                  <span className="pets-collection__vacant-icon" aria-hidden="true">
                    <PawPrint size={28} />
                  </span>
                  <span>
                    <strong>Nenhum companheiro</strong>
                    <small>Equipe um pet da coleção.</small>
                  </span>
                </div>
              )}
            </section>

            <section className="pets-collection__incubation">
              <header>
                <span>
                  <FlaskConical size={15} aria-hidden="true" />
                  Câmara de incubação
                </span>
                <small>
                  {activeIncubation
                    ? activeTiming.isReady
                      ? "Pronto"
                      : "Em processo"
                    : "Livre"}
                </small>
              </header>
              {activeIncubation && activeDefinition ? (
                <button
                  type="button"
                  onClick={() => openSelection(activeDefinition, "INCUBATION")}
                >
                  <PetVisual
                    definition={activeDefinition}
                    kind="INCUBATION"
                    size="panel"
                  />
                  <span>
                    <strong>{activeDefinition.name}</strong>
                    <small>
                      {activeTiming.isReady
                        ? "Coleta disponível"
                        : `${formatRemaining(activeTiming.remainingSeconds)} restantes`}
                    </small>
                    <i aria-hidden="true">
                      <em
                        style={{
                          transform: `scaleX(${activeTiming.progressPercent / 100})`,
                        }}
                      />
                    </i>
                  </span>
                </button>
              ) : (
                <div className="pets-collection__vacant">
                  <span className="pets-collection__vacant-icon" aria-hidden="true">
                    <FlaskConical size={28} />
                  </span>
                  <span>
                    <strong>Câmara disponível</strong>
                    <small>Selecione um casulo para incubar.</small>
                  </span>
                </div>
              )}
            </section>
          </aside>
        </div>
      )}

      <div className="pets-incubator__feedbacks" aria-live="polite">
        {error ? <p className="pets-incubator__feedback is-error">{error}</p> : null}
        {message ? (
          <p className="pets-incubator__feedback is-success">{message}</p>
        ) : null}
      </div>

      {selection && selectedDefinition && selectedKind ? (
        <div
          className="pet-detail-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isBusy) setSelection(null);
          }}
        >
          <section
            className={`pet-detail-modal__dialog is-${selectedKind.toLowerCase()}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pet-detail-title"
          >
            <header className="pet-detail-modal__header">
              <span>
                <PetSpecializationIcon definition={selectedDefinition} />
                {getKindLabel(selectedKind, selectedTiming.isReady)}
              </span>
              <button
                type="button"
                onClick={() => setSelection(null)}
                disabled={isBusy}
                title="Fechar"
                aria-label="Fechar detalhes"
              >
                <X size={18} />
              </button>
            </header>

            <div className="pet-detail-modal__body">
              <PetVisual
                definition={selectedDefinition}
                kind={selectedKind}
                size="modal"
              />
              <div className="pet-detail-modal__identity">
                <span>
                  T{selectedDefinition.tier} · {selectedDefinition.specializationLabel}
                </span>
                <h2 id="pet-detail-title">
                  {selectedKind === "COCOON"
                    ? selectedDefinition.cocoonItem.name
                    : selectedDefinition.name}
                </h2>
                <p>
                  {selectedKind === "COCOON"
                    ? selectedDefinition.cocoonItem.description
                    : selectedDefinition.description}
                </p>
                <div className="pet-detail-modal__effect">
                  <PetSpecializationIcon definition={selectedDefinition} />
                  <span>
                    <small>Efeito do vínculo</small>
                    <strong>{formatEffect(selectedDefinition)}</strong>
                  </span>
                </div>
              </div>
            </div>

            {selectedKind === "INCUBATION" ? (
              <div className="pet-detail-modal__progress">
                <header>
                  <span>
                    <Timer size={16} aria-hidden="true" />
                    {selectedTiming.isReady
                      ? "Incubação concluída"
                      : formatRemaining(selectedTiming.remainingSeconds)}
                  </span>
                  <strong>{Math.round(selectedTiming.progressPercent)}%</strong>
                </header>
                <i
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(selectedTiming.progressPercent)}
                >
                  <em
                    style={{
                      transform: `scaleX(${selectedTiming.progressPercent / 100})`,
                    }}
                  />
                </i>
                <button
                  type="button"
                  className="is-primary"
                  disabled={!selectedTiming.isReady || isBusy}
                  onClick={() => void handleClaim()}
                >
                  <PawPrint size={16} />
                  {isBusy
                    ? "Coletando..."
                    : selectedTiming.isReady
                      ? "Coletar pet"
                      : "Incubando"}
                </button>
              </div>
            ) : selectedKind === "PET" && selectedOwnedPet ? (
              <div className="pet-detail-modal__actions">
                <div className="pet-detail-modal__owned">
                  <span>
                    {selectedOwnedPet.isEquipped ? (
                      <ShieldCheck size={18} />
                    ) : (
                      <Check size={18} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {selectedOwnedPet.isEquipped
                        ? "Pet equipado"
                        : "Disponível na coleção"}
                    </strong>
                    <small>Apenas um companheiro pode ficar ativo.</small>
                  </div>
                </div>

                {pendingSalePetId === selectedOwnedPet.id ? (
                  <div className="pet-detail-modal__confirm" role="group">
                    <span>
                      Confirmar venda por{" "}
                      {selectedDefinition.npcSaleGold.toLocaleString("pt-BR")} Gold?
                    </span>
                    <button
                      type="button"
                      className="is-danger"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(
                          () => sellPet(characterId, selectedOwnedPet.id),
                          () => setSelection(null),
                        )
                      }
                    >
                      <Tag size={15} />
                      Vender
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setPendingSalePetId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="pet-detail-modal__buttons">
                    <button
                      type="button"
                      className="is-primary"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(() =>
                          selectedOwnedPet.isEquipped
                            ? unequipPet(characterId)
                            : equipPet(characterId, selectedOwnedPet.id),
                        )
                      }
                    >
                      <ShieldCheck size={16} />
                      {selectedOwnedPet.isEquipped ? "Desequipar" : "Equipar"}
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      disabled={!selectedDefinition.canSell || isBusy}
                      onClick={() => setPendingSalePetId(selectedOwnedPet.id)}
                      title={
                        selectedDefinition.canSell
                          ? "Vender ao comerciante"
                          : "Desequipe o pet antes de vendê-lo"
                      }
                    >
                      <Coins size={16} />
                      Vender ·{" "}
                      {selectedDefinition.npcSaleGold.toLocaleString("pt-BR")}
                    </button>
                  </div>
                )}
              </div>
            ) : selectedKind === "COCOON" ? (
              <div className="pet-detail-modal__cocoon">
                <div className="pet-detail-modal__costs">
                  <span>
                    <FlaskConical size={16} />
                    <small>Casulos</small>
                    <strong>{selectedDefinition.balances.cocoons}</strong>
                  </span>
                  <span>
                    <Dna size={16} />
                    <small>Fragmentos</small>
                    <strong>
                      {selectedDefinition.costs.fragments} /{" "}
                      {selectedDefinition.balances.fragments}
                    </strong>
                  </span>
                  <span>
                    <Coins size={16} />
                    <small>Gold</small>
                    <strong>
                      {selectedDefinition.costs.gold.toLocaleString("pt-BR")} /{" "}
                      {selectedDefinition.balances.gold.toLocaleString("pt-BR")}
                    </strong>
                  </span>
                  <span>
                    <Timer size={16} />
                    <small>Incubação</small>
                    <strong>{formatRemaining(selectedDefinition.incubationSeconds)}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  className="is-primary pet-detail-modal__incubate"
                  disabled={!selectedDefinition.canIncubate || isBusy}
                  onClick={() => void handleStart()}
                  title={selectedDefinition.reason ?? "Iniciar incubação"}
                >
                  <FlaskConical size={16} />
                  {isBusy ? "Iniciando..." : "Incubar casulo"}
                </button>
                {!selectedDefinition.canIncubate && selectedDefinition.reason ? (
                  <small className="pet-detail-modal__reason">
                    {selectedDefinition.reason}
                  </small>
                ) : null}

                {selectedDefinition.duplicateRecovery &&
                selectedDefinition.balances.duplicateCocoons > 0 ? (
                  <details className="pet-detail-modal__duplicates">
                    <summary>
                      <Recycle size={15} />
                      Gerenciar {selectedDefinition.balances.duplicateCocoons} repetido(s)
                    </summary>
                    <div>
                      <label>
                        Quantidade
                        <input
                          type="number"
                          min={1}
                          max={selectedDefinition.balances.duplicateCocoons}
                          value={effectiveDuplicateQuantity}
                          disabled={isBusy}
                          onChange={(event) => {
                            const quantity = Number.parseInt(event.target.value, 10);
                            setDuplicateQuantity(
                              Number.isFinite(quantity)
                                ? Math.min(
                                    selectedDefinition.balances.duplicateCocoons,
                                    Math.max(1, quantity),
                                  )
                                : 1,
                            );
                            pendingDuplicateRequest.current = null;
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDuplicateRecovery("CONVERT")}
                      >
                        <Recycle size={15} />
                        Converter em fragmentos
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDuplicateRecovery("SELL")}
                      >
                        <Coins size={15} />
                        Vender por Gold
                      </button>
                    </div>
                  </details>
                ) : null}
              </div>
            ) : (
              <div className="pet-detail-modal__missing">
                <Dna size={18} aria-hidden="true" />
                <span>
                  <strong>Ainda não descoberto</strong>
                  <small>
                    Este casulo pode cair ao derrotar uma Ameaça Global T
                    {selectedDefinition.tier}.
                  </small>
                </span>
              </div>
            )}

            <div className="pet-detail-modal__feedbacks" aria-live="polite">
              {error ? <p className="is-error">{error}</p> : null}
              {message ? <p className="is-success">{message}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
