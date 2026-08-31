import { useEffect, useState, type CSSProperties } from "react";
import { ChevronRight, RefreshCw, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import { canRunNetworkRefresh } from "../../../utils/networkRefresh";
import { CharacterPortrait } from "../../cosmetics/components/CharacterPortrait";
import {
  getActiveCharacters,
  type ActiveCharactersResponse,
} from "../api/dashboard.api";

const ACTIVE_SURVIVORS_REFRESH_MS = 30_000;

interface ActiveSurvivorsModalProps {
  isOpen: boolean;
  viewerCharacterId: string;
  onClose: () => void;
}

export function ActiveSurvivorsModal({
  isOpen,
  viewerCharacterId,
  onClose,
}: ActiveSurvivorsModalProps) {
  const [response, setResponse] = useState<ActiveCharactersResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function load() {
      setIsLoading(true);

      try {
        const nextResponse = await getActiveCharacters();
        if (!isMounted) return;
        setResponse(nextResponse);
        setError(null);
      } catch {
        if (!isMounted) return;
        setError("Não foi possível carregar os sobreviventes ativos.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    const refreshId = window.setInterval(() => {
      if (canRunNetworkRefresh()) void load();
    }, ACTIVE_SURVIVORS_REFRESH_MS);

    return () => {
      isMounted = false;
      window.clearInterval(refreshId);
    };
  }, [isOpen, reloadKey]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const entries = response?.characters ?? [];

  return (
    <div
      className="active-survivors-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="active-survivors-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-survivors-title"
      >
        <header className="active-survivors-modal__header">
          <span className="active-survivors-modal__mark" aria-hidden="true">
            <Users size={22} />
          </span>
          <div>
            <small>Comunidade do abrigo</small>
            <h2 id="active-survivors-title">Sobreviventes ativos</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X size={19} />
          </button>
        </header>

        <dl className="active-survivors-modal__summary">
          <div>
            <dt>Online agora</dt>
            <dd>{response?.onlineCharacters ?? 0}</dd>
          </div>
          <div>
            <dt>Em atividade</dt>
            <dd>{response?.offlineActivityCharacters ?? 0}</dd>
          </div>
          <div>
            <dt>Total ativo</dt>
            <dd>{response?.activeCharacters ?? 0}</dd>
          </div>
        </dl>

        <div className="active-survivors-modal__list" aria-live="polite">
          {isLoading && entries.length === 0 ? (
            <div className="active-survivors-modal__state">
              <RefreshCw className="is-spinning" size={22} />
              <span>Atualizando presença...</span>
            </div>
          ) : error && entries.length === 0 ? (
            <div className="active-survivors-modal__state is-error">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => {
                  setResponse(null);
                  setError(null);
                  setReloadKey((current) => current + 1);
                }}
              >
                Tentar novamente
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="active-survivors-modal__state">
              Nenhum sobrevivente ativo agora.
            </div>
          ) : (
            entries.map((entry) => {
              const character = entry.character;
              const isCurrent = character.id === viewerCharacterId;
              const style = {
                "--active-survivor-accent":
                  entry.appearance?.accentColor ?? "#86b85c",
              } as CSSProperties;
              const presenceLabel =
                entry.presence.activity?.label ??
                (entry.presence.online ? "Online" : "Em atividade");
              const presenceState = entry.presence.activity
                ? "activity"
                : entry.presence.status.toLowerCase();

              return (
                <Link
                  key={character.id}
                  className="active-survivors-modal__row"
                  style={style}
                  to={`/dashboard/${viewerCharacterId}/inspect/${character.id}`}
                  onClick={onClose}
                  aria-label={`Inspecionar ${character.name}`}
                >
                  <CharacterPortrait
                    className="active-survivors-modal__avatar"
                    name={character.name}
                    avatarKey={character.avatarKey}
                    appearance={entry.appearance}
                    decorative
                  />
                  <span className="active-survivors-modal__identity">
                    <span>
                      <strong>{character.name}</strong>
                      {isCurrent ? <em>Você</em> : null}
                    </span>
                    <small>
                      {character.class?.name ?? "Sobrevivente"}
                      {character.map ? ` · ${character.map.name}` : ""}
                    </small>
                  </span>
                  <span className="active-survivors-modal__level">
                    <small>Nível</small>
                    <strong>{character.level}</strong>
                  </span>
                  <span
                    className={`active-survivors-modal__presence is-${presenceState}`}
                    title={presenceLabel}
                  >
                    <i aria-hidden="true" />
                    {presenceLabel}
                  </span>
                  <ChevronRight
                    className="active-survivors-modal__chevron"
                    size={18}
                    aria-hidden="true"
                  />
                </Link>
              );
            })
          )}
        </div>

        {response?.updatedAt ? (
          <footer>
            Atualizado às{" "}
            {new Date(response.updatedAt).toLocaleTimeString("pt-BR")}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
