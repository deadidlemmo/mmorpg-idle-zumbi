import ncSoftLogo from '../../assets/images/company/nc-soft-logo-horizontal.png';

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
          <span>
            Estúdio independente de jogos digitais.
          </span>
        </div>
      </div>

      <nav className="company-footer__links" aria-label="Links institucionais">
        <a href="#" className="company-footer__link">
          Suporte
        </a>

        <a href="#" className="company-footer__link">
          Privacidade
        </a>

        <a href="#" className="company-footer__link">
          Termos
        </a>

        <a href="#" className="company-footer__link">
          Contato
        </a>
      </nav>

      <p className="company-footer__copyright">
        © {currentYear} NC Soft. Todos os direitos reservados.
      </p>
    </footer>
  );
}