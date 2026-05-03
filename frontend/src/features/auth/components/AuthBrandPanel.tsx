import { GameLogo } from '../../../components/brand/GameLogo';
import { GameTitle } from '../../../components/brand/GameTitle';

export function AuthBrandPanel() {
  return (
    <section className="auth-brand-panel">
      <GameLogo />

      <GameTitle subtitle="Sobreviva ao colapso. Evolua seu personagem, fabrique equipamentos e avance por zonas cada vez mais infectadas." />
    </section>
  );
}