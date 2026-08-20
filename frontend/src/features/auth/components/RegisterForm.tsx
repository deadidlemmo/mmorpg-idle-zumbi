import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../../components/common/Button";
import { FormError } from "../../../components/common/FormError";
import { FormInput } from "../../../components/common/FormInput";
import { useAuthStore } from "../../../store/auth.store";
import { PasswordField } from "./PasswordField";

interface RegisterFormProps {
  onBackToLogin: () => void;
}

export function RegisterForm({ onBackToLogin }: RegisterFormProps) {
  const navigate = useNavigate();

  const { register, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  const passwordsDoNotMatch =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password !== confirmPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      return;
    }

    if (password.length < 8) {
      return;
    }

    if (password !== confirmPassword) {
      return;
    }

    await register(email, password, acceptTerms, acceptPrivacy);
    navigate("/characters");
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <FormError message={error} />

      <FormInput
        id="register-email"
        label="E-mail"
        type="email"
        placeholder="seuemail@exemplo.com"
        value={email}
        disabled={isLoading}
        autoComplete="email"
        onChange={(event) => setEmail(event.target.value)}
      />

      <PasswordField
        id="register-password"
        label="Senha"
        value={password}
        onChange={setPassword}
        placeholder="Crie uma senha"
        error={
          password.length > 0 && password.length < 8
            ? "A senha precisa ter pelo menos 8 caracteres."
            : null
        }
      />

      <PasswordField
        id="register-confirm-password"
        label="Confirmar senha"
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Repita sua senha"
        error={passwordsDoNotMatch ? "As senhas não coincidem." : null}
      />

      <label className="auth-consent-row">
        <input
          type="checkbox"
          checked={acceptTerms}
          disabled={isLoading}
          onChange={(event) => setAcceptTerms(event.target.checked)}
        />
        <span>
          Li e aceito os <Link to="/terms">Termos de Uso</Link>.
        </span>
      </label>

      <label className="auth-consent-row">
        <input
          type="checkbox"
          checked={acceptPrivacy}
          disabled={isLoading}
          onChange={(event) => setAcceptPrivacy(event.target.checked)}
        />
        <span>
          Li e aceito a <Link to="/privacy">Politica de Privacidade</Link>.
        </span>
      </label>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        isLoading={isLoading}
        disabled={
          !email.trim() ||
          !password.trim() ||
          !confirmPassword.trim() ||
          password.length < 8 ||
          passwordsDoNotMatch ||
          !acceptTerms ||
          !acceptPrivacy
        }
      >
        Criar conta
      </Button>

      <p className="auth-footer-action">
        Já tem conta?{" "}
        <button
          type="button"
          className="auth-text-link"
          onClick={onBackToLogin}
          disabled={isLoading}
        >
          Entrar
        </button>
      </p>
    </form>
  );
}
