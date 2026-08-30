# Simulador economico T1-T5

O simulador T1-T5 audita a economia atual sem consultar ou alterar o banco de
dados. Ele usa diretamente os seeds e as funcoes de balanceamento do backend.

## Comandos

```bash
cd backend
npm run economy:simulate:t1-t5
npm run economy:simulate:t1-t5 -- --detailed
npm run economy:simulate:t1-t5 -- --json
npm run economy:simulate:t1-t5:validate
```

Para detalhar os seis mobs e cada item vendido ao NPC, use a
[auditoria de drops vendidos ao mercador](./vendor-drop-audit.md).

Para comparar o retorno completo de gathering, crafting, incursoes, Ameacas
Globais, missoes, venda de itens e tempo de progressao, use a
[auditoria de retorno das atividades T1-T5](./activity-returns-audit.md).

Para sincronizar apenas os drops T2/T4/T5 no banco, sem reaplicar o seed inteiro:

```bash
npm run prisma:sync-auto-combat-drop-economy
npm run prisma:sync-auto-combat-drop-economy:apply
```

O primeiro comando e somente leitura. O segundo atualiza todos os drops
planejados em uma unica transacao serializavel.

Para sincronizar somente o catalogo canonico de pocoes:

```bash
npm run prisma:sync-potion-economy
npm run prisma:sync-potion-economy:apply
```

O modo `--apply` cria a nova pocao T2 e atualiza cura/faixa das demais sem
alterar inventarios, Gold ou configuracoes de pocao dos personagens.

O comando normal sempre gera o diagnostico. A variante `:validate` retorna
erro enquanto houver alertas economicos e pode ser usada em CI depois que as
metas de balanceamento forem atingidas.

## Fontes usadas

- Matriz de autocombate T1-T5 com os seis mobs calculados individualmente para
  as quatro classes, gathering recomendado, sem pet, sem reforco e pocao
  recomendada.
- Pesos reais de encontro `42/24/15/9/6/4`.
- Chances e quantidades dos drops canonicos, separadas por inicio, meio e fim.
- Mesma funcao de preco usada pelo Mercado Negro.
- Taxas reais de gathering por tier e proficiencia.
- Custos de reforco, incubacao, incursoes e pocoes.
- Recompensas de missoes, incursoes e Ameacas Globais.
- Crafting sem taxa direta de Gold, igual ao servico atual.
- Mercado entre jogadores classificado como transferencia, nao fonte ou
  sumidouro de Gold.

## Saida

Para cada tier, o relatorio informa:

- Gold e unidades esperadas por abate;
- abates, pocoes, Gold bruto e Gold liquido por hora;
- nome, rank, peso, faixa, cura, preco, quantidade usada e custo de pocao por
  abate em cada classe/monstro com `--detailed`;
- comparacao entre set atual, anterior e dois tiers abaixo;
- resultado agregado por posicao e detalhamento opcional por classe;
- venda de gathering no nivel inicial e com proficiencia/afinidade maximas;
- custo de oportunidade do crafting;
- custos de reforco e incubacao;
- retorno direto esperado das incursoes;
- recompensa media de Gold da Ameaca Global.

## Calibracao atual de drops

T2 e T4 compartilham materiais com a faixa de raridade anterior. Para nao
duplicar itens nem quebrar receitas existentes, o rendimento cresce conforme a
posicao do mob:

- T2: `2x` no inicio, `3x` no meio e `4.5x` no fim;
- T4: `2x` no inicio, `2.5x` no meio e `3.4x` no fim.
- T5: `1.3x` uniforme para sustentar os custos do fim do lancamento.

Esses multiplicadores alteram chance e quantidade dos drops canonicos. Eles nao
alteram preco de venda do NPC, preco ou cura das pocoes e regras de combate.

Residuos usam `55%` do valor NPC normal da faixa, arredondado por unidade. A
regra reduz a conversao direta em Gold sem diminuir a disponibilidade do
material no crafting: os valores T1, T3 e T5 sao `2`, `9` e `32` Gold.

A curva agregada resultante com set atual, depois da calibracao de pocoes, e:

| Tier | Gold esperado/abate | Custo de pocoes | Gold liquido/h |
| ---- | ------------------: | ---------------: | -------------: |
| T1   |              4.0155 |            2.05% |         768.97 |
| T2   |              9.8859 |            5.98% |         853.88 |
| T3   |             18.4990 |           20.20% |         914.11 |
| T4   |             42.4941 |           20.64% |       1.429,00 |
| T5   |             91.3438 |           23.84% |       2.695,11 |

O relatorio fica `HEALTHY`: todas as quatro classes sobrevivem e mantem Gold
liquido positivo com set atual em inicio, meio e fim. O set anterior usa pelo
menos `3x` e `+3` pocoes por 100 abates; no fim do tier ele morre ou opera com
Gold liquido negativo. Dois tiers abaixo continuam insustentaveis.

## Regra de pocoes

Metas de custo sobre o Gold bruto:

- T1: `2-5%`;
- T2: `5-10%`;
- T3-T5: `12-25%`.

Catalogo recomendado por faixa:

| Faixa | Pocao | Cura base | Preco |
| ----- | ----- | --------: | ----: |
| T1 | Poção de Vida Menor | `40` | `55` Gold |
| T2 | Poção de Vida Leve | `100 + 4% HP` | `55` Gold |
| T3-T4 | Poção de Vida | `120 + 6% HP` | `55` Gold |
| T5-T6 | Poção de Vida Maior | `300 + 18% HP` | `180` Gold |
| T7-T8 | Poção de Vida Superior | `450 + 24% HP` | `420` Gold |
| T9-T10 | Poção de Vida Suprema | `650 + 32% HP` | `900` Gold |

A cura efetiva exibida no detalhamento considera HP maximo e o multiplicador
da classe. O cenario `CURRENT_TIER` seleciona a pocao cuja faixa `minTier` /
`maxTier` contem o tier simulado; uma regressao cobre T1-T5.

`minTier` e validado pelo backend no catalogo e compra do mercador, na
configuracao, no uso fora de combate e na criacao do estado de pocao dos
combates manual e automatico.

Pocoes de tiers anteriores continuam utilizaveis em conteudo superior. Apenas
o uso antecipado de uma pocao cujo `minTier` ainda nao foi desbloqueado e
bloqueado.

O teste de regressao reconcilia o Gold bruto deste simulador com a auditoria de
drops. A diferenca maxima aceita e `0,02` Gold/h, causada apenas por
arredondamento de exibicao.
