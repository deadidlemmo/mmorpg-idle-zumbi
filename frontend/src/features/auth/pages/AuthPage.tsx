import { useState } from 'react';
import { CompanyFooter } from '../../../components/brand/CompanyFooter';
import { AuthBackground } from '../components/AuthBackground';
import { AuthBrandPanel } from '../components/AuthBrandPanel';
import { AuthCard } from '../components/AuthCard';
import { AuthTabs } from '../components/AuthTabs';
import { LoginForm } from '../components/LoginForm';
import { RegisterForm } from '../components/RegisterForm';
import type { AuthTab } from '../types/auth.types';

export function AuthPage() {
  const [activeTab, setActiveTab] = useState<AuthTab>('login');

  return (
    <AuthBackground>
      <div className="auth-page-layout">
        <div className="auth-stage">
          <AuthBrandPanel />

          <AuthCard>
            <AuthTabs activeTab={activeTab} onChange={setActiveTab} />

            <div className="auth-card-content">
              {activeTab === 'login' ? (
                <LoginForm onCreateAccount={() => setActiveTab('register')} />
              ) : (
                <RegisterForm onBackToLogin={() => setActiveTab('login')} />
              )}
            </div>
          </AuthCard>
        </div>

        <CompanyFooter />
      </div>
    </AuthBackground>
  );
}