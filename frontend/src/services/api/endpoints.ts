export const API_ENDPOINTS = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    me: '/auth/me',
  },

  characters: {
    me: '/characters/me',
    create: '/characters',
    byId: (characterId: string) => `/characters/${characterId}`,
    status: (characterId: string) => `/characters/${characterId}/status`,
    overview: (characterId: string) => `/characters/${characterId}/overview`,
  },

  maps: {
    list: '/maps',
    byId: (mapId: string) => `/maps/${mapId}`,
  },

  autoCombat: {
    start: '/auto-combat/start',
    preview: '/auto-combat/preview',
    status: (characterId: string) => `/auto-combat/${characterId}/status`,
    stop: (characterId: string) => `/auto-combat/${characterId}/stop`,
  },

  gathering: {
    materials: '/gathering/materials',
    start: '/gathering/start',
    status: (characterId: string) => `/gathering/${characterId}/status`,
    collect: (characterId: string) => `/gathering/${characterId}/collect`,
    stop: (characterId: string) => `/gathering/${characterId}/stop`,
  },

  inventory: {
    byCharacter: (characterId: string) => `/inventory/${characterId}`,
  },
} as const;
