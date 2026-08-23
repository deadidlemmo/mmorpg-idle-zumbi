import type { ResolvedCharacterAppearance } from "../../cosmetics/types/cosmetics.types";

export interface SocialCharacter {
  id: string;
  name: string;
  level: number;
  avatarKey?: string | null;
  class?: { id?: string; name: string } | null;
  map?: { id: string; name: string; tier: number } | null;
  appearance?: ResolvedCharacterAppearance | null;
}

export interface Friendship {
  id: string;
  status: "PENDING" | "ACCEPTED" | "BLOCKED";
  createdAt: string;
  acceptedAt?: string | null;
  user: {
    id: string;
    characters: SocialCharacter[];
  };
}

export interface SocialDashboardResponse {
  friends: Friendship[];
  incoming: Friendship[];
  outgoing: Friendship[];
}

export interface SocialRelationship {
  id: string;
  status: "PENDING" | "ACCEPTED" | "BLOCKED";
  direction: "INCOMING" | "OUTGOING";
}

export interface SocialCharacterSearchResult {
  character: SocialCharacter;
  relationship?: SocialRelationship | null;
}

export interface SocialCharacterSearchResponse {
  query: string;
  results: SocialCharacterSearchResult[];
}

export type SocialRankingCategory =
  | "LEVEL"
  | "HUNTING"
  | "CRAFTING"
  | "DESMANCHE"
  | "COLETA"
  | "CONTENCAO"
  | "ARSENAL"
  | "PATRULHA"
  | "TECNOVARREDURA";

export interface SocialRankingEntry {
  rank: number;
  character: SocialCharacter;
  score: {
    level: number;
    xp: number;
    totalXp: number;
  };
  appearance?: ResolvedCharacterAppearance | null;
}

export interface SocialRankingResponse {
  category: SocialRankingCategory;
  label: string;
  generatedAt: string;
  entries: SocialRankingEntry[];
}
