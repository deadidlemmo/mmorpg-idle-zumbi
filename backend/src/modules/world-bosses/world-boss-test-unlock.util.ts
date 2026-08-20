export function isWorldBossTestUnlockEnabled(
  value?: string,
  nodeEnv?: string,
): boolean {
  return (
    nodeEnv?.trim().toLowerCase() !== 'production' &&
    value?.trim().toLowerCase() === 'true'
  );
}
