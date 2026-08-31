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

| Tier | Raridade | Casulo na primeira | Casulo adicional | Fragmentos na primeira | Fragmentos adicionais | Fragmentos/dia ativo | Casulo/dia ativo | Dias casual | Dias ativo |
| ---- | -------- | -------------------: | ----------------: | ---------------------: | ---------------------: | --------------------: | ----------------: | ----------: | ---------: |
| T1   | Comum    |                  18% |             0,18% |                    2-3 |                      1 |                  7,03 |            18,67% |           4 |          4 |
| T2   | Comum    |                  16% |             0,16% |                    3-4 |                      1 |                  8,03 |            16,61% |           4 |          4 |
| T3   | Incomum  |                  14% |             0,14% |                    4-5 |                      1 |                  9,03 |            14,54% |           5 |          5 |
| T4   | Incomum  |                  12% |             0,12% |                    5-6 |                      1 |                 10,03 |            12,48% |           6 |          6 |
| T5   | Raro     |                  10% |             0,10% |                    6-7 |                      1 |                 11,03 |            10,41% |           7 |          7 |

A primeira vitória elegível de cada tier no reset UTC entrega o lote completo de
fragmentos e usa a chance cheia do casulo. Toda vitória elegível seguinte entrega
um fragmento garantido, mantém o Gold integral e usa somente 1% da chance-base
do casulo. O XP permanece integral em T1. Em T2-T5, a primeira vitória elegível
do tier entrega 100% do XP, a segunda 50% e as seguintes 25%. Depois que um
casulo é obtido, novas rolagens daquele tier ficam bloqueadas até o próximo
reset. Ganhar o casulo nunca remove os fragmentos.

O contrato não usa pity: cada reset inicia uma nova sequência independente. A
mediana permanece em 4-7 dias tanto para quem faz uma tentativa diária quanto
para quem participa de todas as janelas. O percentil 90 ativo ficou entre 12 e
21 dias. O limite é aplicado por personagem e tier, dentro da transação que
concede as recompensas.

## Monte Carlo de partidas

`npm run economy:simulate:world-boss:matches:report` executa 400.000 partidas
T1-T5 com seed reproduzível. A amostra combina as quatro classes, os dois bosses
de cada tier, grupos de 1/2/3/5/10 jogadores, set anterior/atual e abandono.
HP, TTK, participação mínima e sorteio de recompensas usam as funções reais do
backend. Nenhum evento ou recompensa é escrito no banco.

O combate permaneceu saudável: grupo confiável venceu 100%, baixa população
venceu aproximadamente 95% e o cenário de 30% de abandono ainda venceu cerca
de 85%. O Gold líquido também ficou dentro do limite de 20% sobre oito horas de
autocombate; T3 foi o ponto mais próximo do teto, com 19,68%.

Já descontando o autocombate interrompido, o impacto diário de XP de quem entra
em todas as janelas ficou em -9,42% no T1, -0,75% no T2, +15,46% no T3,
+34,62% no T4 e +33,93% no T5. Antes da redução progressiva, T4 chegava a
+132,25%. O teto automatizado para o cenário confiável é +40%.

A simulação confirmou cerca de 5,53 vitórias elegíveis por dia para quem
participa de todas as janelas. A política diária impede que isso multiplique o
lote completo: há um lote de 2-7 fragmentos na primeira vitória e um fragmento
em cada vitória seguinte, além de no máximo um casulo por tier a cada reset. Com
a chance reduzida nas janelas adicionais, os 37 critérios do relatório foram
aprovados e a avaliação permaneceu `HEALTHY_WITH_ASSUMPTIONS`.

## Artefatos

- `_reports/world-boss-ttk/world-boss-ttk-t1-t10.csv`;
- `_reports/world-boss-ttk/world-boss-ttk-t1-t10.json`;
- `_reports/world-boss-ttk/world-boss-rewards-t1-t5.csv`.
- `_reports/world-boss-economy/world-boss-match-simulation.json`;
- `_reports/world-boss-economy/01_resumo_por_tier.csv`;
- `_reports/world-boss-economy/02_resumo_por_boss.csv`.
