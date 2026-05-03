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

  inventory: {
    byCharacter: (characterId: string) => `/inventory/${characterId}`,
  },

  consumables: {
    use: '/consumables/use',
    config: (characterId: string) => `/consumables/${characterId}/config`,
  },

  autoCombat: {
    start: '/auto-combat/start',
    preview: '/auto-combat/preview',
    status: (characterId: string) => `/auto-combat/${characterId}/status`,
    stop: (characterId: string) => `/auto-combat/${characterId}/stop`,
  },
} as const;