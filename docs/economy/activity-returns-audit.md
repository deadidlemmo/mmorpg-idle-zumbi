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
- entrada debitada no inicio, devolvida em 100% no sucesso e 90% na falha;
- chance de sucesso e HP esperado perdido na falha;
- Gold, XP, fichas, fragmentos e itens esperados;
- Gold da carteira e retorno liquido apos recuperar o HP;
- retorno por tentativa e por hora.

O custo esperado de recuperação usa proporcionalmente a cura e o preço da
poção canônica do tier. Recuperação natural e enfermaria não são usadas para
reduzir artificialmente esse custo.

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
| ---- | ------------: | ---------: | ----------------: | -------------: | ------------------: |
| T1   |            70 |        110 |               100 |            500 |              351,43 |
| T2   |           140 |        900 |               180 |          1.000 |            1.362,86 |
| T3   |           300 |      3.200 |               350 |          2.200 |            4.164,29 |
| T4   |           550 |      5.000 |               650 |          3.800 |            6.742,86 |
| T5   |           950 |     13.000 |             1.100 |          7.000 |           16.050,00 |

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
| ---- | --------------------: | ------------------: | -------------------------: | --------------------: | ---------------------: | -------------------------: |
| T1   |                773,14 |              300,51 |                      58,73 |                 17,43 |                  54,61 |                     339,90 |
| T2   |                853,88 |              536,29 |                      17,98 |                 36,77 |                 113,74 |                     337,19 |
| T3   |                914,11 |            1.219,68 |                     116,36 |                 49,16 |                 177,60 |                     635,05 |
| T4   |              1.429,00 |            1.821,49 |                     252,95 |                 55,46 |                 245,94 |                     975,70 |
| T5   |              2.695,11 |            3.370,08 |                     232,89 |                 57,79 |                 319,20 |                   1.456,84 |

O retorno líquido da incursão já desconta a recuperação esperada de HP. Fichas
e fragmentos continuam sem conversão arbitrária para Gold e suas quantidades
não foram aumentadas.

| Tier | XP incursão balanceada/h | % do autocombate | Gold líquido da incursão/h | % do autocombate |
| ---- | -----------------------: | ---------------: | -------------------------: | ---------------: |
| T1   |                 1.184,90 |            65,1% |                      17,43 |             2,3% |
| T2   |                   926,10 |            65,3% |                      36,77 |             4,3% |
| T3   |                 1.109,15 |            64,9% |                      49,16 |             5,4% |
| T4   |                 1.233,30 |            65,0% |                      55,46 |             3,9% |
| T5   |                 1.732,12 |            65,0% |                      57,79 |             2,1% |

## Tempo de progressao

| Tier | Set autossuficiente | Gold set +3 | Fragmentos set +3 | Horas de incursao para fragmentos | Gold do pet | Horas de calendario para insumos do pet | Incubacao |
| ---- | ------------------: | ----------: | ----------------: | --------------------------------: | ----------: | --------------------------------------: | --------: |
| T1   |              2,00 h |       1.260 |               132 |                           13,95 h |         300 |                                133,33 h |       2 h |
| T2   |              8,88 h |       3.360 |               168 |                           20,72 h |         750 |                                150,00 h |       4 h |
| T3   |             13,64 h |       6.780 |               204 |                           23,99 h |       1.600 |                                171,43 h |       6 h |
| T4   |             14,43 h |      12.900 |               240 |                           32,89 h |       3.000 |                                200,00 h |       8 h |
| T5   |             21,30 h |      21.000 |               276 |                           43,19 h |       5.000 |                                240,00 h |      12 h |

O tempo de pet usa um perfil conservador de uma vitória elegível em boss por
dia. A taxa global de eventos vazios continua afetando o fluxo total de Gold e
XP do servidor, mas não é usada para estimar a disponibilidade individual:
quando o jogador se inscreve, ele próprio ativa a oportunidade. O casulo segue
aleatório e sem pity; o percentil 90 fica entre 12 e 22 vitórias.

O relatorio de poder de compra tambem calcula, para cada fonte positiva de
renda, as horas necessarias para:

- comprar 100 pocoes recomendadas;
- pagar o reforco das seis pecas ate `+3`;
- pagar a incubacao do pet;
- comprar um set completo observado no mercado, quando disponivel.

Requisitos nao monetarios sao exibidos junto do custo. Fontes com retorno
liquido negativo recebem tempo `N/D` em vez de um numero enganoso.

## Diagnostico atual

- Equipamentos craftaveis T3-T5 recuperam 30% do valor NPC dos ingredientes.
  O ciclo autossuficiente fica positivo, mas entrega somente 8,6-17,7% do
  Gold/h do autocombate e continua consumindo valor, preservando a venda entre
  jogadores como melhor destino economico. T1-T2 mantem a regra anterior.
- Incursoes devolvem 100% da entrada no sucesso e 90% na falha. A abordagem
  balanceada preserva aproximadamente 65% do XP/h do autocombate e permanece
  positiva após o custo esperado de poções, sem competir com o farm de Gold.
- Missoes agora escalam T1-T5, contam apenas atividade do tier atribuido e
  permanecem positivas no ciclo dedicado sem poder ser repetidas livremente.
- A matriz determinística de Ameacas Globais e pets está dentro do contrato,
  mas a calibracao comportamental ainda depende de eventos válidos suficientes
  para substituir os fallbacks de derrota, duração e progresso.
- A obtenção dos insumos de pet caiu para aproximadamente `133-240 h` de
  calendário no perfil de uma vitória elegível por dia. O casulo permanece o
  gargalo aleatório; fragmentos mínimos fecham em no máximo cinco vitórias.

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
