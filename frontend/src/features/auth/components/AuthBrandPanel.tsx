import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GameLogo } from '../../../components/brand/GameLogo';
import { GameTitle } from '../../../components/brand/GameTitle';

export function AuthBrandPanel() {
  return (
    <section className="auth-brand-panel">
      <GameLogo />

      <GameTitle subtitle="Sobreviva ao colapso. Evolua seu personagem, fabrique equipamentos e avance por zonas cada vez mais infectadas." />

      <Link className="auth-wiki-link" to="/wiki">
        <BookOpen size={17} aria-hidden="true" />
        Consultar Wiki
      </Link>
    </section>
  );
}
