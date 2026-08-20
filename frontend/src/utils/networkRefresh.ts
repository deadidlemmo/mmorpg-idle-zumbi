export function canRunNetworkRefresh(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return false;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  return true;
}
