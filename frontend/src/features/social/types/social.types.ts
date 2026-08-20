export interface SocialCharacter {
  id: string;
  name: string;
  level: number;
  avatarKey?: string | null;
  class?: { name: string } | null;
}

export interface Friendship {
  id: string;
  status: "PENDING" | "ACCEPTED" | "BLOCKED";
  createdAt: string;
  acceptedAt?: string | null;
  user: {
    id: string;
    email: string;
    characters: SocialCharacter[];
  };
}

export interface SocialDashboardResponse {
  friends: Friendship[];
  incoming: Friendship[];
  outgoing: Friendship[];
}
