import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/common/Button';
import { FormError } from '../../../components/common/FormError';
import { FormInput } from '../../../components/common/FormInput';
import { useAuthStore } from '../../../store/auth.store';

interface LoginFormProps {
  onCreateAccount: () => void;
}

export function LoginForm({ onCreateAccount }: LoginFormProps) {
  const navigate = useNavigate();

  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    if (!email.trim() || !password.trim()) {
      return;
    }

    await login(email, password);
    navigate('/characters');
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <FormError message={error} />

      <FormInput
        id="login-email"
        label="E-mail"
        type="email"
        placeholder="seuemail@exemplo.com"
        value={email}
        disabled={isLoading}
        autoComplete="email"
        onChange={(event) => setEmail(event.target.value)}
      />

      <div className="stack-sm">
        <div className="auth-inline-row">
          <label htmlFor="login-password" className="form-label">
            Senha
          </label>

          <button
            type="button"
            className="auth-text-link"
            onClick={() => {
              alert('Fluxo de recuperação de senha será implementado depois.');
            }}
          >
            Esqueceu a senha?
          </button>
        </div>

        <input
          id="login-password"
          className="input"
          type="password"
          placeholder="Digite sua senha"
          value={password}
          disabled={isLoading}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        isLoading={isLoading}
        disabled={!email.trim() || !password.trim()}
      >
        Entrar no abrigo
      </Button>

      <p className="auth-footer-action">
        Ainda não tem conta?{' '}
        <button
          type="button"
          className="auth-text-link"
          onClick={onCreateAccount}
          disabled={isLoading}
        >
          Criar conta
        </button>
      </p>
    </form>
  );
}