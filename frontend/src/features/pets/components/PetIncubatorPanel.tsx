import { isAxiosError } from "axios";
import { Check, Coins, Dna, FlaskConical, PawPrint, Timer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getGatheringMaterialImageUrl } from "../../gathering/utils/gatheringMaterialAssets";
import {
  claimPetIncubation,
  getPetsState,
  startPetIncubation,
} from "../api/pets.api";
import type { PetsStateResponse } from "../types/pets.types";
import "../styles/pets.css";

interface PetIncubatorPanelProps {
  characterId: string;
  tier: number;
}

function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)
      ?.message;
    if (Array.isArray(message)) return message.join(" ");
    if (typeof message === "string") return message;
  }
  return error instanceof Error
    ? error.message
    : "Não foi possível atualizar a incubadora.";
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

export function PetIncubatorPanel({
  characterId,
  tier,
}: PetIncubatorPanelProps) {
  const [data, setData] = useState<PetsStateResponse | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pendingRequestId = useRef<string | null>(null);

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

  const selectedDefinition =
    data?.pets.find((pet) => pet.tier === tier) ?? null;
  const activeDefinition = data?.activeIncubation
    ? (data.pets.find((pet) => pet.id === data.activeIncubation?.pet.id) ??
      null)
    : null;
  const displayedDefinition = activeDefinition ?? selectedDefinition;
  const activeIncubation = data?.activeIncubation ?? null;
  const remainingSeconds = activeIncubation
    ? Math.max(
        0,
        Math.ceil(
          (new Date(activeIncubation.incubationEndsAt).getTime() - nowMs) /
            1000,
        ),
      )
    : 0;
  const isReady = Boolean(activeIncubation && remainingSeconds === 0);
  const progressPercent = activeIncubation
    ? Math.min(
        100,
        Math.max(
          0,
          ((nowMs - new Date(activeIncubation.incubationStartedAt).getTime()) /
            Math.max(
              1,
              new Date(activeIncubation.incubationEndsAt).getTime() -
                new Date(activeIncubation.incubationStartedAt).getTime(),
            )) *
            100,
        ),
      )
    : 0;
  const cocoonImage = getGatheringMaterialImageUrl(
    displayedDefinition?.cocoonItem,
  );
  const isOwned = displayedDefinition?.characterPet?.status === "AVAILABLE";

  async function handleStart() {
    if (!displayedDefinition?.canIncubate || isBusy) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);

    const requestId = pendingRequestId.current ?? crypto.randomUUID();
    pendingRequestId.current = requestId;

    try {
      const response = await startPetIncubation(
        characterId,
        displayedDefinition.id,
        requestId,
      );
      pendingRequestId.current = null;
      setMessage(response.message);
      await load();
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClaim() {
    if (!activeIncubation || !isReady || isBusy) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await claimPetIncubation(
        characterId,
        activeIncubation.id,
      );
      setMessage(response.message);
      await load();
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section
      className={`pets-incubator${activeIncubation ? " is-active" : ""}`}
      aria-label="Incubadora de companheiros"
    >
      <header className="pets-incubator__header">
        <span className="pets-incubator__header-icon" aria-hidden="true">
          <Dna size={21} />
        </span>
        <div>
          <small>Biotecnologia</small>
          <strong>Incubadora de companheiros</strong>
        </div>
        <span className="pets-incubator__collection">
          <PawPrint size={14} />
          <span>
            <small>Coleção</small>
            <strong>
              {data?.collection.owned ?? 0}/{data?.collection.total ?? 0}
            </strong>
          </span>
        </span>
      </header>

      {isLoading ? (
        <p className="pets-incubator__status">Carregando incubadora...</p>
      ) : displayedDefinition ? (
        <div className="pets-incubator__workspace">
          <article className="pets-incubator__subject">
            <span className="pets-incubator__visual" aria-hidden="true">
              {isOwned ? (
                <PawPrint size={42} />
              ) : cocoonImage ? (
                <img src={cocoonImage} alt="" />
              ) : (
                <FlaskConical size={40} />
              )}
            </span>
            <div className="pets-incubator__subject-copy">
              <small>
                {activeDefinition
                  ? `Incubação ativa · T${activeDefinition.tier}`
                  : `Protocolo biológico · T${displayedDefinition.tier}`}
              </small>
              <h2>{displayedDefinition.name}</h2>
              <p>{displayedDefinition.description}</p>
              <span className="pets-incubator__subject-status">
                {activeIncubation
                  ? "Em processamento"
                  : isOwned
                    ? "Companheiro obtido"
                    : "Disponível para incubação"}
              </span>
            </div>
          </article>

          <div className="pets-incubator__operation">
            {activeIncubation ? (
              <div className="pets-incubator__progress">
                <header>
                  <span>
                    <Timer size={16} />
                    {isReady ? "Processo concluído" : "Incubação em andamento"}
                  </span>
                  <strong>{Math.round(progressPercent)}%</strong>
                </header>
                <div
                  className="pets-incubator__progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progressPercent)}
                >
                  <span
                    style={{ transform: `scaleX(${progressPercent / 100})` }}
                  />
                </div>
                <p>
                  {isReady
                    ? "O companheiro está pronto para ser coletado."
                    : `${formatRemaining(remainingSeconds)} restantes`}
                </p>
                <button
                  type="button"
                  disabled={!isReady || isBusy}
                  onClick={() => void handleClaim()}
                >
                  <PawPrint size={16} />
                  {isBusy
                    ? "Coletando..."
                    : isReady
                      ? "Coletar companheiro"
                      : "Incubando"}
                </button>
              </div>
            ) : displayedDefinition.characterPet?.status === "AVAILABLE" ? (
              <div className="pets-incubator__owned">
                <span aria-hidden="true">
                  <Check size={20} />
                </span>
                <div>
                  <strong>Companheiro recuperado</strong>
                  <small>Este protocolo já foi concluído neste tier.</small>
                </div>
              </div>
            ) : (
              <>
                <header className="pets-incubator__operation-heading">
                  <div>
                    <small>Requisitos</small>
                    <strong>Preparar incubação</strong>
                  </div>
                  <span>T{displayedDefinition.tier}</span>
                </header>
                <div className="pets-incubator__costs">
                  <span>
                    <FlaskConical size={17} />
                    <span>
                      <small>Casulo</small>
                      <strong>1 unidade</strong>
                    </span>
                    <em>{displayedDefinition.balances.cocoons} no estoque</em>
                  </span>
                  <span>
                    <Dna size={17} />
                    <span>
                      <small>Fragmentos</small>
                      <strong>{displayedDefinition.costs.fragments}</strong>
                    </span>
                    <em>
                      {displayedDefinition.balances.fragments} disponíveis
                    </em>
                  </span>
                  <span>
                    <Coins size={17} />
                    <span>
                      <small>Gold</small>
                      <strong>
                        {displayedDefinition.costs.gold.toLocaleString("pt-BR")}
                      </strong>
                    </span>
                    <em>
                      {displayedDefinition.balances.gold.toLocaleString(
                        "pt-BR",
                      )}{" "}
                      disponíveis
                    </em>
                  </span>
                </div>
                <button
                  type="button"
                  className="pets-incubator__start"
                  disabled={!displayedDefinition.canIncubate || isBusy}
                  onClick={() => void handleStart()}
                  title={displayedDefinition.reason ?? "Iniciar incubação"}
                >
                  <FlaskConical size={16} />
                  {isBusy ? "Iniciando..." : "Iniciar incubação"}
                </button>
                {!displayedDefinition.canIncubate &&
                displayedDefinition.reason ? (
                  <small className="pets-incubator__reason">
                    {displayedDefinition.reason}
                  </small>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="pets-incubator__status">
          Nenhum companheiro configurado para este tier.
        </p>
      )}

      <div className="pets-incubator__feedbacks" aria-live="polite">
        {error ? (
          <p className="pets-incubator__feedback is-error">{error}</p>
        ) : null}
        {message ? (
          <p className="pets-incubator__feedback is-success">{message}</p>
        ) : null}
      </div>
    </section>
  );
}
