import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleStop,
  Crown,
  FlaskConical,
  HeartPulse,
  Maximize2,
  Minimize2,
  PackageOpen,
  Radar,
  Skull,
  Swords,
} from "lucide-react";
import suburbioInfected from "../../../assets/images/auto-combat/suburbio-silencioso-t1-infected-gba.png";
import erranteAttack from "../../../assets/images/auto-combat/mobs/errante-suburbio-v1/errante-attack.png";
import erranteDeath from "../../../assets/images/auto-combat/mobs/errante-suburbio-v1/errante-death.png";
import erranteHurt from "../../../assets/images/auto-combat/mobs/errante-suburbio-v1/errante-hurt.png";
import erranteWalk from "../../../assets/images/auto-combat/mobs/errante-suburbio-v1/errante-walk.png";
import gatoAttack from "../../../assets/images/auto-combat/mobs/gato-telhado-v1/gato-attack.png";
import gatoDeath from "../../../assets/images/auto-combat/mobs/gato-telhado-v1/gato-death.png";
import gatoHurt from "../../../assets/images/auto-combat/mobs/gato-telhado-v1/gato-hurt.png";
import gatoWalk from "../../../assets/images/auto-combat/mobs/gato-telhado-v1/gato-walk.png";
import morcegoAttack from "../../../assets/images/auto-combat/mobs/morcego-caixa-dagua-v1/morcego-attack.png";
import morcegoDeath from "../../../assets/images/auto-combat/mobs/morcego-caixa-dagua-v1/morcego-death.png";
import morcegoHurt from "../../../assets/images/auto-combat/mobs/morcego-caixa-dagua-v1/morcego-hurt.png";
import morcegoWalk from "../../../assets/images/auto-combat/mobs/morcego-caixa-dagua-v1/morcego-walk.png";
import porteiroAttack from "../../../assets/images/auto-combat/mobs/porteiro-infectado-v1/porteiro-attack.png";
import porteiroDeath from "../../../assets/images/auto-combat/mobs/porteiro-infectado-v1/porteiro-death.png";
import porteiroHurt from "../../../assets/images/auto-combat/mobs/porteiro-infectado-v1/porteiro-hurt.png";
import porteiroWalk from "../../../assets/images/auto-combat/mobs/porteiro-infectado-v1/porteiro-walk.png";
import rastejanteAttack from "../../../assets/images/auto-combat/mobs/rastejante-garagem-v1/rastejante-attack.png";
import rastejanteDeath from "../../../assets/images/auto-combat/mobs/rastejante-garagem-v1/rastejante-death.png";
import rastejanteHurt from "../../../assets/images/auto-combat/mobs/rastejante-garagem-v1/rastejante-hurt.png";
import rastejanteWalk from "../../../assets/images/auto-combat/mobs/rastejante-garagem-v1/rastejante-walk.png";
import sindicoAttack from "../../../assets/images/auto-combat/mobs/sindico-devorado-v1/sindico-attack.png";
import sindicoDeath from "../../../assets/images/auto-combat/mobs/sindico-devorado-v1/sindico-death.png";
import sindicoHurt from "../../../assets/images/auto-combat/mobs/sindico-devorado-v1/sindico-hurt.png";
import sindicoWalk from "../../../assets/images/auto-combat/mobs/sindico-devorado-v1/sindico-walk.png";
import leonAttack from "../../../assets/images/auto-combat/characters/leon-v1/leon-attack.png";
import leonDeath from "../../../assets/images/auto-combat/characters/leon-v1/leon-death.png";
import leonHurt from "../../../assets/images/auto-combat/characters/leon-v1/leon-hurt.png";
import leonInvestigate from "../../../assets/images/auto-combat/characters/leon-v1/leon-investigate.png";
import leonWalk from "../../../assets/images/auto-combat/characters/leon-v1/leon-walk.png";
import suburbioPilotEnvironment from "../../../assets/images/auto-combat/pilot/suburbio-pilot-environment.png";
import suburbioPilotHouseOne from "../../../assets/images/auto-combat/pilot/suburbio-pilot-house-one.png";
import suburbioPilotHouseTwo from "../../../assets/images/auto-combat/pilot/suburbio-pilot-house-two.png";
import suburbioPilotProps from "../../../assets/images/auto-combat/pilot/suburbio-pilot-props.png";
import suburbioPilotTerrain from "../../../assets/images/auto-combat/pilot/suburbio-pilot-terrain.png";
import suburbioInteriorPropsAtlasUrl from "../../../assets/images/auto-combat/interior/suburbio-interior-props.json?url";
import suburbioInteriorProps from "../../../assets/images/auto-combat/interior/suburbio-interior-props.png";
import suburbioInteriorTerrain from "../../../assets/images/auto-combat/interior/suburbio-interior-terrain.png";
import suburbioInteriorWalls from "../../../assets/images/auto-combat/interior/suburbio-interior-walls.png";
import suburbioExteriorTilemapRaw from "../../../assets/maps/auto-combat/suburbio-silencioso-pilot.tmj?raw";
import suburbioExteriorTilemapUrl from "../../../assets/maps/auto-combat/suburbio-silencioso-pilot.tmj?url";
import suburbioInteriorTilemapRaw from "../../../assets/maps/auto-combat/suburbio-silencioso-t1-interior.tmj?raw";
import suburbioInteriorTilemapUrl from "../../../assets/maps/auto-combat/suburbio-silencioso-t1-interior.tmj?url";
import { getAutoCombatSocket, type HuntingVisualPose, type HuntingVisualPresence } from "../../../services/websocket/socketClient";
import { playGameSound } from "../../../services/audio/gameAudio";
import { CharacterPortrait } from "../../cosmetics/components/CharacterPortrait";
import type { ResolvedCharacterAppearance } from "../../cosmetics/types/cosmetics.types";
import { useLootNotifications } from "../../loot-notifications/lootNotificationContext";
import { getAutoCombatHuntingVisualPeers, getAutoCombatHuntingVisualPosition } from "../api/auto-combat.api";
import type { HuntingActivityQueueEntry } from "../../dashboard/utils/huntingActivityPresentation";
import { getMobPortraitImage } from "../utils/mobAssets";
import {
  getPerformanceDiagnostics,
  getPerformanceExperiment,
} from "../../performance/performanceDiagnostics";
import { mergeHuntingVisualPlayers } from "../utils/hunting-presence";
import { resolveHuntingXpFeedback, type HuntingXpBaseline } from "../utils/hunting-xp-feedback";
import type { HuntingTiledMapSource } from "../utils/hunting-scene";
import {
  getHuntingVisualPhaseLabel,
  type HuntingVisualPhase,
} from "../utils/hunting-visual-state";
import type {
  HuntingVisualPlayer,
  LocalHuntingPose,
  MobCombatSpriteAssets,
  SuburbioHuntingController,
  SuburbioHuntingState,
} from "./phaser/createSuburbioHuntingGame";

const DEFAULT_AREA_LABEL = "Subúrbio Silencioso · Distrito aberto";
const SUBURBIO_EXTERIOR_TILEMAP = JSON.parse(
  suburbioExteriorTilemapRaw,
) as HuntingTiledMapSource;
const SUBURBIO_INTERIOR_TILEMAP = JSON.parse(
  suburbioInteriorTilemapRaw,
) as HuntingTiledMapSource;

const SUBURBIO_MOB_SPRITES: readonly MobCombatSpriteAssets[] = [
  {
    key: "errante",
    mobNameKey: "errante-do-suburbio",
    attack: erranteAttack,
    death: erranteDeath,
    hurt: erranteHurt,
    walk: erranteWalk,
  },
  {
    key: "gato",
    mobNameKey: "gato-de-telhado-contaminado",
    attack: gatoAttack,
    death: gatoDeath,
    hurt: gatoHurt,
    walk: gatoWalk,
  },
  {
    key: "rastejante",
    mobNameKey: "rastejante-de-garagem",
    attack: rastejanteAttack,
    death: rastejanteDeath,
    hurt: rastejanteHurt,
    walk: rastejanteWalk,
  },
  {
    key: "morcego",
    mobNameKey: "morcego-de-caixa-d-agua",
    attack: morcegoAttack,
    death: morcegoDeath,
    hurt: morcegoHurt,
    walk: morcegoWalk,
  },
  {
    key: "porteiro",
    mobNameKey: "porteiro-infectado",
    attack: porteiroAttack,
    death: porteiroDeath,
    hurt: porteiroHurt,
    walk: porteiroWalk,
  },
  {
    key: "sindico",
    mobNameKey: "sindico-devorado",
    attack: sindicoAttack,
    death: sindicoDeath,
    hurt: sindicoHurt,
    walk: sindicoWalk,
  },
];

export type AutoCombatHuntingLootEntry = Readonly<{
  key: string;
  itemName: string;
  quantity: number;
  imageUrl: string | null;
  rarity: string | null;
}>;

type AutoCombatHuntingSceneProps = {
  characterId: string;
  characterName: string;
  characterClassName: string;
  characterAvatarKey?: string | null;
  characterAvatarUrl?: string | null;
  characterAppearance?: ResolvedCharacterAppearance | null;
  currentMapId: string | null;
  isProcessing: boolean;
  isThreatReady: boolean;
  isCombatActive: boolean;
  isSynchronizing: boolean;
  combatEventKey?: string | null;
  combatEventType?: string | null;
  battleCycleKey?: string | null;
  battleDurationMs: number;
  battleProgressPercent: number;
  playerCurrentHp: number;
  playerMaxHp: number;
  mobCurrentHp: number;
  mobMaxHp: number;
  mobName?: string | null;
  mobPortraitUrl?: string | null;
  progressPercent: number;
  defeatedMobs: readonly HuntingActivityQueueEntry[];
  sessionLoot: readonly AutoCombatHuntingLootEntry[];
  huntingXpGained: number;
  huntSessionKey: string;
  autoOpenKey?: number;
  characterLevel: number;
  characterXpGained: number;
  characterXpSessionKey: string;
  characterXpLabel: string;
  characterXpProgressPercent: number;
  huntingCountdownLabel: string;
  isPremiumActive: boolean;
  potionImageUrl?: string | null;
  potionName?: string | null;
  potionQuantity: number;
  potionConfigDisabled?: boolean;
  canStartBattle?: boolean;
  canStopHunt?: boolean;
  isBattleActionLoading?: boolean;
  onConfigurePotion: () => void;
  onStartBattle: () => void;
  onRequestStopHunt: () => void;
};

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(query.matches);
    updatePreference();
    query.addEventListener("change", updatePreference);
    return () => query.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

export function AutoCombatHuntingScene({
  characterId,
  characterName,
  characterClassName,
  characterAvatarKey,
  characterAvatarUrl,
  characterAppearance,
  currentMapId,
  isProcessing,
  isThreatReady,
  isCombatActive,
  isSynchronizing,
  combatEventKey,
  combatEventType,
  battleCycleKey,
  battleDurationMs,
  battleProgressPercent,
  playerCurrentHp,
  playerMaxHp,
  mobCurrentHp,
  mobMaxHp,
  mobName,
  mobPortraitUrl,
  progressPercent,
  defeatedMobs,
  sessionLoot,
  huntingXpGained,
  huntSessionKey,
  autoOpenKey = 0,
  characterLevel,
  characterXpGained,
  characterXpSessionKey,
  characterXpLabel,
  characterXpProgressPercent,
  huntingCountdownLabel,
  isPremiumActive,
  potionImageUrl,
  potionName,
  potionQuantity,
  potionConfigDisabled,
  canStartBattle,
  canStopHunt,
  isBattleActionLoading,
  onConfigurePotion,
  onStartBattle,
  onRequestStopHunt,
}: AutoCombatHuntingSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const lootHudRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SuburbioHuntingController | null>(null);
  const [engineStatus, setEngineStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [areaLabel, setAreaLabel] = useState(DEFAULT_AREA_LABEL);
  const [visualPhase, setVisualPhase] =
    useState<HuntingVisualPhase>("walking");
  const [isImmersive, setIsImmersive] = useState(autoOpenKey > 0);
  const [isCompact, setIsCompact] = useState(false);
  const [isDefeatedPanelCollapsed, setIsDefeatedPanelCollapsed] =
    useState(false);
  const [isLootPanelCollapsed, setIsLootPanelCollapsed] = useState(false);
  const [livePlayers, setLivePlayers] = useState<readonly HuntingVisualPresence[]>([]);
  const [restPlayers, setRestPlayers] = useState<readonly HuntingVisualPresence[]>([]);
  const xpBaselineRef = useRef<HuntingXpBaseline | null>(null);
  const characterXpBaselineRef = useRef<HuntingXpBaseline | null>(null);
  const handledAutoOpenKeyRef = useRef(autoOpenKey);
  const localPoseRef = useRef<LocalHuntingPose | null>(null);
  const currentMapIdRef = useRef(currentMapId);
  const joinedVisualAreaRef = useRef<string | null>(null);
  const lastJoinAttemptRef = useRef(0);
  const sendVisualPoseRef = useRef<(pose: LocalHuntingPose) => void>(() => {});
  const prefersReducedMotion = usePrefersReducedMotion();
  const performanceDiagnostics = getPerformanceDiagnostics();
  const performanceExperiment = getPerformanceExperiment();
  const { setAutoCombatHudTarget } = useLootNotifications();

  useEffect(() => {
    setAutoCombatHudTarget(lootHudRef.current);
    return () => setAutoCombatHudTarget(null);
  }, [setAutoCombatHudTarget]);

  useLayoutEffect(() => {
    performanceDiagnostics?.recordReactCommit("React cena", performance.now());
  });

  useEffect(() => {
    if (autoOpenKey <= 0 || handledAutoOpenKeyRef.current === autoOpenKey) {
      return;
    }
    handledAutoOpenKeyRef.current = autoOpenKey;
    setIsImmersive(true);
  }, [autoOpenKey]);

  useEffect(() => {
    if (isSynchronizing) {
      xpBaselineRef.current = {
        sessionKey: huntSessionKey,
        amount: Math.max(0, Math.floor(huntingXpGained)),
      };
      return;
    }
    const previousSessionKey = xpBaselineRef.current?.sessionKey;
    const feedback = resolveHuntingXpFeedback(
      xpBaselineRef.current,
      huntSessionKey,
      huntingXpGained,
    );
    xpBaselineRef.current = feedback.baseline;
    if (previousSessionKey !== huntSessionKey) return;
    if (feedback.gain <= 0) return;
    controllerRef.current?.showXpGain({
      amount: feedback.gain,
      kind: "hunting",
    });
    const diagnostics = performanceDiagnostics;
    const audioStartedAt = diagnostics ? performance.now() : 0;
    playGameSound("xp");
    diagnostics?.recordVisualStage("Audio XP", performance.now() - audioStartedAt, performance.now());
  }, [huntSessionKey, huntingXpGained, isSynchronizing, performanceDiagnostics]);

  useEffect(() => {
    if (isSynchronizing) {
      characterXpBaselineRef.current = {
        sessionKey: characterXpSessionKey,
        amount: Math.max(0, Math.floor(characterXpGained)),
      };
      return;
    }
    const feedback = resolveHuntingXpFeedback(
      characterXpBaselineRef.current,
      characterXpSessionKey,
      characterXpGained,
    );
    const previousSessionKey = characterXpBaselineRef.current?.sessionKey;
    characterXpBaselineRef.current = feedback.baseline;
    if (previousSessionKey !== characterXpSessionKey) return;
    if (feedback.gain <= 0) return;

    controllerRef.current?.showXpGain({
      amount: feedback.gain,
      kind: "character",
    });
    playGameSound("xp");
  }, [characterXpGained, characterXpSessionKey, isSynchronizing]);

  useEffect(() => {
    currentMapIdRef.current = currentMapId;
  }, [currentMapId]);

  useEffect(() => {
    const socket = getAutoCombatSocket();
    const sendJoin = () => {
      const pose = localPoseRef.current;
      if (!pose || !socket.connected || joinedVisualAreaRef.current === pose.areaId ||
        Date.now() - lastJoinAttemptRef.current < 1500) return;
      lastJoinAttemptRef.current = Date.now();
      socket.emit("auto-combat:visual:join", { ...pose, characterId });
    };
    const handleJoined = (joined: { characterId: string }) => {
      if (joined.characterId === characterId) sendJoin();
    };
    const handleSnapshot = ({ areaId, players }: { areaId: HuntingVisualPose["areaId"]; players: HuntingVisualPresence[] }) => {
      if (localPoseRef.current?.areaId !== areaId) return;
      joinedVisualAreaRef.current = areaId;
      setLivePlayers(players.filter((player) => player.characterId !== characterId)
        .map((player) => ({ ...player, updatedAt: Date.now() })));
    };
    const handlePose = (player: HuntingVisualPresence) => {
      if (player.characterId === characterId || player.areaId !== localPoseRef.current?.areaId) return;
      setLivePlayers((current) => [
        ...current.filter((entry) => entry.characterId !== player.characterId),
        { ...player, updatedAt: Date.now() },
      ]);
    };
    const handleLeft = ({ characterId: leftId }: { characterId: string }) => {
      setLivePlayers((current) => current.filter((player) => player.characterId !== leftId));
    };
    const handleDisconnect = () => {
      joinedVisualAreaRef.current = null;
      lastJoinAttemptRef.current = 0;
      setLivePlayers([]);
    };
    sendVisualPoseRef.current = (pose) => {
      if (joinedVisualAreaRef.current !== pose.areaId) {
        sendJoin();
      } else if (socket.connected) {
        socket.emit("auto-combat:visual:pose", { ...pose, characterId });
      }
    };
    socket.on("auto-combat:joined", handleJoined);
    socket.on("auto-combat:visual:snapshot", handleSnapshot);
    socket.on("auto-combat:visual:pose", handlePose);
    socket.on("auto-combat:visual:left", handleLeft);
    socket.on("disconnect", handleDisconnect);
    const retry = window.setInterval(sendJoin, 2500);
    const pruneStale = window.setInterval(() => {
      const cutoff = Date.now() - 12_000;
      setLivePlayers((current) => {
        const fresh = current.filter((player) => player.updatedAt >= cutoff);
        return fresh.length === current.length ? current : fresh;
      });
    }, 3000);
    sendJoin();
    return () => {
      socket.emit("auto-combat:visual:leave");
      socket.off("auto-combat:joined", handleJoined);
      socket.off("auto-combat:visual:snapshot", handleSnapshot);
      socket.off("auto-combat:visual:pose", handlePose);
      socket.off("auto-combat:visual:left", handleLeft);
      socket.off("disconnect", handleDisconnect);
      window.clearInterval(retry);
      window.clearInterval(pruneStale);
      joinedVisualAreaRef.current = null;
      sendVisualPoseRef.current = () => {};
    };
  }, [characterId, currentMapId]);

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await getAutoCombatHuntingVisualPeers(characterId);
        if (disposed) return;
        if (currentMapId && response.mapId !== currentMapId) {
          setRestPlayers([]);
          return;
        }
        setRestPlayers(response.players.map((player) => ({
          ...player,
          mapId: response.mapId ?? "",
          subMapId: response.subMapId,
          updatedAt: 0,
        })));
      } catch {
        if (!disposed) setRestPlayers([]);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [characterId, currentMapId]);

  const otherPlayers = useMemo<readonly HuntingVisualPlayer[]>(() => {
    return mergeHuntingVisualPlayers(restPlayers, livePlayers);
  }, [livePlayers, restPlayers]);
  const sceneState = useMemo<SuburbioHuntingState>(
    () => ({
      characterName,
      battleCycleKey,
      battleDurationMs,
      battleProgressPercent,
      combatEventKey,
      combatEventType,
      isCombatActive,
      isImmersive,
      isSynchronizing,
      isThreatReady,
      mobCurrentHp,
      mobMaxHp,
      mobName,
      mobPortraitUrl,
      playerCurrentHp,
      playerMaxHp,
      progressPercent,
      prefersReducedMotion,
      otherPlayers,
    }),
    [
      characterName,
      battleCycleKey,
      battleDurationMs,
      battleProgressPercent,
      combatEventKey,
      combatEventType,
      isCombatActive,
      isImmersive,
      isSynchronizing,
      isThreatReady,
      mobCurrentHp,
      mobMaxHp,
      mobName,
      mobPortraitUrl,
      otherPlayers,
      playerCurrentHp,
      playerMaxHp,
      prefersReducedMotion,
      progressPercent,
    ],
  );
  const latestStateRef = useRef(sceneState);
  const isSynchronizingRef = useRef(isSynchronizing);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let previousPhase: HuntingVisualPhase | null = null;
    setEngineStatus("loading");

    void getAutoCombatHuntingVisualPosition(characterId)
      .catch(() => null)
      .then(async (savedPosition) => {
        const { createSuburbioHuntingGame } = await import("./phaser/createSuburbioHuntingGame");
        if (disposed) return;
        const controller = createSuburbioHuntingGame({
          parent: host,
          assets: {
            interiorProps: {
              atlasUrl: suburbioInteriorPropsAtlasUrl,
              texture: suburbioInteriorProps,
            },
            interiorTilesets: {
              terrain: suburbioInteriorTerrain,
              walls: suburbioInteriorWalls,
            },
            outdoorTilesets: {
              environment: suburbioPilotEnvironment,
              houseOne: suburbioPilotHouseOne,
              houseTwo: suburbioPilotHouseTwo,
              props: suburbioPilotProps,
              terrain: suburbioPilotTerrain,
            },
            outdoorTilemapUrl: suburbioExteriorTilemapUrl,
            outdoorTilemapSource: SUBURBIO_EXTERIOR_TILEMAP,
            interiorTilemapUrl: suburbioInteriorTilemapUrl,
            interiorTilemapSource: SUBURBIO_INTERIOR_TILEMAP,
            survivor: leonWalk,
            survivorAttack: leonAttack,
            survivorDeath: leonDeath,
            survivorHurt: leonHurt,
            survivorInvestigate: leonInvestigate,
            infected: suburbioInfected,
            mobs: SUBURBIO_MOB_SPRITES,
          },
          initialState: latestStateRef.current,
          initialPose: savedPosition && (!currentMapIdRef.current || savedPosition.mapId === currentMapIdRef.current)
            ? savedPosition.pose
            : null,
          onReady: () => {
            if (!disposed) setEngineStatus("ready");
          },
          onAreaChange: (nextAreaLabel) => {
            if (!disposed) setAreaLabel(nextAreaLabel);
          },
          onVisualPhaseChange: (nextPhase) => {
            if (disposed) return;
            if (
              previousPhase !== null &&
              previousPhase !== "approaching" &&
              previousPhase !== "investigating" &&
              (nextPhase === "approaching" || nextPhase === "investigating")
            ) {
              playGameSound("foraging");
            }
            previousPhase = nextPhase;
            setVisualPhase(nextPhase);
          },
          onPoseChange: (pose) => {
            if (disposed) return;
            if (localPoseRef.current?.areaId !== pose.areaId) {
              joinedVisualAreaRef.current = null;
              lastJoinAttemptRef.current = 0;
              setLivePlayers([]);
            }
            localPoseRef.current = pose;
            sendVisualPoseRef.current(pose);
          },
        });
        controllerRef.current = controller;
        if (isSynchronizingRef.current) {
          controller.beginSnapshotSynchronization();
        } else {
          controller.update(latestStateRef.current);
        }
      })
      .catch(() => {
        if (!disposed) setEngineStatus("error");
      });

    return () => {
      disposed = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
      host.replaceChildren();
    };
  }, [characterId]);

  useEffect(() => {
    latestStateRef.current = sceneState;
    const wasSynchronizing = isSynchronizingRef.current;
    isSynchronizingRef.current = isSynchronizing;
    const diagnostics = performanceDiagnostics;
    const updateStartedAt = diagnostics ? performance.now() : 0;
    if (isSynchronizing) {
      if (!wasSynchronizing) {
        controllerRef.current?.beginSnapshotSynchronization();
      }
    } else if (wasSynchronizing) {
      controllerRef.current?.applySnapshot(sceneState);
    } else {
      controllerRef.current?.update(sceneState);
    }
    diagnostics?.recordVisualStage("Enviar a Phaser", performance.now() - updateStartedAt, performance.now());
  }, [sceneState, isSynchronizing, performanceDiagnostics]);

  useEffect(() => {
    let layoutFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      layoutFrame = window.requestAnimationFrame(() => {
        controllerRef.current?.resize();
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(layoutFrame);
    };
  }, [isImmersive]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new ResizeObserver(() => {
      setIsCompact(host.clientWidth < 1100);
      controllerRef.current?.resize();
    });
    observer.observe(host);
    setIsCompact(host.clientWidth < 1100);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isImmersive) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsImmersive(false);
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isImmersive]);

  const stateClassName = isCombatActive
    ? "combat"
    : isThreatReady
    ? "ready"
    : isProcessing
      ? "processing"
      : "tracking";
  const statusLabel = isCombatActive
    ? `Combatendo ${mobName ?? "ameaça"}`
    : isThreatReady
    ? (mobName ?? "Ameaça localizada")
    : getHuntingVisualPhaseLabel(visualPhase);
  const defeatedTotal = defeatedMobs.reduce(
    (total, mob) => total + mob.count,
    0,
  );
  const lootTotal = sessionLoot.reduce(
    (total, loot) => total + loot.quantity,
    0,
  );
  const playerHpPercent =
    playerMaxHp > 0
      ? Math.max(0, Math.min(100, (playerCurrentHp / playerMaxHp) * 100))
      : 0;

  return (
    <section
      className={`auto-combat-hunting-scene auto-combat-hunting-scene--${stateClassName} auto-combat-hunting-scene--phase-${visualPhase}${isImmersive ? " auto-combat-hunting-scene--immersive" : ""}${isCompact ? " auto-combat-hunting-scene--compact" : ""}${performanceDiagnostics && !performanceExperiment.noticeEffects ? " auto-combat-hunting-scene--perf-no-notice-fx" : ""}${performanceDiagnostics && performanceExperiment.mapMode === "hidden" ? " auto-combat-hunting-scene--perf-canvas-hidden" : ""}`}
      aria-label="Rastreio no Subúrbio Silencioso"
      aria-busy={engineStatus === "loading"}
    >
      <div
        ref={hostRef}
        className="auto-combat-hunting-scene__viewport"
        aria-hidden="true"
      />

      <button
        type="button"
        className="auto-combat-hunting-scene__view-toggle"
        onClick={() => setIsImmersive((current) => !current)}
        aria-expanded={isImmersive}
        aria-label={
          isImmersive ? "Sair do modo imersivo" : "Abrir mapa em modo imersivo"
        }
        title={
          isImmersive ? "Sair do modo imersivo" : "Abrir mapa em modo imersivo"
        }
      >
        {isImmersive ? (
          <Minimize2 aria-hidden="true" />
        ) : (
          <Maximize2 aria-hidden="true" />
        )}
      </button>

      {engineStatus !== "ready" ? (
        <div
          className={`auto-combat-hunting-scene__engine-state auto-combat-hunting-scene__engine-state--${engineStatus}`}
          role={engineStatus === "error" ? "alert" : "status"}
        >
          {engineStatus === "error"
            ? "Não foi possível carregar a área."
            : "Carregando área..."}
        </div>
      ) : null}

      <div className="auto-combat-hunting-scene__hud" aria-live="polite">
        <span>{areaLabel}</span>
        <strong>{statusLabel}</strong>
      </div>

      <div
        ref={lootHudRef}
        className="auto-combat-hunting-scene__loot-feed"
        aria-live="polite"
        aria-atomic="true"
      />

      <div className="auto-combat-hunting-scene__session-panels">
        <aside
          className={`auto-combat-hunting-scene__session-panel auto-combat-hunting-scene__tracked${isDefeatedPanelCollapsed ? " is-collapsed" : ""}`}
          aria-label="Ameaças derrotadas"
        >
          <div className="auto-combat-hunting-scene__tracked-heading">
            <span><Skull aria-hidden="true" /> Derrotados</span>
            <strong>{defeatedTotal.toLocaleString("pt-BR")}</strong>
            <button
              type="button"
              onClick={() => setIsDefeatedPanelCollapsed((current) => !current)}
              aria-expanded={!isDefeatedPanelCollapsed}
              aria-label={isDefeatedPanelCollapsed ? "Expandir ameaças derrotadas" : "Minimizar ameaças derrotadas"}
              title={isDefeatedPanelCollapsed ? "Expandir" : "Minimizar"}
            >
              {isDefeatedPanelCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
            </button>
          </div>
          {!isDefeatedPanelCollapsed ? (
            defeatedMobs.length > 0 ? (
              <ul className="auto-combat-hunting-scene__tracked-list">
                {defeatedMobs.map((mob) => {
                  const portraitUrl = getMobPortraitImage(mob.name) ?? mob.imageUrl;
                  return (
                    <li key={mob.key} title={`${mob.name}: ${mob.count} derrotado${mob.count === 1 ? "" : "s"}`} aria-label={`${mob.name}: ${mob.count} derrotado${mob.count === 1 ? "" : "s"}`}>
                      {portraitUrl ? <img src={portraitUrl} alt="" loading="lazy" /> : <span className="auto-combat-hunting-scene__tracked-placeholder" aria-hidden="true">?</span>}
                      <span className="auto-combat-hunting-scene__tracked-name">{mob.name}</span>
                      <b aria-label={`${mob.count} derrotados`}>×{mob.count.toLocaleString("pt-BR")}</b>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="auto-combat-hunting-scene__tracked-empty">Nenhum derrotado</span>
            )
          ) : null}
        </aside>

        <aside
          className={`auto-combat-hunting-scene__session-panel auto-combat-hunting-scene__session-loot${isLootPanelCollapsed ? " is-collapsed" : ""}`}
          aria-label="Loot adquirido na sessão"
        >
          <div className="auto-combat-hunting-scene__tracked-heading">
            <span><PackageOpen aria-hidden="true" /> Loot</span>
            <strong>{lootTotal.toLocaleString("pt-BR")}</strong>
            <button
              type="button"
              onClick={() => setIsLootPanelCollapsed((current) => !current)}
              aria-expanded={!isLootPanelCollapsed}
              aria-label={isLootPanelCollapsed ? "Expandir loot da sessão" : "Minimizar loot da sessão"}
              title={isLootPanelCollapsed ? "Expandir" : "Minimizar"}
            >
              {isLootPanelCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
            </button>
          </div>
          {!isLootPanelCollapsed ? (
            sessionLoot.length > 0 ? (
              <ul className="auto-combat-hunting-scene__tracked-list auto-combat-hunting-scene__loot-list">
                {sessionLoot.map((loot) => (
                  <li key={loot.key} data-rarity={String(loot.rarity ?? "COMMON").toLowerCase()} title={`${loot.itemName}: ${loot.quantity}`}>
                    {loot.imageUrl ? <img src={loot.imageUrl} alt="" loading="lazy" /> : <span className="auto-combat-hunting-scene__tracked-placeholder" aria-hidden="true">?</span>}
                    <span className="auto-combat-hunting-scene__tracked-name">{loot.itemName}</span>
                    <b>×{loot.quantity.toLocaleString("pt-BR")}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="auto-combat-hunting-scene__tracked-empty">Nenhum loot</span>
            )
          ) : null}
        </aside>
      </div>

      <div className="auto-combat-hunting-scene__player-panel" aria-label={`Estado de ${characterName}`}>
        <CharacterPortrait
          className="auto-combat-hunting-scene__player-avatar"
          name={characterName}
          avatarKey={characterAvatarKey}
          avatarUrl={characterAvatarUrl}
          appearance={characterAppearance}
        />

        <div className="auto-combat-hunting-scene__player-body">
          <div className="auto-combat-hunting-scene__player-identity">
            <div>
              <strong>{characterName}</strong>
              <span>{characterClassName}</span>
            </div>
            <div className="auto-combat-hunting-scene__player-badges">
              <b>Nv. {Math.max(1, Math.floor(characterLevel))}</b>
              {isPremiumActive ? (
                <span className="auto-combat-hunting-scene__premium-badge">
                  <Crown aria-hidden="true" /> Premium
                </span>
              ) : null}
            </div>
          </div>

          <div className="auto-combat-hunting-scene__player-resources">
            <div className="auto-combat-hunting-scene__player-resource auto-combat-hunting-scene__player-resource--xp">
              <div>
                <span>Experiência</span>
                <span className="auto-combat-hunting-scene__resource-values">
                  <b>{characterXpLabel}</b>
                  <em>{Math.round(Math.max(0, Math.min(100, characterXpProgressPercent)))}%</em>
                </span>
              </div>
              <div className="auto-combat-hunting-scene__resource-track" aria-hidden="true">
                <i style={{ width: `${Math.max(0, Math.min(100, characterXpProgressPercent))}%` }} />
              </div>
            </div>
            <div className="auto-combat-hunting-scene__player-resource auto-combat-hunting-scene__player-resource--hp">
              <div>
                <span><HeartPulse aria-hidden="true" /> Vida</span>
                <span className="auto-combat-hunting-scene__resource-values">
                  <b>{Math.ceil(playerCurrentHp)} / {Math.ceil(playerMaxHp)}</b>
                  <em>{Math.round(playerHpPercent)}%</em>
                </span>
              </div>
              <div className="auto-combat-hunting-scene__resource-track" aria-hidden="true">
                <i style={{ width: `${playerHpPercent}%` }} />
              </div>
            </div>
          </div>

          <div className="auto-combat-hunting-scene__player-footer">
            <span className="auto-combat-hunting-scene__activity-status">
              <Radar aria-hidden="true" /> {huntingCountdownLabel}
            </span>
            <div className="auto-combat-hunting-scene__player-actions">
              {canStartBattle ? (
                <button
                  type="button"
                  className="auto-combat-hunting-scene__battle-action"
                  onClick={onStartBattle}
                  disabled={isBattleActionLoading}
                  title="Iniciar batalha"
                >
                  <Swords aria-hidden="true" />
                  <span>{isBattleActionLoading ? "Iniciando" : "Batalhar"}</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onConfigurePotion}
                disabled={potionConfigDisabled}
                title={potionName ? `Configurar ${potionName}` : "Configurar poção automática"}
              >
                {potionImageUrl ? <img src={potionImageUrl} alt="" /> : <FlaskConical aria-hidden="true" />}
                <span>Poção</span>
                <b>×{Math.max(0, Math.floor(potionQuantity)).toLocaleString("pt-BR")}</b>
              </button>
              {canStopHunt ? (
                <button
                  type="button"
                  className="auto-combat-hunting-scene__stop-action"
                  onClick={onRequestStopHunt}
                  disabled={isBattleActionLoading}
                  title="Encerrar atividade"
                >
                  <CircleStop aria-hidden="true" />
                  <span>Encerrar</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
