import { useEffect } from 'react';
import { AppRoutes } from './app/routes';
import { TopIdleLoginPrompt } from './features/membership/TopIdleLoginPrompt';
import { subscribeToAuthSessionExpired } from './services/api/authToken';
import { useAuthStore } from './store/auth.store';

function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => subscribeToAuthSessionExpired(logout), [logout]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (!isInitialized) {
    return (
      <main className="dashboard-loading" aria-live="polite">
        <div className="loading-spinner" />
        <span>Validando sessao...</span>
      </main>
    );
  }

  return (
    <>
      <AppRoutes />
      <TopIdleLoginPrompt />
    </>
  );
}

export default App;
