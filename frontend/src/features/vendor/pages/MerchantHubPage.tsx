import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight, FlaskConical } from 'lucide-react';
import merchantHubArtwork from '../../../assets/images/ui/mercadores-abrigo.webp';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import type { DashboardCharacterViewModel } from '../../dashboard/types/dashboard.types';
import { buildGatheringDashboardCharacter } from '../../gathering/utils/gathering-dashboard-character';
import '../../dashboard/dashboard.css';
import '../../gathering/styles/gathering.css';
import { MERCHANTS, type MerchantDefinition } from '../data/merchants';
import '../styles/vendor.css';

function MerchantCard({
  merchant,
  to,
}: {
  merchant: MerchantDefinition;
  to: string;
}) {
  return (
    <Link
      className="merchant-card"
      to={to}
      aria-label={`Abrir ${merchant.marketName}`}
    >
      <div className="merchant-card__identity">
        <div className="merchant-card__avatar" aria-hidden="true">
          {merchant.portraitUrl ? (
            <img src={merchant.portraitUrl} alt="" />
          ) : (
            <span>{merchant.initials}</span>
          )}
        </div>

        <div className="merchant-card__body">
          <h3>{merchant.marketName}</h3>
          <div className="merchant-card__npc">
            <strong>{merchant.npcName}</strong>
            <span>{merchant.role}</span>
          </div>
        </div>
      </div>

      <div className="merchant-card__offers" aria-label="Itens vendidos">
        {merchant.offers.map((offer) => (
          <div className="merchant-card__offer" key={offer.label}>
            <span className="merchant-card__offer-icon" aria-hidden="true">
              <FlaskConical size={20} strokeWidth={1.8} />
            </span>
            <span className="merchant-card__offer-copy">
              <strong>{offer.label}</strong>
              <small>{offer.description}</small>
            </span>
          </div>
        ))}
      </div>

      <span className="merchant-card__action" aria-hidden="true">
        <span>Abrir loja</span>
        <ArrowRight size={16} />
      </span>
    </Link>
  );
}

export function MerchantHubPage() {
  const { characterId } = useParams();
  const safeCharacterId = characterId ?? '';
  const [character, setCharacter] =
    useState<DashboardCharacterViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCharacter() {
      if (!safeCharacterId) return;

      try {
        setIsLoading(true);
        setErrorMessage(null);
        const overviewResponse = await getCharacterOverview(safeCharacterId);

        if (isMounted) {
          setCharacter(buildGatheringDashboardCharacter(overviewResponse));
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Nao foi possivel carregar os mercadores.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCharacter();

    return () => {
      isMounted = false;
    };
  }, [safeCharacterId]);

  if (!safeCharacterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isLoading && !character) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando mercadores...</span>
      </main>
    );
  }

  if (!character) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar Mercador</h1>
        <p>{errorMessage ?? 'Nao foi possivel carregar este personagem.'}</p>
        <Link to="/characters" className="btn btn-primary">
          Voltar para selecao
        </Link>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <section className="merchant-hub-page gathering-page gathering-page--clean">
        <article
          className="gathering-origin-lore-card gathering-origin-lore-card--npc gathering-origin-npc merchant-hub-hero"
          aria-label="Mercadores do Abrigo"
        >
          <div className="gathering-origin-npc__stage" aria-hidden="true">
            <div className="gathering-origin-npc__portrait merchant-hub-hero__portrait">
              <img src={merchantHubArtwork} alt="" />
            </div>
          </div>

          <div className="gathering-origin-npc__content">
            <div className="gathering-origin-npc__meta">
              <strong className="gathering-origin-npc__name">
                Mercadores
              </strong>
              <span className="gathering-origin-npc__role">
                Comércio do abrigo
              </span>
            </div>

            <h2>Mercadores do Abrigo</h2>
            <blockquote>Toda sobrevivência precisa de troca.</blockquote>
            <p>Compre suprimentos e consumíveis com os comerciantes do abrigo.</p>
          </div>
        </article>

        <section className="merchant-list-panel" aria-label="Lista de mercadores">
          <div className="merchant-list-panel__table-head" aria-hidden="true">
            <span>Mercador</span>
            <span>Especialidade</span>
          </div>

          <div className="merchant-list">
            {MERCHANTS.map((merchant) => (
              <MerchantCard
                key={merchant.id}
                merchant={merchant}
                to={`/dashboard/${safeCharacterId}/consumables/${merchant.routeSegment}`}
              />
            ))}
          </div>
        </section>
      </section>
    </DashboardLayout>
  );
}
