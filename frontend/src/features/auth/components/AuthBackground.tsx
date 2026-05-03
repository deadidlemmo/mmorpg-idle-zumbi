import type { ReactNode } from 'react';

interface AuthBackgroundProps {
  children: ReactNode;
}

export function AuthBackground({ children }: AuthBackgroundProps) {
  return (
    <main className="auth-background">
      <div className="auth-glow auth-glow-top" />
      <div className="auth-glow auth-glow-middle" />
      <div className="auth-grid-overlay" />
      {children}
    </main>
  );
}