# Simulação econômica de partidas de World Boss

Gerado em 2026-08-30T15:35:59.680Z. Foram simuladas **400.000 partidas** com seed `3735887134`, sem escrita no banco.

Esta é uma simulação Monte Carlo com as regras canônicas do backend, não telemetria real. O resultado serve para estimar comportamento e caudas de risco enquanto a amostra observada ainda é pequena.

## Set atual e grupo confiável

| Tier | Vitória | Duração média | Gold/tentativa | Variação líquida de Gold diário | Variação líquida de XP diário | Casulo na 1ª vitória | Casulo/dia ativo | Dias casual | Dias ativo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| T1 | 100% | 40.47 min | 240.18 | -17.74% | -9.42% | 17.9516% | 18.6664% | 4 | 4 |
| T2 | 100% | 40.46 min | 500.29 | 1.33% | -0.75% | 16.1339% | 16.6071% | 4 | 4 |
| T3 | 100% | 40.53 min | 779.71 | 19.68% | 15.46% | 14.0137% | 14.5439% | 5 | 5 |
| T4 | 100% | 40.63 min | 1079.71 | 12.92% | 34.62% | 12.0437% | 12.4771% | 6 | 6 |
| T5 | 100% | 40.42 min | 1399.3 | -3.3% | 33.93% | 9.9849% | 10.4069% | 7 | 7 |

## Baixa população

| Tier | Vitória | Duração média | Gold/tentativa | Variação líquida de Gold diário | Variação líquida de XP diário | Casulo na 1ª vitória | Casulo/dia ativo | Dias casual | Dias ativo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| T1 | 95.23% | 62.94 min | 216.54 | -35.39% | -28.17% | 16.5405% | 18.5567% | 4.44 | 4 |
| T2 | 95.26% | 63.08 min | 451.87 | -19.14% | -18.68% | 14.6005% | 16.5064% | 5 | 4 |
| T3 | 94.98% | 63.41 min | 702.91 | -3.27% | -3.69% | 12.3635% | 14.4526% | 6 | 5 |
| T4 | 95.53% | 62.73 min | 976.73 | -8.96% | 14.02% | 10.6912% | 12.3994% | 7 | 6 |
| T5 | 95.5% | 62.84 min | 1263.69 | -23.18% | 13.21% | 8.9961% | 10.34% | 8 | 7 |

## Premissas

- As quatro classes têm a mesma probabilidade; cada perfil usa os atributos canônicos do boss e do set.
- HP é travado no início pelo TTK e DPS de escala do grupo, exatamente como no backend.
- O abandono planejado ocorre entre 25% e 125% do TTK-alvo; quem sai antes do término não recebe recompensa.
- Gold permanece integral. Em T2-T5, o XP das vitórias elegíveis usa 100% na primeira, 50% na segunda e 25% nas seguintes do tier/reset UTC; T1 permanece integral. A primeira vitória também usa chance cheia e o lote completo de fragmentos, e as seguintes usam 1% da chance-base e entregam um fragmento.
- O máximo diário pressupõe inscrição em todas as janelas, um casulo por tier/reset UTC e soma duração média mais respawn.

## Achados

- Nenhum limite econômico ou de disponibilidade foi violado.
