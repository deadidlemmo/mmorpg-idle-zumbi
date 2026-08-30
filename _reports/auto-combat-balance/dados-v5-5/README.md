# Balance V5.5 - matriz de progressao T1-T5

Gerado em 2026-08-29 a partir dos seeds e das formulas reais do backend.

## Escopo

A matriz possui 5.040 cenarios e cruza:

- tiers T1 a T5;
- inicio, meio e fim de cada tier (ranks 1, 3 e 6);
- Lutador, Assassino, Atirador e Medico;
- set anterior, misto, atual e dois tiers abaixo quando aplicavel;
- reforco +0 e +3;
- gathering ausente, recomendado e completo;
- pet ausente e pet do tier atual;
- sem pocao e com a pocao indicada para o tier.

Cada linha registra TTK, oportunidades de ataque do mob, dano por ataque e por
abate, sobrevivencia, abate da derrota, consumo de pocoes, custo em Gold, ritmo
de caca, abates por hora e XP efetiva por hora.

## Metas validadas

Todas as 210 validacoes automaticas passaram.

| Transicao | Set anterior mais lento | Dano por abate | XP/h do set anterior |
| --- | ---: | ---: | ---: |
| T1 -> T2 | 18,2% | 3,98x | 92,0% |
| T2 -> T3 | 22,0% | 4,23x | 85,7% |
| T3 -> T4 | 17,5% | 4,17x | 86,3% |
| T4 -> T5 | 16,7% | 4,11x | 86,6% |

- Os 48 cenarios-base com set atual em T2-T5 sobrevivem a 100 abates usando a
  pocao indicada para o tier.
- O equipamento de aprendiz permanece viavel no inicio do T1 nas quatro
  classes, enquanto o primeiro set criado reduz TTK e dano recebido.
- Os 36 cenarios-base com equipamento dois tiers abaixo terminam em derrota,
  entre o 1o e o 11o abate, mesmo com 100 pocoes.
- O set anterior se torna progressivamente arriscado: no fim do T2 ocorre
  derrota em 1/4 classes; no fim de T3, T4 e T5, em 4/4 classes.
- No meio do T4 e T5, o set anterior ja termina em derrota em 2/4 classes.
- Sets mistos ficam entre o anterior e o atual em TTK e dano.
- Reforco +3 e pet do tier reduzem TTK e exposicao em todas as transicoes.

## Caso Carregador T2

Lutador, gathering recomendado, sem reforco e sem pet:

| Equipamento | TTK | Ataques esperados/abate | Dano esperado/abate | Pocoes/100 |
| --- | ---: | ---: | ---: | ---: |
| Set T1 | 13s | 5,13 | 5,17 | 1 |
| Set T2 | 11s | 1,33 | 1,31 | 0 |

O set T1 continua capaz de enfrentar o primeiro mob T2, mas leva 18,2% mais
tempo e sofre aproximadamente quatro vezes mais dano acumulado por abate.

## Pocoes

As curas e os precos atuais foram mantidos depois da medicao. Reduzir cura ao
mesmo tempo em que a exposicao aumenta tornaria o fim dos tiers excessivo.

| Tier enfrentado | Pocao indicada | Cura observada por classe | Preco | Media no rank 1 |
| --- | --- | ---: | ---: | ---: |
| T1 | Pocao de Vida Menor | 80-100 HP | 25 Gold | 0/100 |
| T2 | Pocao de Vida Menor | 80-100 HP | 25 Gold | 0/100 |
| T3 | Pocao de Vida | 117-185 HP | 80 Gold | 1,5/100 |
| T4 | Pocao de Vida | 122-210 HP | 80 Gold | 8/100 |
| T5 | Pocao de Vida Maior | 223-445 HP | 180 Gold | 10/100 |

Repetir apenas o mob rank 6 e um teste extremo: o set atual consome entre 73 e
91 pocoes/100 no T4 e entre 71 e 94/100 no T5. A distribuicao normal da caca
mistura ranks, portanto o consumo real esperado e menor. Esses limites ficam
registrados para calibracao futura com telemetria real.

## Arquivos

- `auto-combat-t1-t5-matrix.csv`: matriz completa para planilha e filtros.
- `auto-combat-t1-t5-matrix.json`: matriz completa e resultado das validacoes.

Regerar e validar:

```bash
cd backend
npm run balance:auto-combat:tiers:validate
npm run balance:auto-combat:tiers -- --strict --summary-only --output-dir=../_reports/auto-combat-balance/dados-v5-5
```

Os resultados sao projecoes de valor esperado. O backend continua sorteando
acerto, esquiva e critico em cada oportunidade de ataque, entao sessoes curtas
podem variar ao redor da media.
