# Balanceamento de TTK das Ameacas Globais

## Contrato v2

O backend e a unica fonte de verdade da batalha. A inscricao antecipada nao
bloqueia outras atividades. Quando o lobby de 15 minutos termina, somente os
participantes confirmados (`confirmedAt`) entram no snapshot e o backend congela:

- poder e dano por segundo;
- readiness em relacao ao tier do boss;
- tier efetivo e quantidade de pecas equipadas;
- instante do snapshot.

O HP e calculado por `DPS de escala do grupo x TTK alvo`. Trocar equipamento
depois do inicio nao altera a luta atual. Sair remove apenas o DPS futuro do
participante; o HP nao diminui, porque o grupo foi congelado no inicio.

O scheduler consulta eventos ativos a cada segundo e persiste um unico bloco de
dano a cada 5 segundos. O mesmo calculo cobre periodos de indisponibilidade do
frontend, F5, reconexao e pagina fechada. Leituras REST e Socket.IO nao aplicam
dano nem atualizam elegibilidade.

## TTK alvo

| Boss       | 1 jogador | 2 jogadores | 3-5 jogadores | 6-10 jogadores |
| ---------- | --------: | ----------: | ------------: | -------------: |
| Contencao  |    45 min |      35 min |        30 min |         25 min |
| Exterminio |    60 min |      48 min |        40 min |         35 min |

O set atual cumpre o alvo. Um set completo do tier anterior usa readiness
`0,80` e fica 25% mais lento: 56,25 minutos em Contencao solo e 75 minutos em
Exterminio solo. Ambos permanecem abaixo da duracao maxima de 3 horas.

## Cobertura automatica

`npm run balance:world-boss:ttk:report` valida e exporta:

- 20 bosses T1-T10;
- Lutador, Assassino, Atirador e Medico;
- set anterior e set atual;
- 1, 2, 3, 5 e 10 participantes;
- 800 cenarios e 1.603 assercoes de balanceamento.

T1-T5 usam o catalogo real. T6-T10 usam projecao explicita porque esses sets
ainda nao pertencem ao cap jogavel de lancamento.

## Casulos e fragmentos

| Tier | Raridade | Chance de casulo | Vitorias medias | Fragmentos | Horas para casulo | Horas para fragmentos |
| ---- | -------- | ---------------: | --------------: | ---------: | ----------------: | --------------------: |
| T1   | Comum    |               7% |           14,29 |          1 |           65,43 h |               45,80 h |
| T2   | Comum    |               7% |           14,29 |          1 |           65,43 h |               64,12 h |
| T3   | Incomum  |               5% |              20 |        1-2 |           91,60 h |               54,96 h |
| T4   | Incomum  |               5% |              20 |        1-2 |           91,60 h |               73,28 h |
| T5   | Raro     |               4% |              25 |        1-2 |          114,51 h |               91,60 h |

As horas consideram participacao em todas as janelas dos dois bosses do tier,
os 15 minutos de lobby, seus respawns reais e TTK solo com set atual. O casulo continua sendo o gargalo
aleatorio; fragmentos suficientes sao obtidos antes dele. Nao existe pity:
falhar a rolagem entrega os fragmentos garantidos, e ganhar o casulo tambem
entrega esses fragmentos.

## Artefatos

- `_reports/world-boss-ttk/world-boss-ttk-t1-t10.csv`;
- `_reports/world-boss-ttk/world-boss-ttk-t1-t10.json`;
- `_reports/world-boss-ttk/world-boss-rewards-t1-t5.csv`.
