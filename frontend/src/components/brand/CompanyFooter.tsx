import ncSoftLogo from "../../assets/images/company/nc-soft-logo-horizontal.webp";
import { Link } from "react-router-dom";

const currentYear = new Date().getFullYear();

export function CompanyFooter() {
  const supportUrl = import.meta.env.VITE_DISCORD_URL?.trim();

  return (
    <footer className="company-footer">
      <div className="company-footer__brand">
        <img
          src={ncSoftLogo}
          alt="NC Soft"
          className="company-footer__logo company-footer__logo--horizontal"
        />

        <div className="company-footer__text">
          <span>Estúdio independente de jogos digitais.</span>
        </div>
      </div>

      <nav className="company-footer__links" aria-label="Links institucionais">
        {supportUrl ? (
          <a
            href={supportUrl}
            className="company-footer__link"
            target="_blank"
            rel="noreferrer"
          >
            Suporte
          </a>
        ) : null}

        <Link to="/privacy" className="company-footer__link">
          Privacidade
        </Link>

        <Link to="/terms" className="company-footer__link">
          Termos
        </Link>
      </nav>

      <p className="company-footer__copyright">
        © {currentYear} NC Soft. Todos os direitos reservados.
      </p>
    </footer>
  );
}
