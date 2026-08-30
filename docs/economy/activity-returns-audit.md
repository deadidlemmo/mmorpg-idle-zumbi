# Auditoria de retorno das atividades T1-T5

Esta auditoria mede a economia de `gathering`, `crafting`, incursoes, Ameacas
Globais, missoes, autocombate e venda ao NPC usando as regras canonicas do
backend. A execucao com banco e somente leitura.

## Comandos

```bash
cd backend
npm run economy:audit:activities
npm run economy:audit:activities -- --detailed
npm run economy:audit:activities -- --json
npm run economy:audit:activities:report
```

O comando `:report`:

- consulta catalogo e telemetria dos ultimos 30 dias sem alterar dados;
- falha em modo estrito quando o banco diverge do catalogo canonico;
- grava JSON, CSVs e um resumo Markdown em
  `_reports/economy/activity-returns/`.

## Como os valores sao separados

- **Gold direto bruto/h**: Gold criado pela recompensa da atividade.
- **Valor NPC dos itens/h**: Gold que seria recebido ao liquidar todos os itens
  obtidos no Mercado Negro.
- **Gold bruto equivalente/h**: Gold direto mais valor NPC dos itens.
- **Custo direto/h**: Gold efetivamente removido, como entrada de incursao e
  pocoes.
- **Custo de oportunidade/h**: valor NPC dos ingredientes consumidos.
- **Gold liquido equivalente/h**: bruto equivalente menos os dois custos.
- **XP/h**: XP de personagem e de proficiencia sao apresentados em colunas
  separadas.

O mercado entre jogadores transfere Gold entre contas e nao cria Gold. Precos
de anuncios sao usados apenas para estimar tempo de compra quando existe um set
completo de seis slots no snapshot consultado.

Fragmentos de reforco e fichas de incursao nao possuem preco canonico de venda.
Eles permanecem em unidades esperadas, sem conversao arbitraria para Gold.

## Cenarios calculados

### Autocombate

- quatro classes;
- seis monstros por tier com pesos `42/24/15/9/6/4`;
- set atual, gathering recomendado, sem pet e sem reforco;
- pocao recomendada para o tier;
- XP, drops, valor NPC, consumo de pocoes e chance de derrota.

### Gathering

Para cada tier sao comparados:

- entrada do tier;
- dominio sem afinidade;
- dominio com afinidade de classe.

O relatorio informa unidades/h, valor NPC/h e XP de gathering/h. Gathering nao
gera Gold direto.

### Crafting

Todas as 140 receitas T1-T5 sao medidas em dois modos:

- **bancada**: ingredientes prontos, incluindo o valor que deixaria de ser
  recebido ao vende-los;
- **ciclo autossuficiente**: gathering, farm dos drops, pocoes e tempo de
  criacao ate vender o equipamento ao NPC.

O tempo de drops diferentes considera que eles acumulam simultaneamente no mix
de monstros. O ingrediente de drop mais demorado limita essa parte do ciclo.
Tambem e calculado o tempo de um set de seis pecas para cada classe.

### Incursoes

As duas incursoes de cada tier sao executadas nos modos cauteloso, balanceado e
agressivo. A projecao inclui:

- duracao e tentativas/h;
- entrada debitada no inicio e devolvida integralmente apenas no sucesso;
- chance de sucesso e HP esperado perdido na falha;
- Gold, XP, fichas, fragmentos e itens esperados;
- retorno liquido por tentativa e por hora.

HP perdido nao recebe uma conversao artificial para Gold porque recuperacao
natural, enfermaria e pocoes nao formam um unico preco canonico.

### Ameacas Globais

Os dois slots de cada tier possuem duas leituras:

- **participacao**: retorno durante um evento ativado;
- **calendario**: retorno normalizado pela ativacao, duracao e respawn.

Falha aqui significa o grupo nao derrotar o chefe, nao a morte do personagem.
Enquanto duracao, ativacao, derrota e progresso expirado usam `FALLBACK`, o
resultado serve como estimativa e nao como autorizacao para alterar recompensa.

### Missoes

Todas as missoes diarias, semanais e de historia usam recompensa T1-T5
congelada no momento da atribuicao. Somente atividades do mesmo tier contam
para o objetivo. Para a missao de criacao, a auditoria usa a receita elegivel
de menor custo economico de cada classe, pois o jogador pode escolher qual item
do tier produzir. A taxa por hora usa somente o tempo dedicado, mas continua
marcada como `CAPPED`: nao pode ser extrapolada como farm infinito. Missoes de
historia nao entram na renda diaria recorrente.

### Recompensas recorrentes de missao

| Tier | Derrotar mobs | Criar item | Concluir incursao | Coleta semanal | Gold recorrente/dia |
| ---- | ------------: | ---------: | ----------------: | --------------: | ------------------: |
| T1 | 70 | 110 | 100 | 500 | 351,43 |
| T2 | 140 | 900 | 180 | 1.000 | 1.362,86 |
| T3 | 300 | 3.200 | 350 | 2.200 | 4.164,29 |
| T4 | 550 | 5.000 | 650 | 3.800 | 6.742,86 |
| T5 | 950 | 13.000 | 1.100 | 7.000 | 16.050,00 |

O total diario divide a coleta semanal por sete. XP tambem possui matriz
escalonada e e persistido junto com Gold e tier na atribuicao, evitando alterar
a recompensa quando o personagem sobe de nivel antes do resgate.

### Venda de itens

O catalogo inclui, por tier de aquisicao:

- 12 materiais de gathering;
- 8 materiais do mix de monstros;
- 28 equipamentos criaveis;
- 1 fragmento de reforco;
- 8 casulos de pet.

T2 e T4 reutilizam alguns materiais do tier anterior. Por isso o CSV separa
`tier` de aquisicao de `tierItem`, evitando atribuir um preco diferente ao
mesmo item.

## Linha de base canonica

Valores abaixo usam as configuracoes do checkout, sem telemetria do banco:

| Tier | Autocombate liquido/h | Gathering liquido/h | Crafting autossuficiente/h | Incursao balanceada/h | Ameaca no calendario/h | Missoes liquido/h dedicado |
| ---- | --------------------: | ------------------: | --------------------------: | ---------------------: | ----------------------: | --------------------------: |
| T1 | 768,97 | 300,51 | 58,67 | -9,30 | 38,06 | 328,07 |
| T2 | 853,88 | 536,29 | 17,98 | -26,13 | 79,32 | 320,90 |
| T3 | 914,11 | 1.219,68 | -70,87 | -73,78 | 123,76 | 455,03 |
| T4 | 1.429,00 | 1.821,49 | -65,56 | -146,43 | 171,38 | 702,83 |
| T5 | 2.695,11 | 3.370,08 | -308,00 | -245,30 | 222,22 | 940,15 |

Incursoes entregam XP, fichas e fragmentos que nao estao convertidos para Gold.
O saldo negativo restante e o custo esperado das falhas: equivale a cerca de
`6%` da entrada/h no T1 e `28%` no T5 na abordagem balanceada.

## Tempo de progressao

| Tier | Set autossuficiente | Gold set +3 | Fragmentos set +3 | Horas de incursao para fragmentos | Gold do pet | Horas de calendario para insumos do pet | Incubacao |
| ---- | ------------------: | -----------: | ----------------: | --------------------------------: | ----------: | ---------------------------------------: | --------: |
| T1 | 2,00 h | 1.260 | 132 | 13,95 h | 300 | 860,22 h | 2 h |
| T2 | 8,88 h | 3.360 | 168 | 20,72 h | 750 | 726,74 h | 4 h |
| T3 | 13,64 h | 6.780 | 204 | 23,99 h | 1.600 | 629,12 h | 6 h |
| T4 | 14,43 h | 12.900 | 240 | 32,89 h | 3.000 | 554,62 h | 8 h |
| T5 | 21,30 h | 21.000 | 276 | 43,19 h | 5.000 | 495,89 h | 12 h |

O relatorio de poder de compra tambem calcula, para cada fonte positiva de
renda, as horas necessarias para:

- comprar 100 pocoes recomendadas;
- pagar o reforco das seis pecas ate `+3`;
- pagar a incubacao do pet;
- comprar um set completo observado no mercado, quando disponivel.

Requisitos nao monetarios sao exibidos junto do custo. Fontes com retorno
liquido negativo recebem tempo `N/D` em vez de um numero enganoso.

## Diagnostico atual

- Crafting para venda ao NPC destrói valor de liquidacao em todos os tiers; a
  utilidade principal hoje e progressao/equipamento ou venda entre jogadores.
- Incursoes agora devolvem a entrada no sucesso. A perda esperada cresce com o
  risco do tier, enquanto XP, fichas e fragmentos continuam sendo a recompensa
  principal de progressao.
- Missoes agora escalam T1-T5, contam apenas atividade do tier atribuido e
  permanecem positivas no ciclo dedicado sem poder ser repetidas livremente.
- Ameacas Globais ainda dependem de dados suficientes de eventos validos antes
  de uma decisao final de recompensa.
- O tempo de obtencao dos insumos de pet pelo calendario esta muito alto e e o
  principal gargalo identificado para pets.

## Arquivos gerados

- `activity-economy-audit.json`: relatorio completo e reproduzivel;
- `01_resumo_atividades_por_tier.csv`: comparacao principal;
- `02_gathering.csv`: tres niveis de dominio;
- `03_crafting_receitas.csv`: todas as receitas e insumos;
- `04_incursoes.csv`: risco, custo e recompensa por abordagem;
- `05_ameacas_globais.csv`: participacao e calendario;
- `06_missoes.csv`: objetivo, limite, custo e recompensa;
- `07_venda_equipamentos_materiais.csv`: catalogo e valor NPC;
- `08_poder_de_compra.csv`: horas para cada objetivo de progressao;
- `09_telemetria_observada.csv`: amostras reais do banco consultado;
- `README.md`: resumo executivo do snapshot.
