import {
  Biohazard,
  BookOpen,
  Box,
  ChevronRight,
  Compass,
  Crosshair,
  MapPinned,
  Route,
  Search,
  Settings,
  ShieldCheck,
  Skull,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getWikiSummary } from "../api/wiki.api";
import { WikiEntityCard } from "../components/WikiEntityCard";
import { WikiSearch } from "../components/WikiSearch";
import { WIKI_SYSTEM_PAGES } from "../content/wikiEditorialContent";
import type { WikiSummaryResponse } from "../types/wiki.types";
import { formatWikiNumber } from "../utils/wikiFormatters";

const CATEGORIES = [
  {
    label: "Começando",
    description: "Primeiros passos em uma ordem clara.",
    to: "/wiki/getting-started",
    icon: Route,
  },
  {
    label: "Sistemas",
    description: "Entenda cada atividade e serviço.",
    to: "/wiki/systems",
    icon: Settings,
  },
  {
    label: "Itens",
    description: "Origem, uso, atributos e receitas.",
    to: "/wiki/items",
    icon: Box,
  },
  {
    label: "Monstros",
    description: "Atributos, mapas e tabelas de drop.",
    to: "/wiki/monsters",
    icon: Skull,
  },
  {
    label: "Bosses",
    description: "Ameaças Globais e recompensas.",
    to: "/wiki/bosses",
    icon: Biohazard,
  },
  {
    label: "Mapas",
    description: "Regiões, subáreas e desbloqueios.",
    to: "/wiki/maps",
    icon: MapPinned,
  },
  {
    label: "Combate",
    description: "Dano, defesa, atributos e derrota.",
    to: "/wiki/combat",
    icon: Crosshair,
  },
  {
    label: "Progressão",
    description: "Níveis, tiers e rota de evolução.",
    to: "/wiki/progression",
    icon: BookOpen,
  },
] as const;

const INTENT_LINKS = [
  {
    label: "Estou começando",
    description: "Siga a primeira rota sem pular etapas.",
    to: "/wiki/getting-started",
    icon: Compass,
    tone: "success",
  },
  {
    label: "Quero achar um item",
    description: "Veja onde cai e para que serve.",
    to: "/wiki/items",
    icon: Search,
    tone: "info",
  },
  {
    label: "Quero ficar mais forte",
    description: "Revise nível, tier e equipamento.",
    to: "/wiki/progression",
    icon: ShieldCheck,
    tone: "warning",
  },
  {
    label: "Quero enfrentar um boss",
    description: "Confira nível, mapa e recompensas.",
    to: "/wiki/bosses",
    icon: Biohazard,
    tone: "danger",
  },
] as const;

export function WikiHomePage() {
  const [summary, setSummary] = useState<WikiSummaryResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getWikiSummary(controller.signal).then(setSummary).catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <div className="wiki-page wiki-home">
      <section className="wiki-home-search" aria-labelledby="wiki-home-title">
        <div className="wiki-home-search__copy">
          <span>Central de conhecimento oficial</span>
          <h1 id="wiki-home-title">Dead Idle Wiki</h1>
          <p>Descubra o que fazer, onde encontrar e como cada sistema se conecta.</p>
        </div>
        <WikiSearch large />
        {summary ? (
          <div className="wiki-home-search__stats" aria-label="Conteúdo disponível">
            <span><strong>{formatWikiNumber(summary.counts.items)}</strong> itens</span>
            <span><strong>{formatWikiNumber(summary.counts.monsters)}</strong> monstros</span>
            <span><strong>{formatWikiNumber(summary.counts.bosses)}</strong> bosses</span>
            <span><strong>{formatWikiNumber(summary.counts.maps)}</strong> mapas</span>
          </div>
        ) : null}
      </section>

      <section className="wiki-section wiki-intent-section" aria-labelledby="wiki-intent-title">
        <div className="wiki-section__heading">
          <div>
            <span>Atalhos rápidos</span>
            <h2 id="wiki-intent-title">O que você quer fazer?</h2>
          </div>
        </div>
        <div className="wiki-intent-grid">
          {INTENT_LINKS.map(({ icon: Icon, ...intent }) => (
            <Link
              key={intent.to}
              className="wiki-intent-link"
              data-tone={intent.tone}
              to={intent.to}
            >
              <Icon size={20} aria-hidden="true" />
              <span>
                <strong>{intent.label}</strong>
                <small>{intent.description}</small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="wiki-section" aria-labelledby="wiki-categories-title">
        <div className="wiki-section__heading">
          <div>
            <span>Consulte por categoria</span>
            <h2 id="wiki-categories-title">Encontre uma resposta</h2>
          </div>
        </div>
        <div className="wiki-category-grid">
          {CATEGORIES.map(({ icon: Icon, ...category }) => (
            <Link key={category.to} className="wiki-category-link" to={category.to}>
              <Icon size={22} aria-hidden="true" />
              <span>
                <strong>{category.label}</strong>
                <small>{category.description}</small>
              </span>
              <ChevronRight size={17} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="wiki-section" aria-labelledby="wiki-systems-title">
        <div className="wiki-section__heading">
          <div>
            <span>Operação do abrigo</span>
            <h2 id="wiki-systems-title">Sistemas importantes</h2>
          </div>
          <Link to="/wiki/systems">Ver todos</Link>
        </div>
        <div className="wiki-link-list wiki-link-list--columns">
          {WIKI_SYSTEM_PAGES.slice(0, 8).map((page) => (
            <Link key={page.slug} to={`/wiki/systems/${page.slug}`}>
              <span>
                <strong>{page.title}</strong>
                <small>{page.summary}</small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      {summary?.maps.length ? (
        <section className="wiki-section" aria-labelledby="wiki-maps-highlight-title">
          <div className="wiki-section__heading">
            <div>
              <span>Explore o mundo</span>
              <h2 id="wiki-maps-highlight-title">Regiões de progressão</h2>
            </div>
            <Link to="/wiki/maps">Todos os mapas</Link>
          </div>
          <div className="wiki-entity-grid wiki-entity-grid--featured">
            {summary.maps.slice(0, 5).map((map) => (
              <WikiEntityCard key={map.id} kind="maps" entity={map} compact />
            ))}
          </div>
        </section>
      ) : null}

      {summary?.featuredBosses.length ? (
        <section className="wiki-section" aria-labelledby="wiki-bosses-highlight-title">
          <div className="wiki-section__heading">
            <div>
              <span>Conheça as ameaças</span>
              <h2 id="wiki-bosses-highlight-title">Bosses por tier</h2>
            </div>
            <Link to="/wiki/bosses">Todos os bosses</Link>
          </div>
          <div className="wiki-entity-grid wiki-entity-grid--featured">
            {summary.featuredBosses.map((boss) => (
              <WikiEntityCard key={boss.id} kind="bosses" entity={boss} compact />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
