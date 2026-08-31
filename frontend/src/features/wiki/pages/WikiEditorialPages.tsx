import { BookOpen, ChevronRight, CircleHelp } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { WikiBreadcrumbs } from "../components/WikiBreadcrumbs";
import { WikiSystemArtwork } from "../components/WikiSystemArtwork";
import { WikiSystemGuide } from "../components/WikiSystemGuide";
import {
  COMBAT_PAGE,
  GETTING_STARTED_PAGE,
  PROGRESSION_PAGE,
  WIKI_GUIDES,
  WIKI_SYSTEM_PAGES,
  getSystemPage,
  type WikiEditorialPage,
} from "../content/wikiEditorialContent";

const PRIMARY_ATTRIBUTE_NAMES = new Set([
  "Força",
  "Vitalidade",
  "Agilidade",
  "Precisão",
  "Técnica",
  "Vontade",
]);
const PRIMARY_ATTRIBUTE_PATTERN =
  /(Força|Vitalidade|Agilidade|Precisão|Técnica|Vontade)/g;

function renderEditorialText(text: string) {
  return text.split(PRIMARY_ATTRIBUTE_PATTERN).map((part, index) =>
    PRIMARY_ATTRIBUTE_NAMES.has(part) ? (
      <strong className="wiki-game-attribute" key={`${part}-${index}`}>
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

function EditorialPageView({
  page,
  parent,
}: {
  page: WikiEditorialPage;
  parent?: { label: string; to: string };
}) {
  return (
    <article className="wiki-page wiki-article">
      <WikiBreadcrumbs
        items={[...(parent ? [parent] : []), { label: page.title }]}
      />
      <header className="wiki-article__header">
        <WikiSystemArtwork slug={page.slug} size="header" />
        <div className="wiki-article__header-copy">
          <span>{page.eyebrow}</span>
          <h1>{page.title}</h1>
          <p>{page.summary}</p>
        </div>
      </header>

      <WikiSystemGuide slug={page.slug} />

      <div className="wiki-article__body">
        {page.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{renderEditorialText(paragraph)}</p>
            ))}
            {section.bullets?.length ? (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{renderEditorialText(bullet)}</li>
                ))}
              </ul>
            ) : null}
            {section.links?.length ? (
              <div className="wiki-inline-links">
                {section.links.map((link) => (
                  <Link key={link.to} to={link.to}>
                    {link.label}
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      {page.related.length ? (
        <aside className="wiki-related" aria-labelledby="wiki-related-title">
          <span>Próximo passo</span>
          <h2 id="wiki-related-title">Continue daqui</h2>
          <div>
            {page.related.map((link) => (
              <Link key={link.to} to={link.to}>
                <BookOpen size={17} aria-hidden="true" />
                <strong>{link.label}</strong>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </aside>
      ) : null}
    </article>
  );
}

export function WikiGettingStartedPage() {
  return <EditorialPageView page={GETTING_STARTED_PAGE} />;
}

export function WikiCombatPage() {
  return <EditorialPageView page={COMBAT_PAGE} />;
}

export function WikiProgressionPage() {
  return <EditorialPageView page={PROGRESSION_PAGE} />;
}

export function WikiSystemsPage() {
  return (
    <div className="wiki-page">
      <WikiBreadcrumbs items={[{ label: "Sistemas" }]} />
      <header className="wiki-page-heading">
        <span>Atividades e serviços</span>
        <h1>Sistemas do Dead Idle</h1>
        <p>
          Escolha um sistema para ver como usar, o que consome e o que entrega.
        </p>
      </header>
      <div className="wiki-system-grid">
        {WIKI_SYSTEM_PAGES.map((page) => (
          <Link key={page.slug} to={`/wiki/systems/${page.slug}`}>
            <WikiSystemArtwork slug={page.slug} />
            <span>
              <small>{page.eyebrow}</small>
              <strong>{page.title}</strong>
              <p>{page.summary}</p>
            </span>
            <ChevronRight size={17} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function WikiSystemDetailPage() {
  const { slug } = useParams();
  const page = getSystemPage(slug);
  if (!page) return <Navigate to="/wiki/systems" replace />;
  return (
    <EditorialPageView
      page={page}
      parent={{ label: "Sistemas", to: "/wiki/systems" }}
    />
  );
}

export function WikiGuidesPage() {
  return (
    <div className="wiki-page">
      <WikiBreadcrumbs items={[{ label: "Guias" }]} />
      <header className="wiki-page-heading">
        <span>Respostas rápidas</span>
        <h1>Guias e dúvidas comuns</h1>
        <p>Atalhos para as perguntas que mais interrompem a progressão.</p>
      </header>
      <div className="wiki-guide-list">
        {WIKI_GUIDES.map((guide) => (
          <article key={guide.question}>
            <CircleHelp size={21} aria-hidden="true" />
            <div>
              <h2>{guide.question}</h2>
              <p>{guide.answer}</p>
              <div className="wiki-inline-links">
                {guide.links.map((link) => (
                  <Link key={link.to} to={link.to}>
                    {link.label}
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
