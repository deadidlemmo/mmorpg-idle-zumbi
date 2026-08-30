# Teste de carga do autocombate - 50 personagens

> Resultado APROVADO. Esta e carga sintetica em banco, Redis e backend descartaveis. Ela mede capacidade tecnica e nao substitui telemetria economica real T2-T5.

## Cenario

| Campo | Valor |
| --- | ---: |
| Personagens simultaneos | 50 |
| Duracao estavel | 60s |
| Distribuicao por tier | T1: 10, T2: 10, T3: 10, T4: 10, T5: 10 |
| Distribuicao por classe | Lutador: 13, Assassino: 13, Atirador: 12, Médico: 12 |
| Queda de sockets | 100% simultaneamente |

## Recursos

| Metrica | Media | P95 | Maximo |
| --- | ---: | ---: | ---: |
| CPU do backend (% de 1 nucleo) | 12.31% | 46.71% | 119.56% |
| RSS do backend | 225.96 MiB | 272.91 MiB | 289.19 MiB |
| Conexoes PostgreSQL | 13 | 13 | 13 |
| Conexoes PostgreSQL ativas | 0.05 | 0 | 2 |

## Autocombate

| Metrica | Valor |
| --- | ---: |
| Ticks processados | 201 |
| Ticks por segundo | 3.34 |
| Erros de tick | 0 |
| Falhas de lock distribuido | 0 |
| Duracao do tick P95 / P99 / max | 126 / 145 / 171 ms |
| Atraso do agendador P95 / P99 / max | 4 / 12 / 15 ms |
| Eventos realtime | 112 |
| Trafego Socket.IO emitido | 4.943 MiB |

## Sockets e reconciliacao

| Metrica | Valor |
| --- | ---: |
| Conexoes iniciais | 50/50 |
| Reconexoes de transporte | 50/50 |
| Salas reingressadas | 50/50 |
| Reconciliacoes REST | 50/50 |
| Reconexao de transporte P95 | 407.6 ms |
| Sala pronta P95 | 437.1 ms |
| Reconciliacao completa P95 | 508.25 ms |

## Criterios

- [x] Todas as batalhas iniciaram: 50/50 (meta 50/50)
- [x] Loops simultaneos atingiram a carga alvo: 50 (meta >= 50)
- [x] Sockets simultaneos atingiram a carga alvo: 50 (meta >= 50)
- [x] Reconexao de transporte: 50/50 (meta >= 99%)
- [x] Reentrada na sala: 50/50 (meta >= 99%)
- [x] Reconciliacao REST apos reconexao: 50/50 (meta >= 99%)
- [x] Sem erros de tick: 0 (meta 0)
- [x] Sem falhas de lock distribuido: 0 (meta 0)
- [x] Atraso P95 do agendador: 4 ms (meta <= 250 ms)
- [x] Duracao P95 do tick: 126 ms (meta <= 500 ms)
- [x] Conexoes PostgreSQL abaixo de 80% do limite: 13/100 (meta <= 80%)

## Limite da evidencia

O ensaio confirma o comportamento tecnico da instancia local sob carga sintetica. Ele nao demonstra que recompensas, drops ou pets estao economicamente equilibrados e nao reduz a estimativa de 496-860 horas dos insumos de pets. O proximo passo economico continua sendo capturar amostras reais suficientes por atividade e tier.
