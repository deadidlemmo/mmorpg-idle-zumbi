import {
  ChevronDown,
  LoaderCircle,
  MessageCircle,
  Send,
  Users,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { getAvatarImage } from "../../characters/constants/avatar-options";
import { getCharacterInitials } from "../../characters/types/character.types";
import { listGeneralChatMessages } from "../api/chat.api";
import {
  createGeneralChatSocket,
  type GeneralChatSocket,
} from "../realtime/chatSocket";
import type { GeneralChatMessage } from "../types/chat.types";
import { mergeChatMessages } from "../utils/chatMessages";
import "../styles/chat.css";

const CHAT_MESSAGE_MAX_LENGTH = 300;

type ConnectionState = "connecting" | "connected" | "disconnected";

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function GeneralChatDock({ characterId }: { characterId: string }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<GeneralChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const socketRef = useRef<GeneralChatSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const isOpenRef = useRef(false);
  const shouldScrollToEndRef = useRef(true);

  const loadLatestMessages = useCallback(async () => {
    try {
      const response = await listGeneralChatMessages({ limit: 50 });
      setMessages((current) =>
        mergeChatMessages(current, response.messages),
      );
      setNextCursor(response.nextCursor);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Não foi possível carregar o histórico do chat.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    queueMicrotask(() => {
      if (!isCancelled) void loadLatestMessages();
    });

    return () => {
      isCancelled = true;
    };
  }, [loadLatestMessages]);

  useEffect(() => {
    const socket = createGeneralChatSocket(characterId);
    socketRef.current = socket;

    const handleConnect = () => {
      setConnectionState("connected");
      setErrorMessage(null);
      socket.emit("chat:join", { characterId });
      void loadLatestMessages();
    };
    const handleDisconnect = () => setConnectionState("disconnected");
    const handleConnectError = () => {
      setConnectionState("disconnected");
      setErrorMessage("Chat desconectado. Tentando reconectar...");
    };
    const handleError = (error: { message: string }) => {
      setErrorMessage(error.message);
    };
    const handleMessage = (message: GeneralChatMessage) => {
      shouldScrollToEndRef.current = isOpenRef.current;
      setMessages((current) => mergeChatMessages(current, [message]));

      if (!isOpenRef.current && message.character.id !== characterId) {
        setUnreadCount((current) => Math.min(99, current + 1));
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("chat:error", handleError);
    socket.on("chat:message:new", handleMessage);
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [characterId, loadLatestMessages]);

  useEffect(() => {
    if (!isOpen || !shouldScrollToEndRef.current || !listRef.current) return;

    const frameId = window.requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
      shouldScrollToEndRef.current = false;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen, messages]);

  async function loadOlderMessages() {
    if (!nextCursor || isLoadingOlder || !listRef.current) return;

    const list = listRef.current;
    const previousHeight = list.scrollHeight;
    setIsLoadingOlder(true);
    setErrorMessage(null);

    try {
      const response = await listGeneralChatMessages({
        before: nextCursor,
        limit: 50,
      });
      shouldScrollToEndRef.current = false;
      setMessages((current) =>
        mergeChatMessages(current, response.messages),
      );
      setNextCursor(response.nextCursor);
      window.requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight - previousHeight;
        }
      });
    } catch {
      setErrorMessage("Não foi possível carregar mensagens anteriores.");
    } finally {
      setIsLoadingOlder(false);
    }
  }

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    const socket = socketRef.current;

    if (!content || !socket?.connected || isSending) return;

    setIsSending(true);
    setErrorMessage(null);

    socket.timeout(8_000).emit(
      "chat:message:send",
      { characterId, content },
      (timeoutError, response) => {
        setIsSending(false);

        if (timeoutError) {
          setErrorMessage("O envio demorou demais. Tente novamente.");
          return;
        }

        if (!response?.ok) {
          setErrorMessage(response?.error ?? "Não foi possível enviar.");
          return;
        }

        setDraft("");
        shouldScrollToEndRef.current = true;
        setMessages((current) =>
          mergeChatMessages(current, [response.message]),
        );
      },
    );
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function openChat() {
    isOpenRef.current = true;
    shouldScrollToEndRef.current = true;
    setUnreadCount(0);
    setIsOpen(true);
  }

  function closeChat() {
    isOpenRef.current = false;
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        className="general-chat-launcher"
        aria-label="Abrir chat geral"
        title="Chat geral"
        onClick={openChat}
      >
        <MessageCircle size={22} />
        {unreadCount > 0 ? (
          <span aria-label={`${unreadCount} mensagens não lidas`}>
            {unreadCount}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <section className="general-chat" aria-label="Chat geral">
      <header className="general-chat__header">
        <div>
          <Users size={18} aria-hidden="true" />
          <span>
            <strong>Chat geral</strong>
            <small className={`is-${connectionState}`}>
              {connectionState === "connected"
                ? "Conectado"
                : connectionState === "connecting"
                  ? "Conectando"
                  : "Reconectando"}
            </small>
          </span>
        </div>
        <button
          type="button"
          aria-label="Minimizar chat"
          title="Minimizar"
          onClick={closeChat}
        >
          <ChevronDown size={19} />
        </button>
      </header>

      <div className="general-chat__messages" ref={listRef} aria-live="polite">
        {nextCursor ? (
          <button
            type="button"
            className="general-chat__older"
            disabled={isLoadingOlder}
            onClick={() => void loadOlderMessages()}
          >
            {isLoadingOlder ? <LoaderCircle size={14} /> : null}
            Mensagens anteriores
          </button>
        ) : null}

        {isLoading && messages.length === 0 ? (
          <div className="general-chat__empty">
            <LoaderCircle size={20} />
            <span>Carregando mensagens...</span>
          </div>
        ) : null}

        {!isLoading && messages.length === 0 ? (
          <div className="general-chat__empty">
            <MessageCircle size={22} />
            <span>Nenhuma mensagem no canal geral.</span>
          </div>
        ) : null}

        {messages.map((message) => {
          const isOwnMessage = message.character.id === characterId;
          const avatarImage = getAvatarImage(message.character.avatarKey);

          return (
            <article
              key={message.id}
              className={isOwnMessage ? "is-own" : undefined}
            >
              <div className="general-chat__avatar" aria-hidden="true">
                {avatarImage ? (
                  <img src={avatarImage} alt="" />
                ) : (
                  <span>{getCharacterInitials(message.character.name)}</span>
                )}
              </div>
              <div>
                <header>
                  <button
                    type="button"
                    className="general-chat__character-link"
                    title={`Inspecionar ${message.character.name}`}
                    onClick={() =>
                      navigate(
                        `/dashboard/${characterId}/inspect/${message.character.id}`,
                      )
                    }
                  >
                    {message.character.name}
                  </button>
                  <span>
                    {message.character.className} · Nv. {message.character.level}
                  </span>
                  <time dateTime={message.createdAt}>
                    {formatMessageTime(message.createdAt)}
                  </time>
                </header>
                <p>{message.content}</p>
              </div>
            </article>
          );
        })}
      </div>

      {errorMessage ? (
        <div className="general-chat__error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <form className="general-chat__composer" onSubmit={sendMessage}>
        <textarea
          value={draft}
          rows={2}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          placeholder="Escreva uma mensagem"
          aria-label="Mensagem para o chat geral"
          disabled={connectionState !== "connected" || isSending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
        />
        <div>
          <span>
            {draft.length}/{CHAT_MESSAGE_MAX_LENGTH}
          </span>
          <button
            type="submit"
            aria-label="Enviar mensagem"
            title="Enviar"
            disabled={
              !draft.trim() ||
              isSending ||
              connectionState !== "connected"
            }
          >
            {isSending ? <LoaderCircle size={17} /> : <Send size={17} />}
          </button>
        </div>
      </form>
    </section>
  );
}
