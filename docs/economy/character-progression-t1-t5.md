# Progressão de personagem T1-T5

## Meta

A meta de lançamento é `60-90 dias de calendário` para alcançar o nível 50.
O perfil de referência usa 8 horas ativas por dia, portanto a faixa técnica é
de `480-720 horas ativas`. Dias internos usados para montar o orçamento de XP
não devem ser apresentados como dias de calendário.

A curva é global. Lutador, Assassino, Atirador e Médico recebem exatamente o
mesmo requisito de XP por nível; diferenças de duração vêm apenas do ritmo real
de caça e combate de cada classe.

## Curva aplicada

- T1 e T2 permanecem idênticos ao publicado.
- Todos os requisitos dos níveis 1-20 foram congelados por regressão.
- T3 recebeu aceleração intermediária.
- T4 e T5 concentram a maior redução.
- XP total para alcançar o nível 20: `325.562`.
- XP total para alcançar o nível 50: `1.346.844`.

## Simulação provável

O cenário usa mapas e mobs reais do seed, set atual, gathering recomendado e
hunting 5/12/18/25/30 nos tiers T1-T5. Os valores abaixo são horas ativas e,
entre parênteses, dias de calendário no perfil de 8 h/dia.

| Classe | Nível 10 | Nível 20 | Nível 30 | Nível 40 | Nível 50 |
| ------ | -------: | -------: | -------: | -------: | -------: |
| Lutador | 23,84 h (2,98 d) | 199,61 h (24,95 d) | 381,53 h (47,69 d) | 516,96 h (64,62 d) | 680,09 h (85,01 d) |
| Assassino | 24,06 h (3,01 d) | 196,41 h (24,55 d) | 371,30 h (46,41 d) | 500,70 h (62,59 d) | 656,04 h (82,01 d) |
| Atirador | 24,06 h (3,01 d) | 199,91 h (24,99 d) | 377,84 h (47,23 d) | 507,86 h (63,48 d) | 663,20 h (82,90 d) |
| Médico | 23,84 h (2,98 d) | 199,61 h (24,95 d) | 379,50 h (47,44 d) | 512,19 h (64,02 d) | 668,19 h (83,52 d) |

A maior diferença entre classes nos marcos 10/20/30/40/50 é `3,67%`, abaixo
do limite de regressão de `5%`. Não foram criados personagens no banco: os
testes usam fixtures sintéticas para não contaminar a economia ou telemetria.

## Telemetria por sessão

Cada nova sessão de autocombate congela no backend:

- nível, classe e Premium no início;
- seis slots de equipamento, tier, raridade, reforço e atributos;
- nível/XP de caça e mapa;
- pet equipado, especialização e efeito;
- milissegundos efetivamente processados em caça e combate.

O tempo aguardando escolha de alvo não conta como caça nem combate. As colunas
são atualizadas por transações idempotentes do backend, não pelo Canvas, socket
ou relógio do navegador.

## Estado econômico

A matriz determinística T1-T5 está saudável e o banco canônico não possui
drift. Isso ainda não autoriza declarar a economia empiricamente encerrada: as
Ameaças Globais precisam acumular amostras válidas de derrotas, duração e
progresso por slot para substituir os fallbacks atuais.
