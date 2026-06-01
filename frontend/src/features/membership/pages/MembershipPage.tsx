import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  BellRing,
  Boxes,
  Check,
  ChevronUp,
  Clock3,
  Sparkles,
  TicketPercent,
} from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import heroImage from '../../../assets/images/classes/class-lutador.png';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type { DashboardCharacterViewModel } from '../../dashboard/types/dashboard.types';
import { buildGatheringDashboardCharacter } from '../../gathering/utils/gathering-dashboard-character';
import '../styles/membership.css';

type MembershipHighlight = {
  icon: typeof Clock3;
  title: string;
  description: string;
};

type MembershipComparisonSection = {
  title: string;
  rows: Array<{
    label: string;
    free: string;
    premium: string;
  }>;
};

const membershipHighlights: MembershipHighlight[] = [
  {
    icon: Clock3,
    title: 'Mais tempo idle',
    description: 'Janela maior para atividades automáticas quando o jogo ficar aberto ou em segundo plano.',
  },
  {
    icon: BellRing,
    title: 'Avisos melhores',
    description: 'Notificações mais claras para coleta, criação, combate e eventos importantes.',
  },
  {
    icon: Boxes,
    title: 'Mais fôlego no abrigo',
    description: 'Benefícios de conveniência para reduzir atrito sem quebrar a economia.',
  },
  {
    icon: BadgeCheck,
    title: 'Bônus controlados',
    description: 'Vantagens pensadas para acelerar conforto, não para substituir progressão.',
  },
];

const comparisonSections: MembershipComparisonSection[] = [
  {
    title: 'Tempo idle',
    rows: [
      {
        label: 'Atividades em segundo plano',
        free: 'Padrão',
        premium: 'Janela estendida',
      },
      {
        label: 'Personagem alternativo',
        free: 'Limitado',
        premium: 'Mais tempo disponível',
      },
    ],
  },
  {
    title: 'Conveniência',
    rows: [
      {
        label: 'Notificações de atividade',
        free: 'Básicas',
        premium: 'Avançadas',
      },
      {
        label: 'Fila e alertas',
        free: 'Manual',
        premium: 'A definir',
      },
      {
        label: 'Espaço extra',
        free: 'Padrão',
        premium: 'A definir',
      },
    ],
  },
  {
    title: 'Progressão',
    rows: [
      {
        label: 'Bônus de eficiência',
        free: '-',
        premium: 'Leve e controlado',
      },
      {
        label: 'Recompensas diárias',
        free: 'Padrão',
        premium: 'A definir',
      },
    ],
  },
];

function getMembershipPageError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Não foi possível carregar a página Premium.';
}

export function MembershipPage() {
  const { characterId } = useParams();
  const safeCharacterId = characterId ?? '';
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      if (!safeCharacterId) {
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage(null);

        const overviewResponse = await getCharacterOverview(safeCharacterId);

        if (!isMounted) {
          return;
        }

        setCharacter(buildGatheringDashboardCharacter(overviewResponse));
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getMembershipPageError(error));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      isMounted = false;
    };
  }, [safeCharacterId]);

  const includedItems = useMemo(
    () => [
      'Maior limite de atividades idle',
      'Notificações avançadas',
      'Bônus leves de conveniência',
      'Mais espaço para respirar na rotina',
      'Benefícios futuros do abrigo',
      'Sem vantagens finais travadas ainda',
    ],
    [],
  );

  if (!safeCharacterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando Premium...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar Premium</h1>
        <p>{errorMessage ?? 'Não foi possível carregar este personagem.'}</p>
        <Link to="/characters" className="btn btn-primary">
          Voltar para seleção
        </Link>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="membership-page" aria-label="Premium do Abrigo">
        <article className="membership-hero">
          <div className="membership-hero__content">
            <span className="membership-eyebrow">Premium</span>
            <h1>Premium do Abrigo</h1>
            <strong>Mais fôlego para sobreviver.</strong>
            <p>
              Uma assinatura pensada para melhorar conforto, tempo idle e
              organização sem transformar progresso em atalho vazio.
            </p>

            <div className="membership-hero__actions">
              <a href="#membership-plan" className="membership-button">
                Ver plano
              </a>
              <a
                href="#membership-comparison"
                className="membership-button membership-button--ghost"
              >
                Comparar
              </a>
            </div>
          </div>

          <div className="membership-hero__visual" aria-hidden="true">
            <img src={heroImage} alt="" />
          </div>
        </article>

        <section className="membership-announcements" aria-label="Avisos Premium">
          <article className="membership-announcement">
            <TicketPercent size={18} aria-hidden="true" />
            <div>
              <h2>Códigos promocionais</h2>
              <p>Espaço preparado para cupons e campanhas futuras.</p>
            </div>
            <span>Em breve</span>
          </article>

          <article className="membership-announcement">
            <Sparkles size={18} aria-hidden="true" />
            <div>
              <h2>Primeiro mês</h2>
              <p>Oferta inicial será definida junto com as vantagens finais.</p>
            </div>
            <span>A definir</span>
          </article>
        </section>

        <section
          id="membership-plan"
          className="membership-plan"
          aria-label="Plano Premium"
        >
          <div className="membership-plan__copy">
            <span className="membership-eyebrow">Plano</span>
            <h2>Suba o ritmo do abrigo</h2>
            <p>
              A estrutura já está pronta para receber os benefícios finais. Por
              enquanto, a página mostra a proposta de assinatura e a comparação
              de espaços que vamos balancear depois.
            </p>

            <div className="membership-included">
              {includedItems.map((item) => (
                <span key={item}>
                  <Check size={15} aria-hidden="true" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <aside className="membership-price-card" aria-label="Resumo do plano">
            <div className="membership-price-card__tabs">
              <span className="is-active">Assinatura</span>
              <span>Item</span>
            </div>

            <strong>Preço a definir</strong>
            <p>Mensalidade e vantagens serão fechadas na próxima etapa.</p>
            <button type="button" disabled>
              Compra em breve
            </button>
            <small>
              O pagamento ainda não está ativo. Esta tela prepara a experiência
              visual do Premium.
            </small>
          </aside>
        </section>

        <section
          id="membership-comparison"
          className="membership-comparison"
          aria-label="Comparação entre gratuito e premium"
        >
          <div className="membership-comparison__header">
            <span />
            <strong>Gratuito</strong>
            <strong>Premium</strong>
          </div>

          {comparisonSections.map((section) => (
            <div className="membership-comparison__section" key={section.title}>
              <h2>{section.title}</h2>

              {section.rows.map((row) => (
                <div className="membership-comparison__row" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.free}</strong>
                  <strong>
                    {row.premium}
                    <ChevronUp size={13} aria-hidden="true" />
                  </strong>
                </div>
              ))}
            </div>
          ))}
        </section>

        <section className="membership-notes" aria-label="Próximos passos">
          {membershipHighlights.map((highlight) => {
            const Icon = highlight.icon;

            return (
              <article key={highlight.title}>
                <Icon size={20} aria-hidden="true" />
                <h2>{highlight.title}</h2>
                <p>{highlight.description}</p>
              </article>
            );
          })}
        </section>
      </section>
    </DashboardLayout>
  );
}
