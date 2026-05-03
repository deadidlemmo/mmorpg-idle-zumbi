import clsx from 'clsx';
import type { AuthTab } from '../types/auth.types';

interface AuthTabsProps {
  activeTab: AuthTab;
  onChange: (tab: AuthTab) => void;
}

export function AuthTabs({ activeTab, onChange }: AuthTabsProps) {
  return (
    <div className="auth-tab-list" role="tablist" aria-label="Autenticação">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'login'}
        className={clsx('auth-tab', activeTab === 'login' && 'is-active')}
        onClick={() => onChange('login')}
      >
        Entrar
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'register'}
        className={clsx('auth-tab', activeTab === 'register' && 'is-active')}
        onClick={() => onChange('register')}
      >
        Criar conta
      </button>
    </div>
  );
}