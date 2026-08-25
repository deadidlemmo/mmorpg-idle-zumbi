import { isAxiosError } from "axios";
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Coins,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGatheringMaterialImageUrl } from "../../gathering/utils/gatheringMaterialAssets";
import {
  exchangeEconomyOffer,
  getEconomyExchangeOffers,
} from "../api/economy.api";
import type {
  EconomyCurrency,
  EconomyExchangeOffer,
  EconomyExchangeOffersResponse,
} from "../types/economy.types";
import "../styles/economy.css";

interface EconomyExchangePanelProps {
  characterId: string;
  tier: number;
  currency: EconomyCurrency;
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

function getCurrencyCostLabel(
  currency: EconomyCurrency,
  cost: number,
  singularLabel: string,
) {
  if (cost === 1) return singularLabel;
  return currency === "INCURSION_TOKEN"
    ? "Fichas de Incursão"
    : "Fragmentos de Ameaça";
}

export function EconomyExchangePanel({
  characterId,
  tier,
  currency,
}: EconomyExchangePanelProps) {
  const [data, setData] = useState<EconomyExchangeOffersResponse | null>(null);
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(
    null,
  );
  const [exchangingOfferId, setExchangingOfferId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pendingRequest = useRef<{ offerId: string; requestId: string } | null>(
    null,
  );

  const requestKey = `${characterId}:${tier}:${currency}`;

  const applyOffers = useCallback((response: EconomyExchangeOffersResponse) => {
    setData(response);
  }, []);

  const load = useCallback(
    () => getEconomyExchangeOffers(characterId, tier, currency),
    [characterId, currency, tier],
  );

  useEffect(() => {
    let disposed = false;

    void load()
      .then((response) => {
        if (disposed) return;
        applyOffers(response);
        setError(null);
        setMessage(null);
        pendingRequest.current = null;
      })
      .catch((loadError) => {
        if (disposed) return;
        setData(null);
        setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!disposed) setResolvedRequestKey(requestKey);
      });

    return () => {
      disposed = true;
    };
  }, [applyOffers, load, requestKey]);

  const isLoading = resolvedRequestKey !== requestKey;
  const visibleError = isLoading ? null : error;
  const visibleMessage = isLoading ? null : message;

  const balance =
    data?.balances.find((entry) => entry.currency === currency)?.balance ?? 0;
  const offerGroups = useMemo(
    () => [
      {
        key: "PRIMARY" as const,
        label: "Uso principal",
        description:
          currency === "INCURSION_TOKEN"
            ? "Componentes dedicados ao reforço de equipamentos."
            : "Recursos ligados a casulos e companheiros.",
        offers:
          data?.offers.filter((offer) => offer.category === "PRIMARY") ?? [],
      },
      {
        key: "EMERGENCY" as const,
        label: "Proteção contra azar",
        description: "Alternativa limitada para completar uma receita.",
        offers:
          data?.offers.filter((offer) => offer.category === "EMERGENCY") ?? [],
      },
    ],
    [currency, data?.offers],
  );

  async function handleExchange(offer: EconomyExchangeOffer) {
    if (balance < offer.cost || exchangingOfferId) return;
    setExchangingOfferId(offer.id);
    setError(null);
    setMessage(null);

    const request =
      pendingRequest.current?.offerId === offer.id
        ? pendingRequest.current
        : { offerId: offer.id, requestId: crypto.randomUUID() };
    pendingRequest.current = request;

    try {
      const response = await exchangeEconomyOffer(
        characterId,
        request.offerId,
        request.requestId,
      );
      pendingRequest.current = null;
      setMessage(response.message);
      applyOffers(await load());
    } catch (exchangeError) {
      setError(getErrorMessage(exchangeError));
    } finally {
      setExchangingOfferId(null);
    }
  }

  if (tier < 1 || tier > 5) return null;

  return (
    <section
      className={`economy-exchange economy-exchange--${currency.toLowerCase()}`}
      aria-label={`Trocas T${tier}`}
    >
      <header className="economy-exchange__header">
        <span className="economy-exchange__currency-icon" aria-hidden="true">
          <Coins size={20} />
        </span>
        <span>
          <small>{data?.balances[0]?.label ?? "Moeda especial"}</small>
          <strong>Ofertas T{tier}</strong>
        </span>
        <span className="economy-exchange__balance">
          <small>Saldo</small>
          <strong>{balance.toLocaleString("pt-BR")}</strong>
        </span>
      </header>

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
                  <div>
                    <strong>{group.label}</strong>
                    <small>{group.description}</small>
                  </div>
                </header>

                <div className="economy-exchange__offers">
                  {group.offers.map((offer) => {
                    const imageUrl = getGatheringMaterialImageUrl(offer.item);
                    const canExchange =
                      balance >= offer.cost && exchangingOfferId === null;
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
                            {offer.quantity}x {offer.item.name}
                          </strong>
                          <span>{offer.purpose}</span>
                        </div>
                        <div className="economy-exchange__offer-cost">
                          <small>Custo</small>
                          <strong>{offer.cost.toLocaleString("pt-BR")}</strong>
                          <span>
                            {getCurrencyCostLabel(
                              offer.currency,
                              offer.cost,
                              offer.currencyLabel,
                            )}
                          </span>
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
                            : balance < offer.cost
                              ? "Saldo insuficiente"
                              : group.key === "EMERGENCY"
                                ? "Usar proteção"
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
          Nenhuma oferta ativa encontrada neste tier.
        </p>
      )}

      <div className="economy-exchange__feedbacks" aria-live="polite">
        {visibleError ? (
          <p className="economy-exchange__feedback is-error">
            <AlertCircle size={15} />
            {visibleError}
          </p>
        ) : null}
        {visibleMessage ? (
          <p className="economy-exchange__feedback is-success">
            <CheckCircle2 size={15} />
            {visibleMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
