export const API_ENDPOINTS = {
  auth: {
    login: "/auth/login",
    register: "/auth/register",
    me: "/auth/me",
    requestPasswordReset: "/auth/password-reset/request",
    confirmPasswordReset: "/auth/password-reset/confirm",
  },

  admin: {
    summary: "/admin/summary",
    operations: "/admin/operations",
    startAutoCombatCapture: "/admin/operations/auto-combat/capture",
    product: "/admin/product",
    users: "/admin/users",
    userSuspension: (userId: string) => `/admin/users/${userId}/suspension`,
    auditLogs: "/admin/audit-logs",
    cosmeticsGrant: "/admin/cosmetics/grant",
    cosmeticsRevoke: "/admin/cosmetics/revoke",
    userCosmetics: (userId: string) => `/admin/cosmetics/users/${userId}`,
  },

  economy: {
    wallet: (characterId: string) =>
      `/economy/characters/${characterId}/wallet`,
    exchangeOffers: (characterId: string) =>
      `/economy/characters/${characterId}/exchange-offers`,
    exchanges: (characterId: string) =>
      `/economy/characters/${characterId}/exchanges`,
  },

  progression: {
    dashboard: (characterId: string) => `/progression/${characterId}`,
    tutorial: (characterId: string) => `/progression/${characterId}/tutorial`,
    claimMission: (characterId: string, missionId: string) =>
      `/progression/${characterId}/missions/${missionId}/claim`,
    claimAchievement: (characterId: string, achievementId: string) =>
      `/progression/${characterId}/achievements/${achievementId}/claim`,
  },

  social: {
    friends: "/social/friends",
    searchCharacters: "/social/characters/search",
    rankings: "/social/rankings",
    request: "/social/friends/request",
    accept: (friendshipId: string) => `/social/friends/${friendshipId}/accept`,
    remove: (friendshipId: string) => `/social/friends/${friendshipId}`,
    characterProfile: (characterId: string) =>
      `/social/characters/${characterId}/profile`,
  },

  cosmetics: {
    catalog: (characterId: string) => `/cosmetics/characters/${characterId}`,
    appearance: (characterId: string) =>
      `/cosmetics/characters/${characterId}/appearance`,
  },

  storefront: {
    catalog: (characterId: string) => `/storefront/characters/${characterId}`,
    checkout: "/storefront/checkout",
  },

  chat: {
    generalMessages: "/chat/general/messages",
  },

  characters: {
    me: "/characters/me",
    create: "/characters",
    byId: (characterId: string) => `/characters/${characterId}`,
    status: (characterId: string) => `/characters/${characterId}/status`,
    overview: (characterId: string) => `/characters/${characterId}/overview`,
    activitySummary: (characterId: string) =>
      `/characters/${characterId}/activity-summary`,
    currentMap: (characterId: string) =>
      `/characters/${characterId}/current-map`,
  },

  maps: {
    list: "/maps",
    byId: (mapId: string) => `/maps/${mapId}`,
  },

  autoCombat: {
    onlineCount: "/auto-combat/online-count",
    start: "/auto-combat/start",
    startHunt: "/auto-combat/hunt/start",
    preview: "/auto-combat/preview",
    status: (characterId: string) => `/auto-combat/${characterId}/status`,
    activeAction: (characterId: string) =>
      `/auto-combat/${characterId}/active-action`,
    stop: (characterId: string) => `/auto-combat/${characterId}/stop`,
    stopHunt: (characterId: string) => `/auto-combat/${characterId}/hunt/stop`,
    startBattle: (characterId: string) =>
      `/auto-combat/${characterId}/battle/start`,
  },

  gathering: {
    materials: "/gathering/materials",
    start: "/gathering/start",
    status: (characterId: string) => `/gathering/${characterId}/status`,
    collect: (characterId: string) => `/gathering/${characterId}/collect`,
    stop: (characterId: string) => `/gathering/${characterId}/stop`,
  },

  inventory: {
    byCharacter: (characterId: string) => `/inventory/${characterId}`,
    bank: (characterId: string) => `/inventory/${characterId}/bank`,
    depositToBank: "/inventory/bank/deposit",
    withdrawFromBank: "/inventory/bank/withdraw",
    sellToBlackMarket: "/inventory/black-market/sell",
  },

  equipment: {
    byCharacter: (characterId: string) => `/equipment/${characterId}`,
    equip: "/equipment/equip",
    unequip: "/equipment/unequip",
    reinforce: "/equipment/reinforce",
  },

  pets: {
    byCharacter: (characterId: string) => `/pets/characters/${characterId}`,
    incubations: (characterId: string) =>
      `/pets/characters/${characterId}/incubations`,
    claim: (characterId: string, characterPetId: string) =>
      `/pets/characters/${characterId}/incubations/${characterPetId}/claim`,
  },

  consumables: {
    use: "/consumables/use",
    config: (characterId: string) => `/consumables/${characterId}/config`,
  },

  infirmary: {
    status: (characterId: string) => `/infirmary/${characterId}/status`,
    start: (characterId: string) => `/infirmary/${characterId}/start`,
    claim: (characterId: string) => `/infirmary/${characterId}/claim`,
    cancel: (characterId: string) => `/infirmary/${characterId}/cancel`,
    instant: (characterId: string) => `/infirmary/${characterId}/instant`,
  },

  vendor: {
    shop: (characterId: string) => `/vendor/${characterId}/shop`,
    buy: (characterId: string) => `/vendor/${characterId}/buy`,
  },

  crafting: {
    recipes: (characterId: string) =>
      `/crafting/character/${characterId}/recipes`,
    status: (characterId: string) =>
      `/crafting/character/${characterId}/status`,
    stop: (characterId: string) => `/crafting/character/${characterId}/stop`,
    craft: "/crafting/craft",
  },

  incursions: {
    list: "/incursions",
    available: (characterId: string) => `/incursions/${characterId}/available`,
    status: (characterId: string) => `/incursions/${characterId}/status`,
    start: "/incursions/start",
    claim: "/incursions/claim",
    cancel: (characterId: string) => `/incursions/${characterId}/cancel`,
  },

  worldBosses: {
    available: (characterId: string) =>
      `/world-bosses/${characterId}/available`,
    active: (characterId: string) => `/world-bosses/${characterId}/active`,
    status: (characterId: string) => `/world-bosses/${characterId}/status`,
    join: "/world-bosses/join",
    leave: "/world-bosses/leave",
    leaveByEvent: (eventId: string) => `/world-bosses/${eventId}/leave`,
    ranking: (eventId: string) => `/world-bosses/${eventId}/ranking`,
  },
} as const;
