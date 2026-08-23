const AUTH_TOKEN_KEY = 'dead_idle_access_token';
const AUTH_SESSION_EXPIRED_EVENT = 'dead-idle:auth-session-expired';

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function removeAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function expireAuthSession(): void {
  removeAuthToken();
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
}

export function subscribeToAuthSessionExpired(
  listener: () => void,
): () => void {
  const handleExpired = () => listener();

  window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpired);

  return () => {
    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpired);
  };
}

export { AUTH_TOKEN_KEY };

