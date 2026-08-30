# Suite de carga do autocombate

> APROVADA em 2026-08-30T05:01:15.822Z. Carga sintetica executada em PostgreSQL, Redis e backend descartaveis, sem usar o banco dos jogadores.

| Personagens | Resultado | CPU media / P95 / max (% de 1 nucleo) | RSS max | PostgreSQL max | Tick P95 | Atraso P95 | Reconciliacoes |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | Aprovado | 12.31% / 46.71% / 119.56% | 289.19 MiB | 13/100 | 126 ms | 4 ms | 50/50 |
| 100 | Aprovado | 25.54% / 93.42% / 195.14% | 343.43 MiB | 13/100 | 113 ms | 6 ms | 100/100 |

## Criterios nao atendidos

- Nenhum.

## Interpretacao

Esta suite valida capacidade tecnica local, processamento autoritativo, conexoes e reconexao. Os personagens sinteticos foram distribuidos entre T1-T5 e as quatro classes, mas os resultados nao devem ser tratados como telemetria economica real. O gargalo estimado de 496-860 horas para insumos de pets continua pendente de calibracao baseada em amostras reais.
