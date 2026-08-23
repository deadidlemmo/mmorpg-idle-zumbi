import { isAxiosError } from "axios";
import {
  Check,
  Clock3,
  Eye,
  MailPlus,
  Send,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CharacterPortrait } from "../../cosmetics/components/CharacterPortrait";
import { normalizeClassName } from "../../characters/api/characters.api";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../../dashboard/types/dashboard.types";
import {
  acceptFriendRequest,
  getSocialDashboard,
  removeFriendship,
  sendFriendRequest,
} from "../api/social.api";
import "../styles/social.css";
import type {
  Friendship,
  SocialDashboardResponse,
} from "../types/social.types";

function buildCharacter(
  overview: CharacterOverviewResponse,
): DashboardCharacterViewModel {
  const character = overview.character;
  const className =
    character.class?.name ?? character.gameClass?.name ?? "Lutador";

  return {
    ...character,
    id: character.id,
    name: character.name,
    className,
    classId: character.classId ?? normalizeClassName(className),
    level: character.level ?? 1,
    xp: character.xp ?? 0,
    currentHp: character.currentHp ?? character.maxHp ?? 1,
    maxHp: character.maxHp ?? 1,
    status: character.status ?? "ACTIVE",
  } as DashboardCharacterViewModel;
}

function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] };
    if (Array.isArray(data?.message)) return data.message.join(" ");
    if (data?.message) return data.message;
  }
  return "Não foi possível atualizar seus aliados.";
}

function FriendshipRow({
  friendship,
  kind,
  isBusy,
  onAccept,
  onRemove,
  onInspect,
}: {
  friendship: Friendship;
  kind: "friend" | "incoming" | "outgoing";
  isBusy: boolean;
  onAccept?: () => void;
  onRemove: () => void;
  onInspect?: () => void;
}) {
  const leadCharacter = friendship.user.characters[0];

  return (
    <article className="social-row">
      <CharacterPortrait
        className="social-row__avatar"
        name={leadCharacter?.name ?? friendship.user.email}
        avatarKey={leadCharacter?.avatarKey}
        decorative
      />
      <div className="social-row__identity">
        <strong>{leadCharacter?.name ?? friendship.user.email}</strong>
        <span>
          {leadCharacter
            ? `${leadCharacter.class?.name ?? "Sobrevivente"} · nível ${leadCharacter.level}`
            : "Conta sem personagem ativo"}
        </span>
        {leadCharacter ? <small>{friendship.user.email}</small> : null}
      </div>
      <div className="social-row__state">
        {kind === "friend" ? (
          <span>
            <UserCheck size={14} /> Aliado
          </span>
        ) : kind === "incoming" ? (
          <span>
            <MailPlus size={14} /> Convite recebido
          </span>
        ) : (
          <span>
            <Clock3 size={14} /> Aguardando
          </span>
        )}
      </div>
      <div className="social-row__actions">
        {onInspect ? (
          <button
            className="is-inspect"
            type="button"
            title="Inspecionar personagem"
            aria-label="Inspecionar personagem"
            onClick={onInspect}
          >
            <Eye size={16} />
          </button>
        ) : null}
        {kind === "incoming" && onAccept ? (
          <button
            className="is-primary"
            type="button"
            title="Aceitar pedido"
            aria-label="Aceitar pedido"
            disabled={isBusy}
            onClick={onAccept}
          >
            <Check size={16} />
          </button>
        ) : null}
        <button
          type="button"
          title={kind === "friend" ? "Remover aliado" : "Cancelar pedido"}
          aria-label={kind === "friend" ? "Remover aliado" : "Cancelar pedido"}
          disabled={isBusy}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

export function SocialPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [social, setSocial] = useState<SocialDashboardResponse | null>(null);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!characterId) return;
    const [overviewResponse, socialResponse] = await Promise.all([
      getCharacterOverview(characterId),
      getSocialDashboard(),
    ]);
    setOverview(overviewResponse);
    setSocial(socialResponse);
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
    () => (overview ? buildCharacter(overview) : null),
    [overview],
  );

  if (!characterId) return <Navigate to="/characters" replace />;
  if (isLoading && !character) {
    return <main className="dashboard-loading">Carregando aliados...</main>;
  }
  if (!character || !social) {
    return (
      <main className="dashboard-error">
        {error ?? "Aliados indisponíveis."}
      </main>
    );
  }

  async function execute(id: string, action: () => Promise<unknown>) {
    setActionId(id);
    setError(null);
    setMessage(null);
    try {
      const response = (await action()) as { message?: string };
      setMessage(response.message ?? "Lista de aliados atualizada.");
      await load();
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setActionId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetEmail = email.trim();
    if (!targetEmail) return;
    await execute("send", () => sendFriendRequest(targetEmail));
    setEmail("");
  }

  const sections: Array<{
    key: "incoming" | "friends" | "outgoing";
    title: string;
    items: Friendship[];
    kind: "incoming" | "friend" | "outgoing";
  }> = [
    {
      key: "incoming",
      title: "Pedidos recebidos",
      items: social.incoming,
      kind: "incoming",
    },
    { key: "friends", title: "Aliados", items: social.friends, kind: "friend" },
    {
      key: "outgoing",
      title: "Pedidos enviados",
      items: social.outgoing,
      kind: "outgoing",
    },
  ];

  return (
    <DashboardLayout character={character} hideHero>
      <main className="social-page">
        <header className="social-header">
          <div>
            <span>Rede de sobreviventes</span>
            <h1>Aliados</h1>
            <p>Conexões confirmadas e pedidos pendentes da sua conta.</p>
          </div>
          <strong>
            <Users size={18} /> {social.friends.length} aliados
          </strong>
        </header>

        <form
          className="social-invite"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <MailPlus size={19} />
          <label htmlFor="friend-email">Adicionar por e-mail</label>
          <input
            id="friend-email"
            type="email"
            value={email}
            maxLength={120}
            required
            placeholder="sobrevivente@exemplo.com"
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" disabled={actionId === "send"}>
            <Send size={16} /> {actionId === "send" ? "Enviando" : "Enviar"}
          </button>
        </form>

        {message ? (
          <div className="social-notice is-success">{message}</div>
        ) : null}
        {error ? <div className="social-notice is-error">{error}</div> : null}

        {sections.map((section) => (
          <section className="social-section" key={section.key}>
            <div className="social-section__title">
              <h2>{section.title}</h2>
              <span>{section.items.length}</span>
            </div>
            {section.items.length ? (
              <div className="social-list">
                {section.items.map((friendship) => (
                  <FriendshipRow
                    key={friendship.id}
                    friendship={friendship}
                    kind={section.kind}
                    isBusy={actionId === friendship.id}
                    onAccept={
                      section.kind === "incoming"
                        ? () =>
                            void execute(friendship.id, () =>
                              acceptFriendRequest(friendship.id),
                            )
                        : undefined
                    }
                    onRemove={() =>
                      void execute(friendship.id, () =>
                        removeFriendship(friendship.id),
                      )
                    }
                    onInspect={
                      friendship.user.characters[0]
                        ? () =>
                            navigate(
                              `/dashboard/${characterId}/inspect/${friendship.user.characters[0].id}`,
                            )
                        : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="social-empty">Nenhum registro nesta seção.</p>
            )}
          </section>
        ))}
      </main>
    </DashboardLayout>
  );
}
