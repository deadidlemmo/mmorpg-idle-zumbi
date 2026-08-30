# Economia T1-T5 - Contrato de progressao

> Para auditar as regras atuais, incluindo venda de drops ao NPC, preco real
> de pocoes e Gold liquido por tier, use
> `npm run economy:simulate:t1-t5` e consulte
> `docs/economy/t1-t5-economic-simulator.md`.

## Objetivo

Esta especificacao define a cadeia economica jogavel do Dead Idle do Tier 1 ao
Tier 5. O ciclo separa as fontes para que gathering, combate, incursoes e
Ameacas Globais tenham funcoes complementares, sem uma atividade substituir a
outra.

## Regras invariantes

- O backend e o banco sao a fonte da verdade.
- Toda entrada ou saida confirmada gera um registro no ledger.
- Quantidades do ledger sao positivas; `CREDIT` e `DEBIT` definem a direcao.
- Operacoes discretas usam chaves idempotentes e transacoes serializaveis.
- Fichas e fragmentos pertencem ao personagem, possuem tier e nao ocupam a
  mochila.
- Transferencias entre mochila e banco nao criam nem destroem recursos.
- Cash nao e convertido diretamente em recursos negociaveis.
- Reforcos sao garantidos, sem chance de falha, e limitados a `+3`.
- Trocas por materiais comuns sao protecao contra azar, nao a fonte principal.

## Ciclo fechado

1. Caca e auto-combate fornecem XP, Gold e drops de mobs.
2. Gathering fornece os materiais comuns usados nas receitas.
3. Crafting combina drops, materiais e Gold para criar equipamentos-base.
4. Incursoes consomem Gold e fornecem Fragmentos de Reforco e Fichas de
   Incursao.
5. O equipamento equipado consome Fragmentos de Reforco e Gold para avancar de
   `+1` ate `+3`.
6. Ameacas Globais fornecem Gold, Fragmentos de Ameaca e uma pequena chance de
   Casulo Infectado.
7. Fragmentos de Ameaca alimentam a incubacao e podem cobrir faltas pontuais de
   materiais, mas nunca sao trocados por casulos.
8. A incubadora consome um casulo, Fragmentos de Ameaca e Gold para adicionar
   um pet a colecao.
9. Pocoes, enfermaria, crafting, incursoes, reforcos e incubacao retiram Gold da
   economia e mantem as fontes de Gold relevantes.

## Identidade de cada atividade

| Atividade     | Fonte principal                | Uso principal                       |
| ------------- | ------------------------------ | ----------------------------------- |
| Auto-combate  | Drops de mobs, XP e Gold       | Crafting e progressao do personagem |
| Gathering     | Materiais comuns               | Receitas de equipamento             |
| Crafting      | Equipamento-base               | Preparacao do conjunto de cada tier |
| Incursao      | Fragmentos de Reforco e Fichas | Equipamento `+1`, `+2` e `+3`       |
| Ameaca Global | Fragmentos de Ameaca e Casulos | Incubacao e colecao de pets         |
| Mercadores    | Pocoes e servicos              | Sobrevivencia e sumidouro de Gold   |

## Reforco de equipamentos

Cada equipamento-base possui variantes canonicas `+1`, `+2` e `+3`. O reforco
substitui somente a copia equipada pela variante seguinte e recalcula os
atributos e o HP do personagem na mesma transacao.

Regra de poder:

- `Tn +1` fecha aproximadamente 40% da distancia ate o proximo tier.
- `Tn +2` fecha aproximadamente 75% da distancia.
- `Tn +3` fica um ponto de atributo acima do equipamento-base do tier seguinte.
- `T(n+1) +1` volta a superar `Tn +3`.

Assim, `+3` recompensa o jogador antes de liberar ou fabricar o proximo tier,
mas nao torna a progressao de tier obsoleta. Os reforcos nao sao vendaveis nem
negociaveis nesta versao.

### Custos e esforco esperado

| Tier | Fragmentos ate +3 | Gold ate +3 | Sucessos esperados com fichas |
| ---- | ----------------: | ----------: | ----------------------------: |
| T1   |                22 |         210 |                          2,44 |
| T2   |                28 |         560 |                          2,33 |
| T3   |                34 |       1.130 |                          2,19 |
| T4   |                40 |       2.150 |                          2,16 |
| T5   |                46 |       3.500 |                          2,14 |

O valor representa um unico equipamento e considera a conversao das fichas
recebidas em Fragmentos de Reforco. Sem gastar fichas, o custo fica entre 4,4 e
4,9 incursoes bem-sucedidas. Um conjunto inteiro `+3` e uma meta opcional, nao
um requisito para entrar no tier seguinte.

### Reforco contra fabricacao do proximo tier

A auditoria usa as duracoes, chances e recompensas reais das incursoes e as
receitas atuais. Ela falha se reforcar um item existente ate `+3` levar mais de
85% do tempo medio necessario para fabricar um item-base do proximo tier.

| Escolha | Tempo medio para `+3` | Craft do proximo tier | Relacao |
| ------- | --------------------: | --------------------: | ------: |
| T1 +3   |                 1,35h |              T2 1,74h |     78% |
| T2 +3   |                 1,65h |              T3 2,45h |     68% |
| T3 +3   |                 1,87h |              T4 2,93h |     64% |
| T4 +3   |                 2,44h |              T5 4,10h |     60% |

O tempo considera a melhor incursao equilibrada do tier e a conversao das
fichas recebidas. Para um jogador que ja usa o equipamento atual, reforcar e
mais rapido e entrega uma vantagem imediata. O item do proximo tier continua
necessario porque libera uma nova linha de `+1` a `+3`, e seu `+1` ja supera o
`+3` anterior. O proximo tier tambem exige o nivel e as proficiencias
correspondentes, portanto nao concorre com o reforco desde o inicio do tier.

## Pets e Ameacas Globais

- Cada tier T1-T5 possui oito especializacoes, totalizando quarenta casulos e
  quarenta pets com identificadores estaveis.
- As especializacoes sao Desmanche, Coleta, Patrulha, Arsenal,
  Tecnovarredura, Contencao, Combate Automatico e Rastreamento.
- Cada recompensa elegivel faz no maximo uma rolagem de casulo. Quando o drop
  acontece, o backend exige as oito especializacoes ativas no tier e sorteia
  uma delas com a mesma probabilidade.
- A rolagem de Ameaca Global e a unica fonte de novos casulos. Fragmentos nao
  permitem escolher nem comprar uma especializacao.
- A incubacao consome um casulo, fragmentos adicionais e Gold.
- Ao encerrar um evento, o backend liquida todos os participantes elegiveis em
  lotes idempotentes; a entrega nao depende de a pagina permanecer aberta.
- O resultado individual fica disponivel por quinze minutos para reconciliacao
  apos F5, reconexao ou retorno ao jogo.
- Existe uma unica vaga de incubacao por personagem.
- O progresso persiste no servidor e pode ser coletado depois do prazo.
- Cada personagem pode equipar exatamente um pet por vez. Equipar outro faz a
  troca atomica; o pet anterior permanece na colecao.
- Os bonus de reducao de tempo sao representados em pontos-base: T1 `300`
  (`3%`), T2 `400` (`4%`), T3 `500` (`5%`), T4 `600` (`6%`) e T5 `750`
  (`7,5%`).
- O calculador central valida o pet equipado e devolve o modificador apenas
  para a especializacao correspondente. Gathering aplica o bonus ao iniciar o
  proximo ciclo, a caca ao iniciar o proximo rastreio e o auto-combate ao
  iniciar o proximo monstro. O TTK e persistido em milissegundos, respeita o
  piso de um segundo e nao muda no meio de um ciclo ja iniciado.
- Pets disponiveis podem ser vendidos ao comerciante por `40%` do Gold gasto
  na incubacao. Um pet equipado nao pode ser vendido e a venda nao devolve
  casulo nem fragmentos.
- Enquanto uma especializacao ainda nao pertence a colecao, o primeiro casulo
  dela fica reservado para incubacao. Somente o excedente e considerado
  repetido.
- Cada casulo repetido pode ser convertido em `10` Fragmentos de Ameaca do
  mesmo tier. Esses fragmentos retornam para incubacao ou trocas de materiais.
- Como alternativa, um casulo repetido pode ser vendido por `50%` do valor de
  venda ao NPC do pet correspondente. Conversao e venda sao transacionais,
  idempotentes e registradas no ledger.

## Trocas de protecao contra azar

- `1` Ficha de Incursao gera `2` Fragmentos de Reforco do mesmo tier.
- `2` Fichas de Incursao geram `3` materiais comuns escolhidos.
- `3` Fragmentos de Ameaca geram `2` drops de mob escolhidos.

Casulos nao fazem parte da Central de trocas: sao exclusivos do drop aleatorio
de Ameacas Globais. A protecao dos Fragmentos de Ameaca cobre somente materiais
e custos de incubacao, sem substituir a recompensa rara do chefe.

As telas separam as ofertas principais das emergenciais para deixar claro que
gathering e auto-combate continuam sendo as fontes eficientes dos materiais
comuns.

## Instrumentacao

O painel administrativo acompanha:

- Gold criado, destruido, saldo e relacao de sumidouro.
- Itens creditados e debitados por tier.
- Fluxo e saldo de Fichas de Incursao e Fragmentos de Ameaca.
- Reforcos concluidos no periodo.
- Incubacoes iniciadas, incubacoes ativas e pets coletados.
- Motivos com maior volume economico.
- Inicio da cobertura exata do ledger.

Dados anteriores a migration permanecem nas metricas historicas por sessoes e
estoque, mas nao sao inventados no ledger.

## Validacao

Executar a partir de `backend`:

```bash
npm run economy:simulate:t1
npm run economy:validate:reinforcement
```

Parametros opcionais do simulador:

```bash
npm run economy:simulate:t1 -- --players=1000 --days=7 --seed=20260824 --strategy=balanced --json
npm run economy:simulate:t1 -- --players=1000 --days=7 --seed=20260824 --strategy=focused --json
```

`balanced` distribui os reforcos entre as seis pecas. `focused` leva uma peca
ate `+3` antes de iniciar a seguinte. O relatorio separa a concessao inicial de
Gold das fontes recorrentes e detalha os sumidouros de consumiveis, crafting,
entrada de incursao, reforco e incubacao. A relacao total considera a concessao
inicial; a relacao recorrente mede apenas o Gold produzido durante os dias
simulados.

### Calendario de Ameacas Globais

O simulador nao usa mais uma media fixa de participacoes por dia. Ele constroi
os dois slots T1 com as mesmas regras temporais do backend:

- primeiro evento agendado com 10 minutos de antecedencia;
- janela de entrada de 5 minutos;
- duracao maxima de 3 horas;
- novo evento de Contencao 6 horas depois do fechamento anterior;
- novo evento de Exterminio 12 horas depois do fechamento anterior.

Cada jogador recebe um horario habitual de jogo, com variacao diaria de ate 45
minutos. A simulacao verifica nivel minimo, presenca na janela de decisao,
chance de optar pelo evento e pelo menos 5 minutos de participacao. O tempo
efetivamente ocupado pela Ameaca Global e retirado do tempo disponivel para
coleta e combate naquele dia, porque essas atividades sao exclusivas.

O comando `npm run economy:simulate:t1` consulta, por padrao, os eventos T1 dos
ultimos 90 dias no PostgreSQL. A taxa de eventos com pelo menos um participante
deixa de ser presumida e passa a ser a taxa observada de eventos ativados. Um
evento vazio encerra cinco minutos apos o horario inicial, nao entrega
recompensa e agenda o proximo evento a partir desse fechamento, como ocorre no
backend.

Antes de entrar na amostra, cada evento passa por filtros de qualidade. Sao
rejeitados eventos criados depois do fechamento, criados depois da janela de
entrada, com cronologia impossivel ou com valores de HP invalidos. Isso evita
que eventos antigos gerados por catch-up sejam tratados como comportamento real
dos jogadores.

`hpLockedAt` e a evidencia canonica de que a batalha foi ativada. Inscricao
sem inicio, participante que saiu durante a janela e evento vazio nao contam
como ativacao. Dano, reducao de HP e derrota permanecem como evidencias de
recuperacao para eventos legados, e um lock de HP fora da janela invalida a
amostra.

Cada metrica possui seu proprio minimo de amostra:

- presenca por evento: 10 eventos validos por slot;
- derrota: 10 eventos ativados por slot;
- tempo ate a derrota: 5 derrotas com horario valido;
- progresso de evento ativado e expirado: 5 expiracoes.

Quando o minimo e atingido, o relatorio usa `TELEMETRY`, mostra o tamanho da
amostra e, para percentuais, o intervalo de confianca de 95%. Quando nao e
atingido, somente aquela metrica conserva `FALLBACK`, com o tamanho da amostra
insuficiente exposto. O relatorio tambem fornece `rewardReviewReady`; enquanto
ele for falso, os valores de recompensa nao devem ser recalibrados.

O modelo ainda considera que cada jogador decide entrar nos 10 minutos
anteriores ao inicio, embora o backend permita inscricao antecipada enquanto o
evento esta agendado. Essa premissa continua explicita na configuracao.

O balanceamento deterministico v2 garante viabilidade para grupos pequenos:
o backend congela o poder do grupo ao iniciar, deriva o HP do TTK alvo e passa
a processar dano a cada 5 segundos sem depender de polling do jogador. Eventos
derrotados usam 100% da recompensa; eventos expirados reutilizam os
multiplicadores reais de progresso do backend (15%, 30%, 50% ou 75% para Gold
e XP).

Fragmentos continuam garantidos para participantes elegiveis, inclusive quando
o casulo tambem cai. A curva T1-T5 usa `1/1`, `1/1`, `1-2`, `1-2` e `1-2`
fragmentos; as chances de casulo, sempre condicionadas a derrota, sao `7%`,
`7%`, `5%`, `5%` e `4%`. A telemetria observada continua separada dessa matriz
deterministica e ainda deve atingir a amostra minima antes de novos ajustes de
recompensa orientados pelo comportamento real.

O fallback de derrota agora e `100%` nos dois slots porque a matriz v2 comprova
que grupos com set atual ou anterior concluem dentro das 3 horas quando
permanecem na luta. Isso nao e tratado como telemetria: a taxa observada ainda
o substitui automaticamente quando houver 10 eventos ativados validos no
respectivo slot. Duracao da derrota e progresso de expiracao usam o intervalo
P25-P75 observado assim que atingem suas amostras minimas. O relatorio mostra
eventos agendados, vazios, ativados, derrotados e expirados por slot, alem das
perdas por nivel, ausencia, escolha/conflito e participacao insuficiente.

Para auditar apenas a calibracao, use
`npm run economy:calibrate:world-boss`. `--lookback-days=N` altera a janela;
`--json` produz o contrato completo. O modo offline precisa ser solicitado de
forma explicita com `--world-boss-calibration=fallback`; uma falha de conexao
na execucao normal nao e escondida por valores presumidos.

Para conferir um evento antes, durante e depois da batalha sem alterar o banco,
use `npm run economy:audit:world-boss -- --event-id=UUID`. A auditoria mostra o
banco configurado sem expor credenciais, `hpLockedAt`, participantes, dano,
resultado, `defeatedAt` e inconsistencias entre os totais do evento e seus
participantes.

A auditoria de reforco le o catalogo local e falha se faltarem variantes, se os
atributos divergirem da configuracao ou se a relacao entre `Tn +3`, proximo
tier base e proximo tier `+1` for quebrada. Ela tambem reutiliza a auditoria das
receitas para impedir que fabricar o proximo tier se torne mais rapido do que
reforcar um item existente.

## Criterios de acompanhamento

- Nenhum saldo negativo ou duplicacao por retry.
- Primeiro equipamento T1 entre 30 e 45 minutos no perfil ativo.
- Conjunto T1 entre tres e cinco horas no perfil ativo.
- Um item chega a `+1` na primeira incursao bem-sucedida.
- Um item chega a `+3` em aproximadamente duas a tres incursoes com fichas.
- `Tn +3` supera o proximo tier base, mas perde para o proximo tier `+1`.
- Relacao de Gold destruido entre 60% e 80% do Gold criado em sete dias.

## Proximas fases

1. Medir sete dias reais e ajustar Gold sem alterar custos por intuicao.
2. Implementar reciclagem de equipamento antigo com retorno parcial.
3. Integrar o calculador central de pets aos seis gatherings, a caca e o
   auto-combate, preservando snapshots e barras de progresso.
4. Medir os bonus de pets na simulacao economica e na telemetria real.
5. Medir conversao e venda de casulos repetidos antes de ajustar os retornos.
6. Testar mercado entre jogadores somente depois de controlar inflacao,
   estoque e abuso por multiplas contas.
7. Criar temporadas e recompensas cosmeticas sem vender poder direto.
