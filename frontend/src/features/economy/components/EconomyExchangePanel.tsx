import { isAxiosError } from "axios";
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGatheringMaterialImageUrl } from "../../gathering/utils/gatheringMaterialAssets";
import {
  exchangeEconomyOffer,
  getEconomyExchangeOffersForItem,
} from "../api/economy.api";
import type {
  EconomyExchangeOffer,
  EconomyExchangeOffersResponse,
} from "../types/economy.types";
import "../styles/economy.css";

interface EconomyExchangePanelProps {
  characterId: string;
  sourceItemId: string;
  onExchangeComplete?: (balance: number) => void | Promise<void>;
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
    : "Não foi possível concluir a troca.";
}

export function EconomyExchangePanel({
  characterId,
  sourceItemId,
  onExchangeComplete,
}: EconomyExchangePanelProps) {
  const [data, setData] = useState<EconomyExchangeOffersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [exchangingOfferId, setExchangingOfferId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pendingRequest = useRef<{
    offerId: string;
    requestId: string;
    exchangeCount: number;
  } | null>(null);

  const load = useCallback(
    () => getEconomyExchangeOffersForItem(characterId, sourceItemId),
    [characterId, sourceItemId],
  );

  useEffect(() => {
    let disposed = false;

    void load()
      .then((response) => {
        if (disposed) return;
        setData(response);
        setError(null);
        setMessage(null);
        setCounts({});
        pendingRequest.current = null;
      })
      .catch((loadError) => {
        if (disposed) return;
        setData(null);
        setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!disposed) setIsLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [load]);

  const balance = data?.sourceItem.quantity ?? 0;
  const currency = data?.sourceItem.currency ?? "INCURSION_TOKEN";
  const offerGroups = useMemo(
    () => [
      {
        key: "PRIMARY" as const,
        label: "Uso principal",
        offers:
          data?.offers.filter((offer) => offer.category === "PRIMARY") ?? [],
      },
      {
        key: "EMERGENCY" as const,
        label: "Materiais alternativos",
        offers:
          data?.offers.filter((offer) => offer.category === "EMERGENCY") ?? [],
      },
    ],
    [data?.offers],
  );

  function getExchangeCount(offer: EconomyExchangeOffer) {
    const maximum = Math.max(0, Math.floor(balance / offer.cost));
    return Math.min(maximum || 1, Math.max(1, counts[offer.id] ?? 1));
  }

  function updateExchangeCount(offer: EconomyExchangeOffer, value: number) {
    const maximum = Math.max(1, Math.floor(balance / offer.cost));
    setCounts((current) => ({
      ...current,
      [offer.id]: Math.min(maximum, Math.max(1, Math.floor(value) || 1)),
    }));
    setMessage(null);
  }

  async function handleExchange(offer: EconomyExchangeOffer) {
    const exchangeCount = getExchangeCount(offer);
    const totalCost = offer.cost * exchangeCount;
    if (balance < totalCost || exchangingOfferId) return;

    setExchangingOfferId(offer.id);
    setError(null);
    setMessage(null);

    const request =
      pendingRequest.current?.offerId === offer.id &&
      pendingRequest.current.exchangeCount === exchangeCount
        ? pendingRequest.current
        : {
            offerId: offer.id,
            requestId: crypto.randomUUID(),
            exchangeCount,
          };
    pendingRequest.current = request;

    try {
      const response = await exchangeEconomyOffer(
        characterId,
        request.offerId,
        request.requestId,
        sourceItemId,
        request.exchangeCount,
      );
      setMessage(response.message);
      const refreshed = await load();
      setData(refreshed);
      setCounts({});
      pendingRequest.current = null;
      await onExchangeComplete?.(response.balance);
    } catch (exchangeError) {
      setError(getErrorMessage(exchangeError));
    } finally {
      setExchangingOfferId(null);
    }
  }

  return (
    <section
      className={`economy-exchange economy-exchange--${currency.toLowerCase()}`}
      aria-label="Opções de troca"
    >
      {isLoading ? (
        <p className="economy-exchange__status">Carregando trocas...</p>
      ) : data?.offers.length ? (
        <div className="economy-exchange__groups">
          {offerGroups.map((group) =>
            group.offers.length ? (
              <section className="economy-exchange__group" key={group.key}>
                <header>
                  <span aria-hidden="true">
                    {group.key === "PRIMARY" ? (
                      <PackageCheck size={17} />
                    ) : (
                      <ShieldCheck size={17} />
                    )}
                  </span>
                  <strong>{group.label}</strong>
                </header>

                <div className="economy-exchange__offers">
                  {group.offers.map((offer) => {
                    const imageUrl = getGatheringMaterialImageUrl(offer.item);
                    const exchangeCount = getExchangeCount(offer);
                    const maximum = Math.floor(balance / offer.cost);
                    const totalCost = offer.cost * exchangeCount;
                    const totalQuantity = offer.quantity * exchangeCount;
                    const canExchange =
                      maximum > 0 && exchangingOfferId === null;
                    const isCurrentExchange = exchangingOfferId === offer.id;

                    return (
                      <article
                        className="economy-exchange__offer"
                        key={offer.id}
                      >
                        <span
                          className="economy-exchange__item-image"
                          aria-hidden="true"
                        >
                          {imageUrl ? (
                            <img src={imageUrl} alt="" />
                          ) : (
                            offer.item.name.slice(0, 2).toUpperCase()
                          )}
                        </span>
                        <div className="economy-exchange__offer-copy">
                          <small>Você recebe</small>
                          <strong>
                            {totalQuantity}x {offer.item.name}
                          </strong>
                          <span>
                            Custo: {totalCost}x {data.sourceItem.name}
                          </span>
                        </div>
                        <div
                          className="economy-exchange__stepper"
                          aria-label="Quantidade de trocas"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              updateExchangeCount(offer, exchangeCount - 1)
                            }
                            disabled={!canExchange || exchangeCount <= 1}
                            aria-label="Diminuir quantidade"
                          >
                            <Minus size={14} />
                          </button>
                          <span>
                            <small>Trocas</small>
                            <strong>{maximum > 0 ? exchangeCount : 0}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateExchangeCount(offer, exchangeCount + 1)
                            }
                            disabled={!canExchange || exchangeCount >= maximum}
                            aria-label="Aumentar quantidade"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="economy-exchange__button"
                          disabled={!canExchange}
                          onClick={() => void handleExchange(offer)}
                        >
                          <ArrowRightLeft size={15} />
                          {isCurrentExchange
                            ? "Trocando..."
                            : maximum <= 0
                              ? "Quantidade insuficiente"
                              : "Trocar"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null,
          )}
        </div>
      ) : (
        <p className="economy-exchange__status">
          Nenhuma troca disponível para este item.
        </p>
      )}

      <div className="economy-exchange__feedbacks" aria-live="polite">
        {error ? (
          <p className="economy-exchange__feedback is-error">
            <AlertCircle size={15} />
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="economy-exchange__feedback is-success">
            <CheckCircle2 size={15} />
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
