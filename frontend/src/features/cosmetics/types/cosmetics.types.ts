export type CosmeticType =
  | "AVATAR"
  | "AVATAR_FRAME"
  | "PROFILE_BANNER"
  | "OVERVIEW_BACKGROUND"
  | "PROFILE_EFFECT"
  | "TITLE"
  | "BADGE";

export type CosmeticAccessType = "FREE" | "PREMIUM" | "ENTITLEMENT";
export type AvatarPresentation = "MASCULINE" | "FEMININE";

export interface CosmeticCollectionSummary {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  coverAssetKey?: string | null;
  sortOrder?: number;
}

export interface CosmeticItem {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  type: CosmeticType;
  accessType: CosmeticAccessType;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
  assetKey?: string | null;
  effectPreset?: string | null;
  displayText?: string | null;
  accentColor?: string | null;
  avatarPresentation?: AvatarPresentation | null;
  class?: { id: string; name: string } | null;
  collection?: CosmeticCollectionSummary | null;
  isOwned?: boolean;
  isCompatible?: boolean;
  isSelected?: boolean;
  isEquipped?: boolean;
  unlockedBy?: "FREE" | "PREMIUM" | "ENTITLEMENT" | null;
}

export interface ResolvedCharacterAppearance {
  baseAvatarKey?: string | null;
  avatarKey?: string | null;
  avatar?: CosmeticItem | null;
  avatarFrame?: CosmeticItem | null;
  profileBanner?: CosmeticItem | null;
  overviewBackground?: CosmeticItem | null;
  profileEffect?: CosmeticItem | null;
  title?: CosmeticItem | null;
  badge?: CosmeticItem | null;
  accentColor?: string | null;
}

export interface CosmeticCollection extends CosmeticCollectionSummary {
  sortOrder: number;
  items: CosmeticItem[];
}

export interface CharacterCosmeticsCatalogResponse {
  character: {
    id: string;
    name: string;
    class: { id: string; name: string };
    baseAvatarKey?: string | null;
  };
  membership: {
    isPremiumActive: boolean;
    premiumUntil?: string | null;
  };
  appearance: ResolvedCharacterAppearance;
  collections: CosmeticCollection[];
}

export interface UpdateCharacterAppearancePayload {
  avatarCosmeticKey?: string | null;
  avatarFrameCosmeticKey?: string | null;
  profileBannerCosmeticKey?: string | null;
  overviewBackgroundCosmeticKey?: string | null;
  profileEffectCosmeticKey?: string | null;
  titleCosmeticKey?: string | null;
  badgeCosmeticKey?: string | null;
}

export interface PublicCharacterProfileResponse {
  character: {
    id: string;
    name: string;
    level: number;
    status: string;
    avatarKey?: string | null;
    createdAt: string;
    class: { id: string; name: string; description?: string | null };
    map?: { id: string; name: string; tier: number } | null;
    equipment?: Record<
      string,
      {
        id: string;
        name: string;
        tier: number;
        rarity: string;
        slot: string;
        enhancementLevel?: number | null;
      } | null
    > | null;
  };
  appearance: ResolvedCharacterAppearance;
  viewer: { isOwner: boolean };
}
