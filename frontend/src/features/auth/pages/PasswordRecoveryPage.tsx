import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CompanyFooter } from '../../../components/brand/CompanyFooter';
import { Button } from '../../../components/common/Button';
import { FormError } from '../../../components/common/FormError';
import { FormInput } from '../../../components/common/FormInput';
import { AuthBackground } from '../components/AuthBackground';
import { AuthBrandPanel } from '../components/AuthBrandPanel';
import { AuthCard } from '../components/AuthCard';
import { PasswordField } from '../components/PasswordField';
import {
  confirmPasswordReset,
  requestPasswordReset,
} from '../api/auth.api';

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = error as {
      response?: { data?: { message?: string | string[] } };
    };
    const message = response.response?.data?.message;
    if (Array.isArray(message)) return message.join(' ');
    if (typeof message === 'string') return message;
  }

  return 'Nao foi possivel concluir a solicitacao.';
}

function RecoveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBackground>
      <div className="auth-page-layout">
        <div className="auth-stage">
          <AuthBrandPanel />
          <AuthCard>
            <div className="auth-card-content">{children}</div>
          </AuthCard>
        </div>
        <CompanyFooter />
      </div>
    </AuthBackground>
  );
}
export function RecoverPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [developmentToken, setDevelopmentToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await requestPasswordReset(email.trim().toLowerCase());
      setMessage(response.message);
      setDevelopmentToken(response.developmentToken ?? null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <RecoveryLayout>
      <div className="auth-recovery-heading">
        <span className="auth-recovery-kicker">Recuperacao de conta</span>
        <h1>Redefinir senha</h1>
        <p>Informe o e-mail cadastrado para receber um link temporario.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <FormError message={error} />
        {message ? <p className="auth-status-message">{message}</p> : null}
        <FormInput
          id="recovery-email"
          label="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          disabled={isLoading}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isLoading}
          disabled={!email.trim()}
        >
          Enviar link
        </Button>
        {developmentToken ? (
          <Link
            className="auth-development-link"
            to={`/reset-password?token=${developmentToken}`}
          >
            Abrir link local de desenvolvimento
          </Link>
        ) : null}
        <Link className="auth-text-link auth-back-link" to="/">
          Voltar para entrar
        </Link>
      </form>
    </RecoveryLayout>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token')?.trim() ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError('O link de recuperacao nao contem um token valido.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas nao coincidem.');
      return;
    }

    setIsLoading(true);

    try {
      await confirmPasswordReset(token, password);
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <RecoveryLayout>
      <div className="auth-recovery-heading">
        <span className="auth-recovery-kicker">Link verificado</span>
        <h1>Nova senha</h1>
        <p>Defina uma senha com pelo menos oito caracteres, letra e numero.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <FormError message={error} />
        <PasswordField
          id="reset-password"
          label="Nova senha"
          value={password}
          onChange={setPassword}
          placeholder="Digite a nova senha"
        />
        <PasswordField
          id="reset-password-confirm"
          label="Confirmar nova senha"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Repita a nova senha"
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isLoading}
          disabled={
            !token ||
            password.length < 8 ||
            password !== confirmPassword
          }
        >
          Salvar nova senha
        </Button>
      </form>
    </RecoveryLayout>
  );
}
