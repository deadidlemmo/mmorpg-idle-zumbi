import {
  Biohazard,
  BookOpen,
  Box,
  ChevronRight,
  Clock3,
  Coins,
  Egg,
  MapPinned,
  Shield,
  Skull,
  Sparkles,
  Swords,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { getWikiEntity } from "../api/wiki.api";
import { WikiBreadcrumbs } from "../components/WikiBreadcrumbs";
import { WikiEntityCard } from "../components/WikiEntityCard";
import type {
  WikiBossDetail,
  WikiEntityDetail,
  WikiEntityKind,
  WikiItemDetail,
  WikiItemSummary,
  WikiMapDetail,
  WikiMonsterDetail,
  WikiRewardEntry,
} from "../types/wiki.types";
import {
  WIKI_KIND_LABELS,
  formatWikiChance,
  formatWikiDuration,
  formatWikiNumber,
  formatWikiQuantity,
  getOriginLabel,
  getRarityLabel,
  getSlotLabel,
  getWikiEntityImage,
  toWikiRouteSlug,
} from "../utils/wikiFormatters";

const FALLBACK_ICONS = {
  items: Box,
  monsters: Skull,
  maps: MapPinned,
  bosses: Biohazard,
} satisfies Record<WikiEntityKind, typeof Box>;

const STAT_LABELS: Record<string, string> = {
  strength: "Força",
  vitality: "Vitalidade",
  agility: "Agilidade",
  precision: "Precisão",
  technique: "Técnica",
  willpower: "Vontade",
  healFlat: "Cura fixa",
  healPercent: "Cura percentual",
};

const REWARD_LABELS: Record<string, string> = {
  XP: "Experiência",
  GOLD: "Gold",
  CURRENCY: "Moeda",
  MATERIAL: "Material",
  CONSUMABLE: "Consumível",
  EQUIPMENT: "Equipamento",
  ITEM: "Item",
  PET_EGG: "Casulo aleatório",
  WORLD_BOSS_FRAGMENT: "Fragmento de Ameaça",
};

function DetailSection({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="wiki-detail-section">
      <header>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

type InfoTone = "info" | "success" | "warning" | "danger";

function InfoGrid({
  entries,
}: {
  entries: Array<[string, ReactNode, InfoTone?]>;
}) {
  return (
    <dl className="wiki-info-grid">
      {entries.map(([label, value, tone]) => (
        <div key={label} data-tone={tone}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ItemLink({ item, suffix }: { item: WikiItemSummary; suffix?: ReactNode }) {
  const imageUrl = getWikiEntityImage("items", item);
  return (
    <Link className="wiki-row-link" to={`/wiki/items/${item.slug}`}>
      <span className="wiki-row-link__visual">
        {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <Box size={20} aria-hidden="true" />}
      </span>
      <span className="wiki-row-link__copy">
        <strong>{item.name}</strong>
        <small>T{item.tier} · {getRarityLabel(item.rarity)}</small>
      </span>
      {suffix ?? <ChevronRight size={16} aria-hidden="true" />}
    </Link>
  );
}

function RewardList({ rewards }: { rewards: WikiRewardEntry[] }) {
  if (!rewards.length) return <p className="wiki-muted">Nenhuma recompensa disponível.</p>;
  return (
    <div className="wiki-reward-list">
      {rewards.map((reward, index) => {
        const name = reward.item?.name ??
          (reward.randomPetCocoon ? "Casulo aleatório" : REWARD_LABELS[reward.rewardType] ?? reward.currency ?? reward.rewardType);
        const imageUrl = reward.item
          ? getWikiEntityImage("items", reward.item)
          : null;
        const RewardIcon = reward.rewardType === "GOLD"
          ? Coins
          : reward.rewardType === "PET_EGG" || reward.randomPetCocoon
            ? Egg
            : Sparkles;
        return (
          <div key={reward.id ?? `${reward.rewardType}-${index}`}>
            <span className="wiki-reward-list__icon">
              {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <RewardIcon size={18} aria-hidden="true" />}
            </span>
            <span>
              {reward.item ? (
                <Link to={`/wiki/items/${reward.item.slug}`}><strong>{name}</strong></Link>
              ) : (
                <strong>{name}</strong>
              )}
              <small>
                {formatWikiQuantity(reward.minQuantity, reward.maxQuantity)} · {reward.guaranteed ? "Garantido" : formatWikiChance(reward.chance)}
              </small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function getHeroFacts(
  kind: WikiEntityKind,
  entity: WikiEntityDetail,
): Array<[string, ReactNode, InfoTone?]> {
  if (kind === "items") {
    const item = entity as WikiItemDetail;
    return [
      ["Tipo", getSlotLabel(item.slot), "info"],
      ["Classe", item.class?.name ?? "Todas"],
      ["Origem", item.materialOrigin ? getOriginLabel(item.materialOrigin) : "Variável"],
    ];
  }
  if (kind === "monsters") {
    const monster = entity as WikiMonsterDetail;
    return [
      ["HP", formatWikiNumber(monster.hp), "danger"],
      ["Ataque", formatWikiNumber(monster.attack), "warning"],
      ["Mapa", <Link to={`/wiki/maps/${toWikiRouteSlug(monster.map.name)}`}>{monster.map.name}</Link>, "info"],
    ];
  }
  if (kind === "bosses") {
    const boss = entity as WikiBossDetail;
    return [
      ["Duração", formatWikiDuration(boss.durationSeconds), "warning"],
      ["Mapa", <Link to={`/wiki/maps/${toWikiRouteSlug(boss.map.name)}`}>{boss.map.name}</Link>, "info"],
      ["Prêmios", `${boss.rewards.length} possibilidades`, "success"],
    ];
  }
  const map = entity as WikiMapDetail;
  return [
    ["Faixa", `Níveis ${map.minLevel}–${map.maxLevel}`, "info"],
    ["Subáreas", map.subMaps.length],
    ["Ameaças", map.monsters.length + map.bosses.length, "warning"],
  ];
}

function ItemDetailContent({ item }: { item: WikiItemDetail }) {
  const nonZeroStats = Object.entries(item.stats).filter(([, value]) => value !== 0);
  return (
    <>
      <InfoGrid
        entries={[
          ["Família", item.family],
          ["Classe", item.class?.name ?? "Todas"],
          ["Mercado do Abrigo", item.isTradable ? "Pode negociar" : "Não negociável", item.isTradable ? "success" : "warning"],
          ["Venda para NPC", item.isSellable ? "Permitida" : "Bloqueada", item.isSellable ? "success" : "danger"],
          ["Origem", item.materialOrigin ? getOriginLabel(item.materialOrigin) : "Variável", "info"],
        ]}
      />

      {nonZeroStats.length ? (
        <DetailSection title="Efeitos e atributos" eyebrow="Resultado">
          <dl className="wiki-stat-list">
            {nonZeroStats.map(([stat, value]) => (
              <div key={stat}>
                <dt>{STAT_LABELS[stat] ?? stat}</dt>
                <dd>{stat === "healPercent" ? `${value}%` : `+${formatWikiNumber(value)}`}</dd>
              </div>
            ))}
          </dl>
        </DetailSection>
      ) : null}

      <DetailSection title="Onde conseguir" eyebrow="Fontes">
        {item.map ? (
          <Link className="wiki-source-banner" to={`/wiki/maps/${toWikiRouteSlug(item.map.name)}`}>
            <MapPinned size={19} aria-hidden="true" />
            <span><small>Mapa associado</small><strong>{item.map.name}</strong></span>
            <ChevronRight size={17} aria-hidden="true" />
          </Link>
        ) : null}

        {item.monsterDrops.length ? (
          <div className="wiki-source-group">
            <h3>Drop de monstros</h3>
            <div className="wiki-row-list">
              {item.monsterDrops.map((drop) => (
                <Link key={drop.id} className="wiki-row-link" to={`/wiki/monsters/${drop.monster.slug}`}>
                  <span>
                    <strong>{drop.monster.name}</strong>
                    <small>{drop.monster.map.name} · Chance {formatWikiChance(drop.chance)}</small>
                  </span>
                  <b>{formatWikiQuantity(drop.minQuantity, drop.maxQuantity)}</b>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {item.incursions.length ? (
          <div className="wiki-source-group">
            <h3>Incursões</h3>
            <div className="wiki-row-list">
              {item.incursions.map((entry) => (
                <Link key={entry.incursion.id} className="wiki-row-link" to={`/wiki/maps/${toWikiRouteSlug(entry.incursion.map.name)}`}>
                  <span>
                    <strong>{entry.incursion.name}</strong>
                    <small>{entry.incursion.map.name} · {entry.guaranteed ? "Garantido" : formatWikiChance(entry.chance)}</small>
                  </span>
                  <b>{formatWikiQuantity(entry.minQuantity, entry.maxQuantity)}</b>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {item.worldBosses.length ? (
          <div className="wiki-source-group">
            <h3>Ameaças Globais</h3>
            <div className="wiki-row-list">
              {item.worldBosses.map((entry) => (
                <Link key={entry.boss.id} className="wiki-row-link" to={`/wiki/bosses/${entry.boss.slug}`}>
                  <span>
                    <strong>{entry.boss.name}</strong>
                    <small>{entry.guaranteed ? "Garantido" : formatWikiChance(entry.chance)}</small>
                  </span>
                  <b>{formatWikiQuantity(entry.minQuantity, entry.maxQuantity)}</b>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {!item.map && !item.monsterDrops.length && !item.incursions.length && !item.worldBosses.length ? (
          <p className="wiki-muted">Este item não possui uma fonte de obtenção pública vinculada.</p>
        ) : null}
      </DetailSection>

      {item.crafting.outputRecipe || item.crafting.usedInRecipes.length ? (
        <DetailSection title="Criação" eyebrow="Receitas">
          {item.crafting.outputRecipe ? (
            <div className="wiki-source-group">
              <h3>Ingredientes para produzir</h3>
              <div className="wiki-row-list">
                {item.crafting.outputRecipe.ingredients.map((ingredient) => (
                  <ItemLink
                    key={ingredient.item.id}
                    item={ingredient.item}
                    suffix={<b>{ingredient.quantity}x</b>}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {item.crafting.usedInRecipes.length ? (
            <div className="wiki-source-group">
              <h3>Usado para fabricar</h3>
              <div className="wiki-row-list">
                {item.crafting.usedInRecipes.map((recipe) => (
                  <ItemLink
                    key={recipe.outputItem.id}
                    item={recipe.outputItem}
                    suffix={<b>{recipe.quantity}x</b>}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </DetailSection>
      ) : null}

      {item.petDefinitions.length ? (
        <DetailSection title="Uso em pets" eyebrow="Incubação">
          <div className="wiki-info-grid">
            {item.petDefinitions.map((pet) => (
              <div key={pet.id}>
                <dt>{pet.name}</dt>
                <dd>{pet.fragmentCost} fragmentos · {formatWikiNumber(pet.goldCost)} Gold · {formatWikiDuration(pet.incubationSeconds)}</dd>
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}
    </>
  );
}

function MonsterDetailContent({ monster }: { monster: WikiMonsterDetail }) {
  return (
    <>
      <InfoGrid
        entries={[
          ["HP", formatWikiNumber(monster.hp)],
          ["Ataque", formatWikiNumber(monster.attack)],
          ["Defesa", formatWikiNumber(monster.defense)],
          ["Velocidade", formatWikiNumber(monster.speed)],
          ["Ao derrotar", `${formatWikiNumber(monster.xpReward)} XP`, "success"],
        ]}
      />

      {monster.subMaps?.length ? (
        <DetailSection title="Onde encontrar" eyebrow="Subáreas">
          <div className="wiki-chip-list">
            {monster.subMaps.map((subMap) => <span key={subMap.id}>{subMap.name}</span>)}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection title="Possíveis drops" eyebrow="Chance e quantidade">
        {monster.drops.length ? (
          <div className="wiki-drop-grid">
            {monster.drops.map((drop) => (
              <div key={drop.id}>
                <ItemLink item={drop.item} suffix={<b>{formatWikiChance(drop.chance)}</b>} />
                <small>Quantidade: {formatWikiQuantity(drop.minQuantity, drop.maxQuantity)}</small>
              </div>
            ))}
          </div>
        ) : <p className="wiki-muted">Nenhum drop público vinculado.</p>}
      </DetailSection>
    </>
  );
}

function BossDetailContent({ boss }: { boss: WikiBossDetail }) {
  return (
    <>
      <InfoGrid
        entries={[
          ["HP base", formatWikiNumber(boss.baseHp)],
          ["Ataque", formatWikiNumber(boss.attackPower)],
          ["Defesa", formatWikiNumber(boss.defense)],
          ["Resistência", formatWikiNumber(boss.resistance)],
          ["Participação mínima", formatWikiDuration(boss.minParticipationSeconds)],
        ]}
      />

      <DetailSection title="Localização e entrada" eyebrow="Ameaça Global">
        <Link className="wiki-source-banner" to={`/wiki/maps/${toWikiRouteSlug(boss.map.name)}`}>
          <MapPinned size={19} aria-hidden="true" />
          <span><small>Encontrado em</small><strong>{boss.map.name}</strong></span>
          <ChevronRight size={17} aria-hidden="true" />
        </Link>
        <p className="wiki-detail-copy">
          Inscreva-se antes do início. Quando a batalha começar, novas entradas serão bloqueadas.
        </p>
      </DetailSection>

      <DetailSection title="Recompensas" eyebrow="Possíveis prêmios">
        <RewardList rewards={boss.rewards} />
        <p className="wiki-detail-note">
          Alguns prêmios exigem vitória, tempo mínimo ou contribuição suficiente. As chances valem após cumprir esses requisitos.
        </p>
      </DetailSection>
    </>
  );
}

function MapDetailContent({ map }: { map: WikiMapDetail }) {
  return (
    <>
      <InfoGrid
        entries={[
          ["Subáreas", map.subMaps.length],
          ["Monstros", map.monsters.length],
          ["Bosses", map.bosses.length],
          ["Incursões", map.incursions.length],
        ]}
      />

        <DetailSection title="Subáreas" eyebrow="Onde caçar">
        <div className="wiki-submap-list">
          {map.subMaps.map((subMap) => (
            <article key={subMap.id}>
              <header>
                <span>Níveis {subMap.minLevel}–{subMap.maxLevel}</span>
                <h3>{subMap.name}</h3>
                {subMap.description ? <p>{subMap.description}</p> : null}
              </header>
              <div className="wiki-chip-list">
                {subMap.encounters.map((encounter) => (
                  <Link key={encounter.monster.id} to={`/wiki/monsters/${encounter.monster.slug}`}>
                    {encounter.monster.name}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </DetailSection>

      {map.monsters.length ? (
        <DetailSection title="Monstros" eyebrow="Ameaças da região">
          <div className="wiki-entity-grid wiki-entity-grid--featured">
            {map.monsters.map((monster) => (
              <WikiEntityCard key={monster.id} kind="monsters" entity={monster} compact />
            ))}
          </div>
        </DetailSection>
      ) : null}

      {map.bosses.length ? (
        <DetailSection title="Bosses" eyebrow="Ameaças Globais">
          <div className="wiki-entity-grid wiki-entity-grid--featured">
            {map.bosses.map((boss) => (
              <WikiEntityCard key={boss.id} kind="bosses" entity={boss} compact />
            ))}
          </div>
        </DetailSection>
      ) : null}

      {map.incursions.length ? (
        <DetailSection title="Incursões" eyebrow="Atividades da região">
          <div className="wiki-incursion-list">
            {map.incursions.map((incursion) => (
              <article key={incursion.id}>
                <div>
                  <span>T{incursion.tier} · Níveis {incursion.minLevel}–{incursion.maxLevel}</span>
                  <h3>{incursion.name}</h3>
                  {incursion.description ? <p>{incursion.description}</p> : null}
                </div>
                <dl>
                  <div><dt>Custo</dt><dd>{formatWikiNumber(incursion.goldCost)} Gold</dd></div>
                  <div><dt>Duração</dt><dd>{formatWikiDuration(incursion.durationSeconds)}</dd></div>
                  <div><dt>Risco</dt><dd>{incursion.riskLevel}</dd></div>
                </dl>
                <RewardList rewards={incursion.rewards} />
              </article>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {map.items.length ? (
        <DetailSection title="Itens e recursos" eyebrow="Encontrados aqui">
          <div className="wiki-row-list wiki-row-list--columns">
            {map.items.slice(0, 24).map((item) => <ItemLink key={item.id} item={item} />)}
          </div>
          {map.items.length > 24 ? (
            <Link className="wiki-section-action" to={`/wiki/items?mapId=${map.id}`}>
              Ver todos os {map.items.length} itens deste mapa
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ) : null}
        </DetailSection>
      ) : null}
    </>
  );
}

export function WikiDetailPage({ kind }: { kind: WikiEntityKind }) {
  const { slug } = useParams();
  const requestKey = `${kind}:${slug ?? ""}`;
  const [requestState, setRequestState] = useState<{
    key: string;
    entity: WikiEntityDetail | null;
    error: string | null;
  }>({ key: "", entity: null, error: null });
  const labels = WIKI_KIND_LABELS[kind];

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    getWikiEntity(kind, slug, controller.signal)
      .then((entity) =>
        setRequestState({ key: requestKey, entity, error: null }),
      )
      .catch(() => {
        if (!controller.signal.aborted) {
          setRequestState({
            key: requestKey,
            entity: null,
            error: `${labels.singular} não encontrado.`,
          });
        }
      });
    return () => controller.abort();
  }, [kind, labels.singular, requestKey, slug]);

  const entity = requestState.key === requestKey ? requestState.entity : null;
  const error = requestState.key === requestKey ? requestState.error : null;
  const isLoading = requestState.key !== requestKey;

  if (!slug) return <Navigate to={`/wiki/${kind}`} replace />;
  if (isLoading) return <div className="wiki-page"><div className="wiki-state">Carregando detalhes...</div></div>;
  if (error || !entity) {
    return (
      <div className="wiki-page">
        <WikiBreadcrumbs items={[{ label: labels.plural, to: `/wiki/${kind}` }, { label: "Não encontrado" }]} />
        <div className="wiki-state wiki-state--error">
          <strong>{error ?? "Conteúdo não encontrado."}</strong>
          <Link to={`/wiki/${kind}`}>Voltar ao catálogo</Link>
        </div>
      </div>
    );
  }

  const imageUrl = getWikiEntityImage(kind, entity);
  const FallbackIcon = FALLBACK_ICONS[kind];
  const heroFacts = getHeroFacts(kind, entity);

  return (
    <article className="wiki-page wiki-detail-page">
      <WikiBreadcrumbs items={[{ label: labels.plural, to: `/wiki/${kind}` }, { label: entity.name }]} />
      <header className={`wiki-detail-hero wiki-detail-hero--${kind}`}>
        <div className="wiki-detail-hero__visual">
          {imageUrl ? <img src={imageUrl} alt={entity.name} /> : <FallbackIcon size={48} aria-hidden="true" />}
        </div>
        <div className="wiki-detail-hero__copy">
          <span>{labels.singular}</span>
          <h1>{entity.name}</h1>
          <p>{entity.description ?? "Descrição ainda não disponível."}</p>
          <div className="wiki-detail-hero__badges">
            {"tier" in entity ? <span>T{entity.tier}</span> : null}
            {kind === "items" ? <span>{getRarityLabel((entity as WikiItemDetail).rarity)}</span> : null}
            {kind === "monsters" ? <span>Nível {(entity as WikiMonsterDetail).level}</span> : null}
            {kind === "maps" ? <span>Níveis {(entity as WikiMapDetail).minLevel}–{(entity as WikiMapDetail).maxLevel}</span> : null}
            {kind === "bosses" ? <span>Níveis {(entity as WikiBossDetail).minLevel}–{(entity as WikiBossDetail).maxLevel}</span> : null}
          </div>
          <dl className="wiki-detail-hero__facts">
            {heroFacts.map(([label, value, tone]) => (
              <div key={label} data-tone={tone}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="wiki-detail-body">
        {kind === "items" ? <ItemDetailContent item={entity as WikiItemDetail} /> : null}
        {kind === "monsters" ? <MonsterDetailContent monster={entity as WikiMonsterDetail} /> : null}
        {kind === "bosses" ? <BossDetailContent boss={entity as WikiBossDetail} /> : null}
        {kind === "maps" ? <MapDetailContent map={entity as WikiMapDetail} /> : null}
      </div>

      <aside className="wiki-related">
        <span>Próximo passo</span>
        <h2>Continue daqui</h2>
        <div>
          <Link to={`/wiki/${kind}`}><BookOpen size={17} /><strong>Comparar {labels.plural.toLowerCase()}</strong><ChevronRight size={16} /></Link>
          {kind === "monsters" || kind === "bosses" ? (
            <Link to="/wiki/combat"><Swords size={17} /><strong>Como funciona o combate</strong><ChevronRight size={16} /></Link>
          ) : null}
          {kind === "items" ? (
            <Link to="/wiki/systems/mochila-e-banco"><Shield size={17} /><strong>Mochila e banco</strong><ChevronRight size={16} /></Link>
          ) : null}
          {kind === "maps" ? (
            <Link to="/wiki/progression"><Clock3 size={17} /><strong>Progressão por tiers</strong><ChevronRight size={16} /></Link>
          ) : null}
        </div>
      </aside>
    </article>
  );
}
