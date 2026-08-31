import {
  Backpack,
  CheckCircle2,
  Clock3,
  Coins,
  Crosshair,
  Hammer,
  MapPinned,
  Search,
  ShieldCheck,
  Swords,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import autoCombatIcon from "../../../assets/images/auto-combat/auto-combat-activity-icon.webp";
import huntingIcon from "../../../assets/images/auto-combat/hunting-activity-icon.webp";
import craftingIcon from "../../../assets/images/crafting/skills/crafting.webp";
import assassinClassIcon from "../../../assets/images/classes/class-assassino.webp";
import marksmanClassIcon from "../../../assets/images/classes/class-atirador.webp";
import fighterClassIcon from "../../../assets/images/classes/class-lutador.webp";
import medicClassIcon from "../../../assets/images/classes/class-medico.webp";
import equipmentIcon from "../../../assets/images/items/equipments/lutador/armadura/t01-armadura-de-retalhos-pesados.webp";
import incursionTokenIcon from "../../../assets/images/items/materials/tier-01/incursions/ficha-de-incursao-t1.webp";
import reinforcementT1 from "../../../assets/images/items/materials/tier-01/incursions/fragmento-de-reforco-t1.webp";
import reinforcementT2 from "../../../assets/images/items/materials/tier-02/incursions/fragmento-de-reforco-t2.webp";
import reinforcementT3 from "../../../assets/images/items/materials/tier-03/incursions/fragmento-de-reforco-t3.webp";
import reinforcementT4 from "../../../assets/images/items/materials/tier-04/incursions/fragmento-de-reforco-t4.webp";
import reinforcementT5 from "../../../assets/images/items/materials/tier-05/incursions/fragmento-de-reforco-t5.webp";
import threatFragmentIcon from "../../../assets/images/items/materials/tier-01/world-bosses/fragmento-de-ameaca-t1.webp";
import suburbMap from "../../../assets/images/maps/suburbio-silencioso.webp";
import monsterIcon from "../../../assets/images/mobs/full-body/mob1-t1.webp";
import worldBossIcon from "../../../assets/images/mobs/full-body/mob12-t1.webp";
import petCocoonIcon from "../../../assets/images/pets/cocoons/tier-01/casulo-de-rastreamento-t1.webp";
import petCompanionIcon from "../../../assets/images/pets/companions/tier-01/farejador-do-suburbio-t1.webp";
import statAgility from "../../../assets/images/stats/attributes/stat-agility.webp";
import statPrecision from "../../../assets/images/stats/attributes/stat-precision.webp";
import statStrength from "../../../assets/images/stats/attributes/stat-strength.webp";
import statTechnique from "../../../assets/images/stats/attributes/stat-technique.webp";
import statVitality from "../../../assets/images/stats/attributes/stat-vitality.webp";
import statWillpower from "../../../assets/images/stats/attributes/stat-willpower.webp";
import expIcon from "../../../assets/images/coins/exp.webp";
import { getGatheringOriginIcon } from "../../gathering/constants/gathering-origin-icons";
import { GATHERING_ORIGIN_OPTIONS } from "../../gathering/types/gathering.types";
import {
  WIKI_PET_BONUSES,
  WIKI_PET_TIER_BONUSES,
} from "../content/wikiEditorialContent";

type GuideTone = "green" | "gold" | "blue" | "red" | "purple";

interface GuideStep {
  title: string;
  description: string;
  icon?: LucideIcon;
  imageUrl?: string;
  tone: GuideTone;
}

const STAT_IMAGE_BY_ORIGIN: Record<string, string> = {
  DESMANCHE: statStrength,
  COLETA: statVitality,
  PATRULHA: statAgility,
  ARSENAL: statPrecision,
  TECNOVARREDURA: statTechnique,
  CONTENCAO: statWillpower,
};

const CLASS_IMAGE_BY_NAME: Record<string, string> = {
  Lutador: fighterClassIcon,
  Assassino: assassinClassIcon,
  Atirador: marksmanClassIcon,
  Médico: medicClassIcon,
};

const REINFORCEMENT_IMAGES = [
  reinforcementT1,
  reinforcementT2,
  reinforcementT3,
  reinforcementT4,
  reinforcementT5,
];

const PET_BONUS_IMAGES: Record<string, string | null | undefined> = {
  DESMANCHE: getGatheringOriginIcon("DESMANCHE"),
  COLETA: getGatheringOriginIcon("COLETA"),
  PATRULHA: getGatheringOriginIcon("PATRULHA"),
  ARSENAL: getGatheringOriginIcon("ARSENAL"),
  TECNOVARREDURA: getGatheringOriginIcon("TECNOVARREDURA"),
  CONTENCAO: getGatheringOriginIcon("CONTENCAO"),
  AUTO_COMBAT: autoCombatIcon,
  HUNTING: huntingIcon,
};

function GuideStepVisual({ step }: { step: GuideStep }) {
  const Icon = step.icon;
  return (
    <span
      className="wiki-guide-step__visual"
      data-tone={step.tone}
      aria-hidden="true"
    >
      {step.imageUrl ? (
        <img src={step.imageUrl} alt="" />
      ) : Icon ? (
        <Icon size={24} strokeWidth={1.8} />
      ) : null}
    </span>
  );
}

function FlowGuide({
  eyebrow,
  title,
  steps,
}: {
  eyebrow: string;
  title: string;
  steps: GuideStep[];
}) {
  return (
    <section className="wiki-system-guide" aria-label={title}>
      <header className="wiki-system-guide__heading">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </header>
      <ol className="wiki-guide-flow">
        {steps.map((step, index) => (
          <li key={step.title} data-tone={step.tone}>
            <b>{index + 1}</b>
            <GuideStepVisual step={step} />
            <span>
              <strong>{step.title}</strong>
              <small>{step.description}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AutoCombatGuide() {
  return (
    <>
      <FlowGuide
        eyebrow="Fluxo da atividade"
        title="Do mapa ao loot"
        steps={[
          {
            title: "Escolha a área",
            description: "O mapa define quais ameaças podem aparecer.",
            imageUrl: suburbMap,
            tone: "green",
          },
          {
            title: "Rastreie",
            description: "Cada ciclo adiciona uma ameaça à fila.",
            imageUrl: huntingIcon,
            tone: "blue",
          },
          {
            title: "Escolha o alvo",
            description: "Compare nível, atributos e drops encontrados.",
            imageUrl: monsterIcon,
            tone: "gold",
          },
          {
            title: "Lute sozinho",
            description: "Ataques, poções e recompensas seguem automáticos.",
            imageUrl: autoCombatIcon,
            tone: "red",
          },
        ]}
      />

      <section
        className="wiki-tracking-guide"
        aria-labelledby="wiki-tracking-title"
      >
        <img src={huntingIcon} alt="" />
        <div>
          <span>Rastreio</span>
          <h2 id="wiki-tracking-title">Primeiro encontra, depois combate</h2>
          <p>
            Rastreio prepara a fila de ameaças. Subir essa proficiência encontra
            alvos mais rápido, amplia a fila e melhora a chance de encontros
            raros.
          </p>
        </div>
      </section>
    </>
  );
}

function ExpeditionsGuide() {
  return (
    <section
      className="wiki-system-guide"
      aria-labelledby="wiki-expeditions-title"
    >
      <header className="wiki-system-guide__heading">
        <span>Seis especializações</span>
        <h2 id="wiki-expeditions-title">
          Escolha pelo recurso e pelo atributo
        </h2>
      </header>

      <p className="wiki-expedition-guide__summary">
        Cada nível conquistado concede <strong>+2 no atributo</strong> fornecido
        pela Expedição. As classes indicadas abaixo têm afinidade com ela e
        recebem <strong>+15% de XP</strong> e <strong>+5% de produção</strong>.
      </p>

      <div className="wiki-expedition-grid">
        {GATHERING_ORIGIN_OPTIONS.map((origin) => {
          const originIcon = getGatheringOriginIcon(origin.key);
          const statIcon = STAT_IMAGE_BY_ORIGIN[origin.key];
          return (
            <article key={origin.key}>
              <span className="wiki-expedition-card__icon">
                {originIcon ? <img src={originIcon} alt="" /> : null}
              </span>
              <div>
                <strong>{origin.label}</strong>
                <p>{origin.description}</p>
                <span className="wiki-expedition-card__stat">
                  <img src={statIcon} alt="" />
                  {origin.statLabel}
                </span>
                <span className="wiki-expedition-card__classes">
                  <small>Classes com afinidade</small>
                  {origin.relatedClasses.map((className) => (
                    <span
                      className="wiki-expedition-card__class"
                      key={className}
                    >
                      <img src={CLASS_IMAGE_BY_NAME[className]} alt="" />
                      <em>{className}</em>
                    </span>
                  ))}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CraftingGuide() {
  return (
    <>
      <FlowGuide
        eyebrow="Fluxo da criação"
        title="Da receita à mochila"
        steps={[
          {
            title: "Escolha a receita",
            description: "Veja resultado, tier, tempo e quantidade.",
            imageUrl: craftingIcon,
            tone: "gold",
          },
          {
            title: "Confira os materiais",
            description: "A tela mostra quanto você tem e quanto falta.",
            icon: Search,
            tone: "blue",
          },
          {
            title: "Inicie a produção",
            description: "Os ingredientes são consumidos nesse momento.",
            icon: Hammer,
            tone: "red",
          },
          {
            title: "Receba o item",
            description: "Ao terminar, o item e a XP de Criação são entregues.",
            imageUrl: equipmentIcon,
            tone: "green",
          },
        ]}
      />
    </>
  );
}

function IncursionsGuide() {
  const approaches = [
    {
      name: "Cautelosa",
      copy: "+12 p.p. de sucesso · 80% da recompensa · 25% mais lenta",
      detail: "Menor perda de vida na falha.",
      icon: ShieldCheck,
      tone: "green",
    },
    {
      name: "Equilibrada",
      copy: "Chance, duração e recompensa padrão",
      detail: "Boa opção para a primeira tentativa.",
      icon: Target,
      tone: "blue",
    },
    {
      name: "Agressiva",
      copy: "-15 p.p. de sucesso · 135% da recompensa · 25% mais rápida",
      detail: "Maior perda de vida na falha.",
      icon: Swords,
      tone: "red",
    },
  ] as const;

  return (
    <>
      <FlowGuide
        eyebrow="Fluxo da incursão"
        title="Escolha o risco antes de entrar"
        steps={[
          {
            title: "Escolha a missão",
            description: "Respeite mapa, nível e tier indicados.",
            imageUrl: incursionTokenIcon,
            tone: "purple",
          },
          {
            title: "Defina a abordagem",
            description: "Ela altera chance, tempo, prêmio e dano da falha.",
            icon: Crosshair,
            tone: "blue",
          },
          {
            title: "Aguarde",
            description: "A incursão continua mesmo fora da página.",
            icon: Clock3,
            tone: "gold",
          },
          {
            title: "Resgate",
            description: "O resultado e as recompensas são resolvidos uma vez.",
            icon: Trophy,
            tone: "green",
          },
        ]}
      />

      <section
        className="wiki-approach-guide"
        aria-labelledby="wiki-approaches-title"
      >
        <header className="wiki-system-guide__heading">
          <span>Três abordagens</span>
          <h2 id="wiki-approaches-title">A escolha muda o risco</h2>
        </header>
        <div>
          {approaches.map(({ icon: Icon, ...approach }) => (
            <article key={approach.name} data-tone={approach.tone}>
              <Icon size={21} aria-hidden="true" />
              <strong>{approach.name}</strong>
              <p>{approach.copy}</p>
              <small>{approach.detail}</small>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function WorldBossGuide() {
  return (
    <>
      <FlowGuide
        eyebrow="Evento coletivo"
        title="Da inscrição à recompensa"
        steps={[
          {
            title: "Inscreva-se",
            description: "Esteja no mapa e no nível exigido pelo boss.",
            imageUrl: worldBossIcon,
            tone: "red",
          },
          {
            title: "Continue jogando",
            description: "A inscrição não interrompe sua atividade atual.",
            icon: MapPinned,
            tone: "green",
          },
          {
            title: "Batalha automática",
            description: "Após 15 min de preparação, o grupo é fechado.",
            icon: Swords,
            tone: "gold",
          },
          {
            title: "Receba o resultado",
            description: "A luta e a entrega continuam mesmo se você sair.",
            icon: Trophy,
            tone: "blue",
          },
        ]}
      />

      <section
        className="wiki-world-boss-reward-guide"
        aria-labelledby="wiki-boss-rewards-title"
      >
        <header className="wiki-system-guide__heading">
          <span>Vitórias elegíveis</span>
          <h2 id="wiki-boss-rewards-title">
            O que muda ao repetir no mesmo dia
          </h2>
        </header>
        <div>
          <article>
            <img src={threatFragmentIcon} alt="" />
            <span>
              <strong>Fragmentos</strong>
              <small>Caem em todas as vitórias; após a primeira, cai 1.</small>
            </span>
          </article>
          <article>
            <img src={petCocoonIcon} alt="" />
            <span>
              <strong>Casulo</strong>
              <small>
                Chance normal na primeira; depois fica mínima. Máximo de 1 por
                tier/dia.
              </small>
            </span>
          </article>
          <article>
            <img src={expIcon} alt="" />
            <span>
              <strong>XP</strong>
              <small>
                No T2+, a primeira paga 100%, a segunda 50% e as seguintes 25%.
              </small>
            </span>
          </article>
        </div>
      </section>
    </>
  );
}

function ReinforcementGuide() {
  return (
    <section
      className="wiki-system-guide"
      aria-labelledby="wiki-reinforcement-title"
    >
      <header className="wiki-system-guide__heading">
        <span>Oficina de reforço</span>
        <h2 id="wiki-reinforcement-title">Como levar um equipamento até +3</h2>
      </header>

      <ol className="wiki-reinforcement-steps">
        <li>
          <b>1</b>
          <Trophy size={20} />
          <span>
            <strong>Faça Incursões</strong>
            <small>Ganhe Fragmentos de Reforço do tier da peça.</small>
          </span>
        </li>
        <li>
          <b>2</b>
          <Backpack size={20} />
          <span>
            <strong>Abra Equipamentos</strong>
            <small>Entre no menu Equipamentos do personagem.</small>
          </span>
        </li>
        <li>
          <b>3</b>
          <Target size={20} />
          <span>
            <strong>Selecione a peça</strong>
            <small>Escolha o slot da peça equipada que deseja reforçar.</small>
          </span>
        </li>
        <li>
          <b>4</b>
          <CheckCircle2 size={20} />
          <span>
            <strong>Clique em Reforçar</strong>
            <small>
              Use fragmentos do mesmo tier mais Gold. O reforço é garantido até
              +3.
            </small>
          </span>
        </li>
      </ol>

      <div
        className="wiki-reinforcement-fragments"
        aria-label="Fragmentos de Reforço por tier"
      >
        {REINFORCEMENT_IMAGES.map((imageUrl, index) => (
          <span key={imageUrl}>
            <img src={imageUrl} alt="" />
            <b>T{index + 1}</b>
          </span>
        ))}
      </div>

      <div className="wiki-reinforcement-ladder" aria-label="Níveis de reforço">
        <span>
          <b>+1</b>
          <small>Primeiro ganho</small>
        </span>
        <span>
          <b>+2</b>
          <small>Ganho intermediário</small>
        </span>
        <span>
          <b>+3</b>
          <small>Reforço máximo</small>
        </span>
      </div>
      <p className="wiki-guide-callout">
        <Coins size={16} aria-hidden="true" /> Cada nível custa mais. Uma peça
        +3 pode ser melhor que a peça base do tier seguinte, então compare os
        atributos antes de trocar.
      </p>
    </section>
  );
}

function PetsGuide() {
  return (
    <>
      <FlowGuide
        eyebrow="Como conseguir um pet"
        title="Da Ameaça Global ao companheiro"
        steps={[
          {
            title: "Entre em Ameaças Globais",
            description: "Escolha um boss liberado para seu nível e mapa.",
            imageUrl: worldBossIcon,
            tone: "red",
          },
          {
            title: "Vença o boss",
            description: "Você recebe fragmentos e pode ganhar um casulo.",
            icon: Trophy,
            tone: "gold",
          },
          {
            title: "Abra Pets",
            description:
              "Escolha o casulo e use fragmentos do mesmo tier mais Gold.",
            imageUrl: petCocoonIcon,
            tone: "purple",
          },
          {
            title: "Resgate e equipe",
            description: "Quando a incubação terminar, resgate e equipe o pet.",
            imageUrl: petCompanionIcon,
            tone: "green",
          },
        ]}
      />

      <section
        className="wiki-system-guide wiki-pet-bonus-guide"
        aria-labelledby="wiki-pet-bonuses-title"
      >
        <header className="wiki-system-guide__heading">
          <span>8 especializações</span>
          <h2 id="wiki-pet-bonuses-title">Bônus possíveis</h2>
        </header>
        <p className="wiki-pet-bonus-guide__intro">
          O casulo escolhe a atividade. O tier escolhe a força. Somente o pet
          equipado aplica o bônus.
        </p>

        <div className="wiki-pet-bonus-grid">
          {WIKI_PET_BONUSES.map((bonus) => {
            const imageUrl = PET_BONUS_IMAGES[bonus.key];
            return (
              <article key={bonus.key}>
                {imageUrl ? <img src={imageUrl} alt="" /> : null}
                <span>
                  <strong>{bonus.label}</strong>
                  <small>{bonus.description}</small>
                </span>
              </article>
            );
          })}
        </div>

        <div
          className="wiki-pet-tier-scale"
          aria-label="Força do bônus por tier"
        >
          {WIKI_PET_TIER_BONUSES.map((bonus) => (
            <span key={bonus.tier}>
              <small>T{bonus.tier}</small>
              <b>-{bonus.percent.toLocaleString("pt-BR")}%</b>
            </span>
          ))}
        </div>
      </section>
    </>
  );
}

export function WikiSystemGuide({ slug }: { slug: string }) {
  if (slug === "combate-automatico") return <AutoCombatGuide />;
  if (slug === "expedicoes") return <ExpeditionsGuide />;
  if (slug === "criacao") return <CraftingGuide />;
  if (slug === "incursoes") return <IncursionsGuide />;
  if (slug === "ameacas-globais") return <WorldBossGuide />;
  if (slug === "equipamentos-e-reforco") return <ReinforcementGuide />;
  if (slug === "pets") return <PetsGuide />;
  return null;
}
