import { ArrowUpRight, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import wikiSearchIcon from "../../assets/images/brand/dead-idle-wiki-search-icon.webp";
import discordIcon from "../../assets/images/brand/discord.webp";
import ncSoftLogo from "../../assets/images/company/nc-soft-logo-horizontal.webp";
import { DISCORD_INVITE_URL } from "../../config/externalLinks";

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

      <nav
        className="company-footer__community"
        aria-label="Comunidade e guias"
      >
        <a
          href={DISCORD_INVITE_URL}
          className="company-footer__community-link"
          target="_blank"
          rel="noreferrer"
        >
          <span className="company-footer__community-icon company-footer__community-icon--discord">
            <img src={discordIcon} alt="" aria-hidden="true" />
          </span>
          <span className="company-footer__community-copy">
            <small>Comunidade e suporte</small>
            <strong>Discord</strong>
          </span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </a>

        <Link to="/wiki" className="company-footer__community-link">
          <span className="company-footer__community-icon company-footer__community-icon--wiki">
            <img src={wikiSearchIcon} alt="" aria-hidden="true" />
          </span>
          <span className="company-footer__community-copy">
            <small>Enciclopédia oficial</small>
            <strong>Dead Idle Wiki</strong>
          </span>
          <ChevronRight size={17} aria-hidden="true" />
        </Link>
      </nav>

      <nav className="company-footer__links" aria-label="Links institucionais">
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
