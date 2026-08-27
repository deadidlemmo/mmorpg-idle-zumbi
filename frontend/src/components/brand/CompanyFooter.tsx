import ncSoftLogo from "../../assets/images/company/nc-soft-logo-horizontal.webp";
import { DISCORD_INVITE_URL } from "../../config/externalLinks";
import { Link } from "react-router-dom";

const currentYear = new Date().getFullYear();

export function CompanyFooter() {
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
        <a
          href={DISCORD_INVITE_URL}
          className="company-footer__link"
          target="_blank"
          rel="noreferrer"
        >
          Suporte
        </a>

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
