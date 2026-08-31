import { isAxiosError } from "axios";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Hammer,
  Lock,
  PackageOpen,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import goldIcon from "../../../assets/images/coins/gold.webp";
import { ActivityTimelineFill } from "../../../components/game/ActivityTimelineFill";
import { normalizeClassName } from "../../characters/api/characters.api";
import {
  buildMapVisualStyle,
  getMapImageByName,
} from "../../auto-combat/assets/auto-combat-map-assets";
import { getCharacterOverview } from "../../dashboard/api/dashboard.api";
import { DashboardLayout } from "../../dashboard/components/DashboardLayout";
import {
  getCharacterEquipment,
  type CharacterEquipmentResponse,
} from "../../inventory/api/inventory.api";
import { getGatheringMaterialImageUrl } from "../../gathering/utils/gatheringMaterialAssets";
import {
  getReinforcementProgress,
  selectReinforcementOpportunity,
} from "../../equipment/utils/reinforcementPresentation";
import "../../dashboard/dashboard.css";
import "../../gathering/styles/gathering.css";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../../dashboard/types/dashboard.types";
import { getAvailableIncursions } from "../api/incursions.api";
import { useIncursionsRealtime } from "../realtime/useIncursionsRealtime";
import "../styles/incursions.css";
import type {
  Incursion,
  IncursionApproach,
  IncursionApproachProfile,
  IncursionLootPreview,
  IncursionSession,
  IncursionsAvailableResponse,
} from "../types/incursions.types";

const coinIconUrls = import.meta.glob("../../../assets/images/coins/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const EXP_ICON_URL =
  coinIconUrls["../../../assets/images/coins/exp.webp"] ?? null;

const APPROACH_COPY: Record<
  IncursionApproach,
  { label: string; description: string }
> = {
  CAUTIOUS: {
    label: "Cautelosa",
    description: "Mais segura, lenta e com saque reduzido.",
  },
  BALANCED: {
    label: "Equilibrada",
    description: "Risco, duração e recompensa padrão.",
  },
  AGGRESSIVE: {
    label: "Agressiva",
    description: "Mais rápida e lucrativa, com risco elevado.",
  },
};

function ApproachIcon({ approach }: { approach: IncursionApproach }) {
  if (approach === "CAUTIOUS") return <ShieldCheck size={18} />;
  if (approach === "AGGRESSIVE") return <Zap size={18} />;
  return <Scale size={18} />;
}

function formatMultiplier(multiplier: number) {
  return `${Math.round(multiplier * 100)}%`;
}

function formatProgressPercent(progressPercent: number) {
  const safeProgress = Number.isFinite(progressPercent) ? progressPercent : 0;

  return Math.round(Math.min(100, Math.max(0, safeProgress)));
}

function buildCharacterViewModel(
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
    totalXp:
      character.totalXp ??
      character.levelProgress?.totalXp ??
      character.xp ??
      0,
    currentHp: character.currentHp ?? character.maxHp ?? 1,
    maxHp: character.maxHp ?? 1,
    status: character.status ?? "ACTIVE",
  };
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function formatRemaining(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function normalizeRewardRarityClass(rarity?: string | null) {
  return String(rarity ?? "COMMON")
    .trim()
    .toLowerCase();
}

function formatLootQuantity(loot: IncursionLootPreview) {
  const minQuantity = Math.max(0, Math.floor(Number(loot.minQuantity) || 0));
  const maxQuantity = Math.max(0, Math.floor(Number(loot.maxQuantity) || 0));

  if (minQuantity === maxQuantity) {
    return minQuantity.toLocaleString("pt-BR");
  }

  return `${minQuantity.toLocaleString("pt-BR")}–${maxQuantity.toLocaleString("pt-BR")}`;
}

function formatLootChance(loot: IncursionLootPreview) {
  const chance = Number(loot.chance);

  if (loot.guaranteed || chance >= 100) return "Garantido";

  const safeChance = Number.isFinite(chance) ? Math.max(0, chance) : 0;

  return `${safeChance.toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}%`;
}

function getRewardTypeLabel(rewardType: IncursionLootPreview["rewardType"]) {
  const labels: Record<IncursionLootPreview["rewardType"], string> = {
    XP: "EXP",
    GOLD: "Gold",
    CURRENCY: "Ficha",
    MATERIAL: "Material",
    CONSUMABLE: "Consumível",
    EQUIPMENT: "Equipamento",
    ITEM: "Item",
  };

  return labels[rewardType] ?? rewardType;
}

function getLootName(loot: IncursionLootPreview) {
  if (loot.rewardType === "XP") return "EXP";
  if (loot.rewardType === "GOLD") return "Gold";
  if (loot.rewardType === "CURRENCY") {
    return loot.currency === "WORLD_BOSS_FRAGMENT"
      ? "Fragmento de Ameaça"
      : "Ficha de Incursão";
  }

  return (
    loot.item?.name?.trim() ||
    loot.itemName?.trim() ||
    getRewardTypeLabel(loot.rewardType)
  );
}

function getLootSubtitle(loot: IncursionLootPreview) {
  const rarity = loot.item?.rarity ?? loot.rarity;

  if (rarity) return rarity;
  if (
    loot.rewardType === "XP" ||
    loot.rewardType === "GOLD" ||
    loot.rewardType === "CURRENCY"
  )
    return null;

  const typeLabel = getRewardTypeLabel(loot.rewardType);
  const name = getLootName(loot);

  return typeLabel.toLocaleLowerCase("pt-BR") ===
    name.toLocaleLowerCase("pt-BR")
    ? null
    : typeLabel;
}

function getLootImageUrl(loot: IncursionLootPreview) {
  if (loot.rewardType === "XP") {
    return EXP_ICON_URL ?? loot.iconUrl ?? loot.imageUrl ?? null;
  }
  if (loot.rewardType === "GOLD") return goldIcon;
  if (loot.rewardType === "CURRENCY") return null;

  if (loot.rewardType === "MATERIAL") {
    const materialImage = getGatheringMaterialImageUrl({
      name: loot.item?.name ?? loot.itemName,
      assetKey: loot.item?.assetKey ?? loot.assetKey,
      iconUrl: loot.item?.iconUrl ?? loot.iconUrl,
      imageUrl: loot.item?.imageUrl ?? loot.imageUrl,
    });

    if (materialImage) return materialImage;
  }

  return (
    loot.iconUrl ??
    loot.imageUrl ??
    loot.item?.iconUrl ??
    loot.item?.imageUrl ??
    null
  );
}

function isReinforcementLoot(loot: IncursionLootPreview) {
  return /fragmento de reforço/i.test(getLootName(loot));
}

function isIncursionTokenLoot(loot: IncursionLootPreview) {
  return (
    (loot.rewardType === "CURRENCY" && loot.currency === "INCURSION_TOKEN") ||
    /ficha de incursão/i.test(getLootName(loot))
  );
}

function LootFallbackIcon({ loot }: { loot: IncursionLootPreview }) {
  if (isReinforcementLoot(loot)) return <Hammer size={18} />;
  if (loot.rewardType === "CURRENCY") return <Ticket size={18} />;
  return <span>{getLootFallbackGlyph(loot)}</span>;
}

function getLootInitials(loot: IncursionLootPreview) {
  const name = getLootName(loot);

  if (loot.rewardType === "XP") return "XP";
  if (loot.rewardType === "GOLD") return "G";
  if (loot.rewardType === "CURRENCY") {
    return loot.currency === "WORLD_BOSS_FRAGMENT" ? "FA" : "FI";
  }

  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function getLootFallbackGlyph(loot: IncursionLootPreview) {
  if (loot.rewardType === "XP") return "✦";
  if (loot.rewardType === "GOLD") return "";
  if (loot.rewardType === "CURRENCY") return "◆";
  if (loot.rewardType === "EQUIPMENT") return "◇";
  if (loot.rewardType === "CONSUMABLE") return "+";
  if (loot.rewardType === "MATERIAL") return "▥";

  return "◈";
}

function LootRewardCard({
  loot,
  earned = false,
}: {
  loot: IncursionLootPreview;
  earned?: boolean;
}) {
  const name = getLootName(loot);
  const quantity = formatLootQuantity(loot);
  const chance = earned ? "Recebido" : formatLootChance(loot);
  const imageUrl = getLootImageUrl(loot);
  const subtitle = getLootSubtitle(loot);
  const rarityClass = normalizeRewardRarityClass(
    loot.rarity ?? loot.item?.rarity ?? null,
  );
  const typeClass = loot.rewardType.toLowerCase();

  return (
    <article
      className={`incursion-loot-card incursion-loot-card--${typeClass} incursion-loot-card--rarity-${rarityClass}`}
      aria-label={`${name}: ${quantity}. ${chance}.`}
    >
      <div className="incursion-loot-card__icon" aria-hidden="true">
        <span className="incursion-loot-card__fallback-glyph">
          <LootFallbackIcon loot={loot} />
        </span>
        {!isReinforcementLoot(loot) && loot.rewardType !== "CURRENCY" ? (
          <strong>{getLootInitials(loot)}</strong>
        ) : null}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>

      <div className="incursion-loot-card__content">
        <strong className="incursion-loot-card__name">{name}</strong>
        {subtitle ? (
          <span className="incursion-loot-card__subtitle">{subtitle}</span>
        ) : null}

        <div className="incursion-loot-card__meta">
          <span className="incursion-loot-card__quantity">{quantity}</span>
          <span
            className={
              chance === "Garantido" || earned
                ? "incursion-loot-card__chance incursion-loot-card__chance--guaranteed"
                : "incursion-loot-card__chance"
            }
          >
            {chance}
          </span>
        </div>
      </div>
    </article>
  );
}

function buildEarnedLoot(
  reward: NonNullable<IncursionSession["rewards"]>[number],
): IncursionLootPreview {
  return {
    id: reward.id,
    rewardType: reward.rewardType,
    currency: reward.currency,
    itemId: reward.itemId,
    itemName: reward.itemName,
    item: reward.item,
    chance: 100,
    minQuantity: reward.quantity,
    maxQuantity: reward.quantity,
    guaranteed: true,
    rarity: reward.rarity,
  };
}

function formatMapLevelRange(
  map?: { minLevel?: number | null; maxLevel?: number | null } | null,
): string | null {
  const minLevel = Number(map?.minLevel);
  const maxLevel = Number(map?.maxLevel);
  const hasMinLevel = Number.isFinite(minLevel) && minLevel > 0;
  const hasMaxLevel = Number.isFinite(maxLevel) && maxLevel > 0;

  if (hasMinLevel && hasMaxLevel) return `Nv. ${minLevel}–${maxLevel}`;
  if (hasMinLevel) return `A partir do Nv. ${minLevel}`;
  if (hasMaxLevel) return `Até Nv. ${maxLevel}`;

  return null;
}

function getTierRarity(tier?: number | null): string {
  const safeTier = Number(tier);

  if (!Number.isFinite(safeTier)) return "common";
  if (safeTier >= 9) return "legendary";
  if (safeTier >= 7) return "epic";
  if (safeTier >= 5) return "rare";
  if (safeTier >= 3) return "uncommon";

  return "common";
}

function getMapTierClassName(tier?: number | null): string {
  return `gathering-map-tier--${getTierRarity(tier)}`;
}

function getIncursionTierClassName(tier?: number | null): string {
  return `incursions-tier--${getTierRarity(tier)}`;
}

function getRiskLabel(riskLevel?: number | null) {
  const safeRiskLevel = Number(riskLevel);

  if (!Number.isFinite(safeRiskLevel)) return "Baixo";
  if (safeRiskLevel >= 9) return "Extremo";
  if (safeRiskLevel >= 6) return "Alto";
  if (safeRiskLevel >= 3) return "Médio";

  return "Baixo";
}

function getErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const data = error.response?.data as
      { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(" ");
    if (data?.message) return data.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Não foi possível executar a ação de incursão.";
}

function getIncursionStatusLabel(params: {
  incursion: Incursion;
  activeSession?: IncursionSession | null;
  rewardedSession?: IncursionSession | null;
}): string | null {
  if (params.activeSession?.incursionId === params.incursion.id) {
    return params.activeSession.status === "ACTIVE"
      ? "Em andamento"
      : "Finalizando";
  }

  if (params.rewardedSession?.incursionId === params.incursion.id) {
    return params.rewardedSession.success === false ? "Falhou" : "Concluída";
  }

  if (!params.incursion.canStart) return "Bloqueada";
  return null;
}

function getStatusTone(statusLabel: string | null) {
  if (!statusLabel) return "available";
  if (/andamento|finalizando/i.test(statusLabel)) return "running";
  if (/bloqueada/i.test(statusLabel)) return "locked";
  if (/recompensada|conclu/i.test(statusLabel)) return "done";
  return "available";
}

function GoldAmount({ value }: { value: number }) {
  return (
    <span className="incursions-gold-amount">
      <img src={goldIcon} alt="" aria-hidden="true" />
      <strong>{value.toLocaleString("pt-BR")}</strong>
    </span>
  );
}

function IncursionModalHero({ incursion }: { incursion: Incursion }) {
  const mapImage = getMapImageByName(incursion.map.name);
  const mapVisualStyle = buildMapVisualStyle(mapImage);

  return (
    <div
      className={`incursions-modal__banner ${getIncursionTierClassName(incursion.tier)}`}
      style={mapVisualStyle}
    >
      {!mapImage ? (
        <span className="incursions-modal__banner-fallback" aria-hidden="true">
          {incursion.name.slice(0, 2).toUpperCase()}
        </span>
      ) : null}

      <div className="incursions-modal__banner-overlay">
        <span className="incursions-modal__eyebrow">Detalhes da operação</span>
        <h2 id="incursions-modal-title">{incursion.name}</h2>

        <div
          className="incursions-modal__hero-chips"
          aria-label="Resumo da incursão"
        >
          <span>{incursion.map.name}</span>
          <span
            className={`incursions-modal__hero-chip--tier ${getIncursionTierClassName(incursion.tier)}`}
          >
            Tier {incursion.tier}
          </span>
          <span>
            Nv. {incursion.minLevel}–{incursion.maxLevel}
          </span>
          <span>
            <Clock size={13} /> {formatDuration(incursion.durationSeconds)}
          </span>
          <GoldAmount value={incursion.goldCost} />
        </div>
      </div>
    </div>
  );
}

function IncursionArt({
  incursion,
  isLocked,
  statusLabel,
}: {
  incursion: Incursion;
  isLocked: boolean;
  statusLabel: string | null;
}) {
  const mapImage = getMapImageByName(incursion.map.name);
  const mapVisualStyle = buildMapVisualStyle(mapImage);

  return (
    <span
      className={`incursion-art ${getIncursionTierClassName(incursion.tier)}`}
      style={mapVisualStyle}
      aria-hidden="true"
    >
      <span className="incursion-art__tier">Tier {incursion.tier}</span>
      {statusLabel ? (
        <span className="incursion-art__status">{statusLabel}</span>
      ) : null}

      <span className="incursion-art__summary">
        <span>
          <Clock size={13} /> {formatDuration(incursion.durationSeconds)}
        </span>
        <GoldAmount value={incursion.goldCost} />
        <span>Risco: {getRiskLabel(incursion.riskLevel)}</span>
      </span>

      {isLocked ? (
        <span className="incursion-art__lock">
          <Lock size={22} />
        </span>
      ) : null}
    </span>
  );
}

export function IncursionsPage() {
  const { characterId } = useParams();
  const { state: realtimeState, start, cancel } = useIncursionsRealtime();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [data, setData] = useState<IncursionsAvailableResponse | null>(null);
  const [equipmentResponse, setEquipmentResponse] =
    useState<CharacterEquipmentResponse | null>(null);
  const [modalIncursionId, setModalIncursionId] = useState<string | null>(null);
  const [selectedApproach, setSelectedApproach] =
    useState<IncursionApproach>("BALANCED");
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!characterId) return;

    const [overviewResponse, incursionsResponse, equipmentState] =
      await Promise.all([
        getCharacterOverview(characterId),
        getAvailableIncursions(characterId),
        getCharacterEquipment(characterId),
      ]);

    setOverview(overviewResponse);
    setData(incursionsResponse);
    setEquipmentResponse(equipmentState);
  }, [characterId]);

  useEffect(() => {
    if (!characterId) return;

    async function load() {
      try {
        setIsLoading(true);
        await loadData();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [characterId, loadData]);

  useEffect(() => {
    if (!modalIncursionId) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalIncursionId(null);
    };

    document.body.classList.add("incursions-modal-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("incursions-modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalIncursionId]);

  useEffect(() => {
    if (!characterId || !data?.activeSession || realtimeState.session) return;

    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [characterId, data?.activeSession, loadData, realtimeState.session]);

  const activeSession = realtimeState.session ?? data?.activeSession ?? null;
  const rewardedSession = activeSession
    ? null
    : (realtimeState.status?.rewardedSession ?? data?.rewardedSession ?? null);
  const incursions = data?.incursions ?? [];
  const modalIncursion =
    incursions.find((incursion) => incursion.id === modalIncursionId) ?? null;
  const selectedApproachProfile = modalIncursion?.approaches.find(
    (profile) => profile.approach === selectedApproach,
  );
  const currentMap =
    data?.currentMap ??
    activeSession?.incursion.map ??
    incursions[0]?.map ??
    null;
  const currentMapName = currentMap?.name ?? "Mapa não definido";
  const currentMapImage = getMapImageByName(currentMapName);
  const currentMapVisualStyle = buildMapVisualStyle(currentMapImage);
  const currentMapTierClassName = getMapTierClassName(currentMap?.tier);
  const currentMapLevelRangeLabel = formatMapLevelRange(currentMap);
  const hasBlockingActivity = incursions.some((incursion) =>
    (incursion.lockedReasons ?? []).some((reason) =>
      /auto-combate|gathering|atividade|world boss/i.test(reason),
    ),
  );
  const reinforcementOpportunity = useMemo(
    () =>
      selectReinforcementOpportunity(
        equipmentResponse?.reinforcement,
        rewardedSession?.incursion.tier,
      ),
    [equipmentResponse?.reinforcement, rewardedSession?.incursion.tier],
  );
  const reinforcementProgress = getReinforcementProgress(
    reinforcementOpportunity,
  );
  const earnedRewards = useMemo(
    () => (rewardedSession?.rewards ?? []).map(buildEarnedLoot),
    [rewardedSession?.rewards],
  );
  const earnedReinforcementFragments = earnedRewards
    .filter(isReinforcementLoot)
    .reduce((total, reward) => total + Math.max(0, reward.minQuantity), 0);
  const rewardedTier = rewardedSession?.incursion.tier ?? null;
  const rewardedTierMaterial =
    equipmentResponse?.reinforcement?.materials.find(
      (material) => material.tier === rewardedTier,
    ) ?? null;
  const hasRewardedTierEquipment = Boolean(
    equipmentResponse?.reinforcement?.slots.some(
      (slot) => slot.item?.tier === rewardedTier,
    ),
  );

  useEffect(() => {
    if (!characterId || !rewardedSession?.id) return;

    let disposed = false;

    void Promise.all([
      getCharacterOverview(characterId),
      getCharacterEquipment(characterId),
    ])
      .then(([overviewResponse, equipmentState]) => {
        if (disposed) return;
        setOverview(overviewResponse);
        setEquipmentResponse(equipmentState);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, [characterId, rewardedSession?.id]);

  if (!characterId) return <Navigate to="/characters" replace />;

  if (!overview && isLoading) {
    return (
      <div className="incursions-page incursions-page--loading">
        Carregando incursões...
      </div>
    );
  }

  if (!overview) return <Navigate to="/characters" replace />;

  const character = buildCharacterViewModel(overview);

  async function handleStart(incursionId: string) {
    setActionId(incursionId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await start(incursionId, selectedApproach);
      if (response?.message) setSuccessMessage(response.message);
      if (response?.session) setModalIncursionId(null);
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionId(null);
    }
  }

  async function handleCancel() {
    if (!activeSession || activeSession.status !== "ACTIVE") return;

    setActionId("cancel-incursion");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await cancel();
      if (response?.message) setSuccessMessage(response.message);
      setModalIncursionId(null);
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setActionId(null);
    }
  }

  return (
    <DashboardLayout character={character} hideHero>
      <main className="incursions-page">
        <section className="incursions-hero">
          <div>
            <span className="incursions-hero__eyebrow">
              Atividade de risco do mapa atual
            </span>
            <h1>Incursões</h1>
            <p>
              Operações temporizadas do mapa atual. Escolha uma incursão, pague
              o custo em gold e acompanhe a operação pela Activity Bar global em
              tempo real.
            </p>
          </div>
        </section>

        <section
          className={[
            "gathering-origin-map-context",
            "gathering-origin-map-context--standalone",
            currentMapTierClassName,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={`Mapa atual: ${currentMapName}`}
        >
          <div
            className="gathering-origin-map-context__media"
            style={currentMapVisualStyle}
          >
            {!currentMapImage ? (
              <span aria-hidden="true">
                {currentMapName.slice(0, 2).toUpperCase()}
              </span>
            ) : null}
          </div>

          <div className="gathering-origin-map-context__body">
            <span className="gathering-origin-map-context__eyebrow">
              Mapa atual
            </span>

            <div className="gathering-origin-map-context__title-row">
              <h2>{currentMapName}</h2>

              <div className="gathering-origin-map-context__chips">
                {currentMap?.tier ? (
                  <span className="gathering-origin-map-context__chip gathering-origin-map-context__chip--tier">
                    Tier {currentMap.tier}
                  </span>
                ) : null}

                {currentMapLevelRangeLabel ? (
                  <span className="gathering-origin-map-context__chip gathering-origin-map-context__chip--level">
                    {currentMapLevelRangeLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <aside className="gathering-origin-premium-card incursions-premium-card">
          <div
            className="gathering-origin-premium-card__badge"
            aria-hidden="true"
          >
            i
          </div>

          <div>
            <h2>Benefícios premium</h2>
            <p>
              Alertas avançados, priorização visual e relatórios compactos para
              operações idle de alto risco.
            </p>
          </div>

          <button
            type="button"
            className="gathering-origin-premium-card__button"
          >
            Ver benefícios
          </button>
        </aside>

        {errorMessage || realtimeState.errorMessage ? (
          <div className="incursions-alert incursions-alert--error">
            {errorMessage ?? realtimeState.errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="incursions-alert incursions-alert--success">
            {successMessage}
          </div>
        ) : null}
        {rewardedSession ? (
          <section
            className={`incursions-reward-result${
              rewardedSession.success === false ? " is-failed" : ""
            }`}
            aria-label="Resultado da última incursão"
          >
            <header className="incursions-reward-result__header">
              <span aria-hidden="true">
                {rewardedSession.success === false ? (
                  <ShieldAlert size={20} />
                ) : (
                  <CheckCircle2 size={20} />
                )}
              </span>
              <span>
                <small>Última operação</small>
                <strong>{rewardedSession.incursion.name}</strong>
              </span>
              <strong>
                {rewardedSession.success === false ? "Falhou" : "Concluída"}
              </strong>
            </header>

            {rewardedSession.outcomeSummary ? (
              <p>{rewardedSession.outcomeSummary}</p>
            ) : null}

            {rewardedSession.entryGoldRefund > 0 ? (
              <div className="incursions-reward-result__refund">
                {rewardedSession.success === false ? (
                  <ShieldAlert size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                <span>
                  {rewardedSession.success === false
                    ? "Entrada parcialmente devolvida"
                    : "Entrada devolvida"}
                </span>
                <strong>
                  +{rewardedSession.entryGoldRefund.toLocaleString("pt-BR")}{" "}
                  Gold
                </strong>
              </div>
            ) : null}

            {rewardedSession.success !== false && earnedRewards.length > 0 ? (
              <>
                <div className="incursions-reward-result__title">
                  <PackageOpen size={15} /> Recompensas recebidas
                </div>
                <div className="incursions-modal__loot-grid incursions-reward-result__loot">
                  {earnedRewards.map((reward, index) => (
                    <LootRewardCard
                      key={
                        reward.id ??
                        `${reward.rewardType}-${reward.itemId ?? reward.currency ?? index}`
                      }
                      loot={reward}
                      earned
                    />
                  ))}
                </div>
              </>
            ) : null}

            {rewardedSession.success !== false && rewardedTier ? (
              <div className="incursions-reward-result__reinforcement">
                <span aria-hidden="true">
                  <Hammer size={18} />
                </span>
                <span>
                  <small>
                    {earnedReinforcementFragments > 0
                      ? `+${earnedReinforcementFragments} fragmentos nesta incursão`
                      : `Fragmentos de reforço T${rewardedTier}`}
                  </small>
                  {reinforcementOpportunity?.item &&
                  reinforcementOpportunity.cost &&
                  reinforcementProgress ? (
                    <>
                      <strong>
                        {reinforcementProgress.current}/
                        {reinforcementProgress.required} para reforçar{" "}
                        {reinforcementOpportunity.item.name} ao +
                        {reinforcementOpportunity.cost.level}
                      </strong>
                      <i aria-hidden="true">
                        <em
                          style={{
                            transform: `scaleX(${reinforcementProgress.percent / 100})`,
                          }}
                        />
                      </i>
                      <small>
                        {reinforcementProgress.remaining > 0
                          ? `Faltam ${reinforcementProgress.remaining} fragmentos e ${reinforcementOpportunity.cost.goldCost.toLocaleString("pt-BR")} Gold.`
                          : `Fragmentos completos. Custo: ${reinforcementOpportunity.cost.goldCost.toLocaleString("pt-BR")} Gold.`}
                      </small>
                    </>
                  ) : (
                    <strong>
                      {hasRewardedTierEquipment
                        ? `Peças T${rewardedTier} equipadas já estão no reforço máximo.`
                        : `${rewardedTierMaterial?.quantity ?? 0} fragmentos guardados. Equipe uma peça T${rewardedTier} para reforçá-la.`}
                    </strong>
                  )}
                </span>
                <Link to={`/dashboard/${characterId}/equipment`}>
                  Abrir oficina
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </div>
            ) : null}
          </section>
        ) : null}
        {hasBlockingActivity && !activeSession ? (
          <div className="incursions-alert incursions-alert--warning">
            Este personagem já está em outra atividade principal. Encerre a
            atividade atual antes de iniciar uma incursão.
          </div>
        ) : null}

        <section
          className="incursions-content-grid"
          aria-label="Incursões e atividade atual"
        >
          <main className="incursions-main-column">
            <section className="gathering-card gathering-card--compact incursions-list-panel">
              <header className="incursions-list-panel__header">
                <div className="gathering-card__title-group incursions-list-panel__title-group">
                  <span className="gathering-card__eyebrow">Operações</span>
                  <h2>Incursões deste mapa</h2>
                </div>
              </header>

              {isLoading ? (
                <div className="incursions-empty incursions-empty--inline">
                  <span className="gathering-loading__spinner" />
                  <p>Carregando incursões...</p>
                </div>
              ) : incursions.length > 0 ? (
                <div
                  className="incursions-grid"
                  aria-label="Incursões do mapa atual"
                >
                  {incursions.map((incursion) => {
                    const lockedReasons = incursion.lockedReasons ?? [];
                    const isLocked = !incursion.canStart;
                    const isRunningThis =
                      activeSession?.incursionId === incursion.id;
                    const statusLabel = getIncursionStatusLabel({
                      incursion,
                      activeSession,
                      rewardedSession,
                    });
                    const statusTone = getStatusTone(statusLabel);
                    const reinforcementPreview =
                      incursion.rewardsPreview.find(isReinforcementLoot);
                    const tokenPreview =
                      incursion.rewardsPreview.find(isIncursionTokenLoot);

                    return (
                      <button
                        className={[
                          "incursion-card",
                          getIncursionTierClassName(incursion.tier),
                          isLocked ? "is-locked" : "",
                          isRunningThis ? "is-running" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={incursion.id}
                        type="button"
                        onClick={() => {
                          setSelectedApproach("BALANCED");
                          setModalIncursionId(incursion.id);
                        }}
                      >
                        <IncursionArt
                          incursion={incursion}
                          isLocked={isLocked}
                          statusLabel={
                            statusTone === "available" ? null : statusLabel
                          }
                        />

                        <span className="incursion-card__content">
                          <span className="incursion-card__header">
                            <span className="incursion-card__name">
                              {incursion.name}
                            </span>
                            {statusLabel ? (
                              <strong
                                className={`incursion-card__status incursion-card__status--${statusTone}`}
                              >
                                {statusLabel}
                              </strong>
                            ) : null}
                          </span>

                          {isRunningThis ? (
                            <small>Esta operação está em andamento.</small>
                          ) : null}
                          {isLocked && lockedReasons[0] ? (
                            <small>
                              <Lock size={13} /> {lockedReasons[0]}
                            </small>
                          ) : null}

                          {reinforcementPreview || tokenPreview ? (
                            <span className="incursion-card__reward-preview">
                              {reinforcementPreview ? (
                                <span>
                                  <Hammer size={13} />
                                  {formatLootQuantity(
                                    reinforcementPreview,
                                  )}{" "}
                                  frag.
                                </span>
                              ) : null}
                              {tokenPreview ? (
                                <span>
                                  <Ticket size={13} />
                                  {formatLootQuantity(tokenPreview)} fichas
                                </span>
                              ) : null}
                            </span>
                          ) : null}

                          <span
                            className="incursion-card__action"
                            aria-hidden="true"
                          >
                            {isLocked ? "Indisponível" : "Ver detalhes"}
                            <ArrowRight size={14} />
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="incursions-empty incursions-empty--inline">
                  <PackageOpen size={24} />
                  <h2>Nenhuma incursão neste mapa</h2>
                  <p>Troque de mapa para encontrar novas operações.</p>
                </div>
              )}
            </section>
          </main>

          <aside className="incursions-side-column">
            <section className="gathering-origin-side-section gathering-origin-side-section--current">
              <div className="gathering-origin-section-divider">
                <span>Atividade atual</span>
              </div>

              <div className="gathering-card gathering-card--active incursions-current-card">
                {activeSession ? (
                  <div className="incursions-current-card__content">
                    <div className="incursions-current-card__head">
                      <div className="incursions-current-card__icon">
                        <ShieldAlert size={22} />
                      </div>

                      <div>
                        <span className="incursions-current-card__status">
                          {activeSession.status === "ACTIVE"
                            ? "Incursão ativa"
                            : "Finalizando recompensas"}
                        </span>
                        <h2>{activeSession.incursion.name}</h2>
                        <p>{activeSession.incursion.map.name}</p>
                      </div>
                    </div>

                    <div className="incursions-current-card__progress">
                      <div>
                        <span>Progresso</span>
                        <strong>
                          {formatProgressPercent(activeSession.progressPercent)}
                          %
                        </strong>
                      </div>
                      <i>
                        {realtimeState.timeline?.activityInstanceId ===
                        activeSession.id ? (
                          <ActivityTimelineFill
                            as="em"
                            timeline={realtimeState.timeline}
                          />
                        ) : (
                          <em
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, activeSession.progressPercent),
                              )}%`,
                            }}
                          />
                        )}
                      </i>
                    </div>

                    <strong className="incursions-current-card__timer">
                      {activeSession.status === "ACTIVE"
                        ? `Termina em ${formatRemaining(activeSession.remainingSeconds)}`
                        : "Entregando automaticamente"}
                    </strong>

                    <div className="incursions-current-card__risk">
                      <div>
                        <span>Abordagem</span>
                        <strong>
                          {APPROACH_COPY[activeSession.approach].label}
                        </strong>
                      </div>
                      <div>
                        <span>Sucesso</span>
                        <strong>{activeSession.successChance}%</strong>
                      </div>
                      <div>
                        <span>Recompensa</span>
                        <strong>
                          {formatMultiplier(activeSession.rewardMultiplier)}
                        </strong>
                      </div>
                    </div>

                    {activeSession.status === "ACTIVE" ? (
                      <button
                        className="incursions-danger-button"
                        type="button"
                        disabled={
                          actionId === "cancel-incursion" ||
                          realtimeState.isBusy
                        }
                        onClick={() => void handleCancel()}
                      >
                        <XCircle size={15} />
                        {actionId === "cancel-incursion" || realtimeState.isBusy
                          ? "Cancelando..."
                          : "Cancelar incursão"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="incursions-current-card__empty">
                    <ShieldAlert size={24} />
                    <h2>Nenhuma incursão ativa</h2>
                    <p>Escolha uma incursão para iniciar uma operação.</p>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </section>

        {modalIncursion ? (
          <div
            className="incursions-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setModalIncursionId(null);
              }
            }}
          >
            <section
              className={`incursions-modal ${getIncursionTierClassName(modalIncursion.tier)}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="incursions-modal-title"
            >
              <header className="incursions-modal__hero">
                <IncursionModalHero incursion={modalIncursion} />
              </header>

              <div className="incursions-modal__body">
                <section className="incursions-modal__approach">
                  <div className="incursions-modal__section-title">
                    <ShieldAlert size={16} />
                    <div>
                      <strong>Escolha a abordagem</strong>
                      <span>O resultado é calculado no fim da operação.</span>
                    </div>
                  </div>

                  <div
                    className="incursions-approach-selector"
                    role="radiogroup"
                    aria-label="Abordagem da incursão"
                  >
                    {modalIncursion.approaches.map(
                      (profile: IncursionApproachProfile) => {
                        const copy = APPROACH_COPY[profile.approach];
                        const isSelected =
                          selectedApproach === profile.approach;

                        return (
                          <button
                            key={profile.approach}
                            className={isSelected ? "is-selected" : ""}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() =>
                              setSelectedApproach(profile.approach)
                            }
                          >
                            <span className="incursions-approach-selector__head">
                              <ApproachIcon approach={profile.approach} />
                              <strong>{copy.label}</strong>
                            </span>
                            <span>{copy.description}</span>
                            <span className="incursions-approach-selector__stats">
                              <strong>{profile.successChance}%</strong> sucesso
                              <strong>
                                {formatDuration(profile.durationSeconds)}
                              </strong>
                              <strong>
                                {formatMultiplier(profile.rewardMultiplier)}
                              </strong>{" "}
                              loot
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>

                  {selectedApproachProfile ? (
                    <p className="incursions-modal__risk-note">
                      Falha: devolve{" "}
                      {modalIncursion.failureEntryRefundGold.toLocaleString(
                        "pt-BR",
                      )}{" "}
                      Gold ({modalIncursion.failureEntryRefundPercent}%) e pode
                      causar até{" "}
                      {Math.round(selectedApproachProfile.failureHpRatio * 100)}
                      % do HP máximo, mas nunca retorna com menos de 1 HP.
                    </p>
                  ) : null}
                </section>

                <section className="incursions-modal__rewards">
                  <strong className="incursions-modal__rewards-title">
                    <PackageOpen size={16} /> Loot possível
                  </strong>

                  <div className="incursions-modal__refund-note">
                    <CheckCircle2 size={17} />
                    <span>
                      <strong>Entrada protegida</strong>
                      <small>
                        Sucesso:{" "}
                        {modalIncursion.successEntryRefundGold.toLocaleString(
                          "pt-BR",
                        )}{" "}
                        Gold ({modalIncursion.successEntryRefundPercent}%).
                        Falha:{" "}
                        {modalIncursion.failureEntryRefundGold.toLocaleString(
                          "pt-BR",
                        )}{" "}
                        Gold ({modalIncursion.failureEntryRefundPercent}%). Loot
                        adicional.
                      </small>
                    </span>
                  </div>

                  {modalIncursion.rewardsPreview.length > 0 ? (
                    <div className="incursions-modal__loot-grid">
                      {modalIncursion.rewardsPreview.map((loot) => (
                        <LootRewardCard
                          key={
                            loot.id ?? `${loot.rewardType}-${loot.sortOrder}`
                          }
                          loot={loot}
                        />
                      ))}
                    </div>
                  ) : (
                    <p>
                      As recompensas desta operação ainda são desconhecidas.
                    </p>
                  )}

                  {modalIncursion.rewardsPreview.some(isReinforcementLoot) ? (
                    <div className="incursions-modal__reinforcement-note">
                      <Hammer size={17} />
                      <span>
                        <strong>Progresso de equipamento garantido</strong>
                        <small>
                          Os fragmentos recebidos avançam peças T
                          {modalIncursion.tier} do +1 ao +3 na Oficina de
                          Reforço.
                        </small>
                      </span>
                    </div>
                  ) : null}
                </section>

                {modalIncursion.lockedReasons?.length ? (
                  <div className="incursions-modal__lock-message">
                    <Lock size={15} /> {modalIncursion.lockedReasons[0]}
                  </div>
                ) : null}
              </div>

              <footer className="incursions-modal__actions">
                {activeSession?.incursionId === modalIncursion.id &&
                activeSession.status === "ACTIVE" ? (
                  <button
                    className="incursions-danger-button"
                    type="button"
                    disabled={
                      actionId === "cancel-incursion" || realtimeState.isBusy
                    }
                    onClick={() => void handleCancel()}
                  >
                    <XCircle size={15} />
                    {actionId === "cancel-incursion" || realtimeState.isBusy
                      ? "Cancelando..."
                      : "Cancelar incursão"}
                  </button>
                ) : (
                  <button
                    className="incursions-primary-button"
                    type="button"
                    disabled={
                      !modalIncursion.canStart ||
                      Boolean(activeSession) ||
                      actionId === modalIncursion.id ||
                      realtimeState.isBusy
                    }
                    onClick={() => void handleStart(modalIncursion.id)}
                  >
                    {actionId === modalIncursion.id || realtimeState.isBusy ? (
                      "Iniciando..."
                    ) : activeSession ? (
                      "Atividade em andamento"
                    ) : modalIncursion.canStart ? (
                      <>
                        <span className="incursions-button-label incursions-button-label--desktop">
                          Iniciar incursão
                        </span>
                        <span className="incursions-button-label incursions-button-label--mobile">
                          Iniciar
                        </span>
                      </>
                    ) : (
                      "Incursão bloqueada"
                    )}
                    <ArrowRight size={16} />
                  </button>
                )}

                <button
                  className="incursions-secondary-button"
                  type="button"
                  onClick={() => setModalIncursionId(null)}
                >
                  Fechar
                </button>
              </footer>
            </section>
          </div>
        ) : null}
      </main>
    </DashboardLayout>
  );
}
