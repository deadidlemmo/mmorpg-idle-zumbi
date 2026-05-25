export const API_ENDPOINTS = {
  auth: {
    login: "/auth/login",
    register: "/auth/register",
    me: "/auth/me",
  },

  characters: {
    me: "/characters/me",
    create: "/characters",
    byId: (characterId: string) => `/characters/${characterId}`,
    status: (characterId: string) => `/characters/${characterId}/status`,
    overview: (characterId: string) => `/characters/${characterId}/overview`,
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
    preview: "/auto-combat/preview",
    status: (characterId: string) => `/auto-combat/${characterId}/status`,
    stop: (characterId: string) => `/auto-combat/${characterId}/stop`,
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
  },

  equipment: {
    byCharacter: (characterId: string) => `/equipment/${characterId}`,
    equip: "/equipment/equip",
    unequip: "/equipment/unequip",
  },

  consumables: {
    use: "/consumables/use",
    config: (characterId: string) => `/consumables/${characterId}/config`,
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
