const DEFAULT_DISCORD_INVITE_URL = "https://discord.gg/vPCB53mwN";

export const DISCORD_INVITE_URL =
  import.meta.env.VITE_DISCORD_URL?.trim() || DEFAULT_DISCORD_INVITE_URL;
