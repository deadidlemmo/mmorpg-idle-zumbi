import {
  Biohazard,
  BookMarked,
  BookOpen,
  Box,
  ChevronLeft,
  Crosshair,
  FileQuestion,
  Home,
  MapPinned,
  Menu,
  PackageOpen,
  Route,
  Settings,
  Skull,
  type LucideIcon,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { GameLogo } from "../../../components/brand/GameLogo";
import { useAuthStore } from "../../../store/auth.store";
import { WIKI_SYSTEM_PAGES } from "../content/wikiEditorialContent";
import { getWikiSystemPresentation } from "../content/wikiSystemPresentation";
import { WikiSearch } from "./WikiSearch";
import "../styles/wiki.css";

interface WikiNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

interface WikiNavGroup {
  label: string;
  items: WikiNavItem[];
}

const SYSTEM_NAV_ITEMS: WikiNavItem[] = WIKI_SYSTEM_PAGES.map((page) => ({
  label: page.title,
  to: `/wiki/systems/${page.slug}`,
  icon: getWikiSystemPresentation(page.slug)?.icon ?? Settings,
}));

const NAV_GROUPS: WikiNavGroup[] = [
  {
    label: "Aprender",
    items: [
      { label: "Início da Wiki", to: "/wiki", icon: Home, end: true },
      { label: "Começando", to: "/wiki/getting-started", icon: Route },
      { label: "Guias rápidos", to: "/wiki/guides", icon: FileQuestion },
    ],
  },
  {
    label: "Entender o jogo",
    items: [
      { label: "Combate", to: "/wiki/combat", icon: Crosshair },
      { label: "Progressão", to: "/wiki/progression", icon: BookMarked },
    ],
  },
  {
    label: "Sistemas do jogo",
    items: SYSTEM_NAV_ITEMS,
  },
  {
    label: "Consultar",
    items: [
      { label: "Mapas", to: "/wiki/maps", icon: MapPinned },
      { label: "Monstros", to: "/wiki/monsters", icon: Skull },
      { label: "Bosses", to: "/wiki/bosses", icon: Biohazard },
      { label: "Itens", to: "/wiki/items", icon: Box },
      { label: "Recursos", to: "/wiki/resources", icon: PackageOpen },
    ],
  },
];

export function WikiLayout() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  const returnTo = isAuthenticated ? "/characters" : "/";
  const isWikiHome = location.pathname.replace(/\/+$/, "") === "/wiki";

  return (
    <div className="wiki-shell">
      <header className="wiki-mobile-header">
        <button
          type="button"
          onClick={() => setIsMenuOpen(true)}
          aria-label="Abrir navegação da Wiki"
        >
          <Menu size={20} />
        </button>
        <Link to="/wiki" className="wiki-mobile-header__brand">
          <BookOpen size={18} aria-hidden="true" />
          <strong>Dead Idle Wiki</strong>
        </Link>
        <Link to={returnTo} aria-label="Voltar ao jogo">
          <ChevronLeft size={20} />
        </Link>
      </header>

      {isMenuOpen ? (
        <button
          type="button"
          className="wiki-sidebar-backdrop"
          onClick={() => setIsMenuOpen(false)}
          aria-label="Fechar navegação"
        />
      ) : null}

      <aside className={`wiki-sidebar${isMenuOpen ? " is-open" : ""}`}>
        <div className="wiki-sidebar__head">
          <Link className="wiki-brand" to="/wiki" aria-label="Dead Idle Wiki">
            <GameLogo />
            <span>
              <small>Enciclopédia oficial</small>
              <strong>Dead Idle Wiki</strong>
            </span>
          </Link>
          <button
            type="button"
            className="wiki-sidebar__close"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Fechar navegação"
          >
            <X size={19} />
          </button>
        </div>

        <nav className="wiki-sidebar__nav" aria-label="Categorias da Wiki">
          {NAV_GROUPS.map((group) => (
            <div className="wiki-sidebar__group" key={group.label}>
              <span>{group.label}</span>
              <div className="wiki-sidebar__items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end ?? false}
                      className={({ isActive }) =>
                        isActive ? "is-active" : ""
                      }
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <Link className="wiki-sidebar__return" to={returnTo}>
          <ChevronLeft size={17} aria-hidden="true" />
          <span>{isAuthenticated ? "Voltar aos personagens" : "Entrar no jogo"}</span>
        </Link>
      </aside>

      <div className="wiki-main">
        {!isWikiHome ? (
          <header className="wiki-topbar">
            <WikiSearch />
            <Link to={returnTo} className="wiki-topbar__return">
              <ChevronLeft size={16} aria-hidden="true" />
              {isAuthenticated ? "Voltar ao jogo" : "Entrar"}
            </Link>
          </header>
        ) : null}
        <main className="wiki-content">
          <Outlet />
        </main>
        <footer className="wiki-footer">
          <span>Dead Idle Wiki</span>
          <p>Respostas rápidas para continuar progredindo.</p>
        </footer>
      </div>
    </div>
  );
}
