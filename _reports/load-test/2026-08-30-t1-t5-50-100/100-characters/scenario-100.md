# Teste de carga do autocombate - 100 personagens

> Resultado APROVADO. Esta e carga sintetica em banco, Redis e backend descartaveis. Ela mede capacidade tecnica e nao substitui telemetria economica real T2-T5.

## Cenario

| Campo | Valor |
| --- | ---: |
| Personagens simultaneos | 100 |
| Duracao estavel | 60s |
| Distribuicao por tier | T1: 20, T2: 20, T3: 20, T4: 20, T5: 20 |
| Distribuicao por classe | Lutador: 25, Assassino: 25, Atirador: 25, Médico: 25 |
| Queda de sockets | 100% simultaneamente |

## Recursos

| Metrica | Media | P95 | Maximo |
| --- | ---: | ---: | ---: |
| CPU do backend (% de 1 nucleo) | 25.54% | 93.42% | 195.14% |
| RSS do backend | 300.72 MiB | 341.74 MiB | 343.43 MiB |
| Conexoes PostgreSQL | 12.5 | 13 | 13 |
| Conexoes PostgreSQL ativas | 0.03 | 0 | 1 |

## Autocombate

| Metrica | Valor |
| --- | ---: |
| Ticks processados | 398 |
| Ticks por segundo | 6.6 |
| Erros de tick | 0 |
| Falhas de lock distribuido | 0 |
| Duracao do tick P95 / P99 / max | 113 / 126 / 242 ms |
| Atraso do agendador P95 / P99 / max | 6 / 12 / 21 ms |
| Eventos realtime | 220 |
| Trafego Socket.IO emitido | 9.825 MiB |

## Sockets e reconciliacao

| Metrica | Valor |
| --- | ---: |
| Conexoes iniciais | 100/100 |
| Reconexoes de transporte | 100/100 |
| Salas reingressadas | 100/100 |
| Reconciliacoes REST | 100/100 |
| Reconexao de transporte P95 | 527.2 ms |
| Sala pronta P95 | 597.55 ms |
| Reconciliacao completa P95 | 761.09 ms |

## Criterios

- [x] Todas as batalhas iniciaram: 100/100 (meta 100/100)
- [x] Loops simultaneos atingiram a carga alvo: 100 (meta >= 100)
- [x] Sockets simultaneos atingiram a carga alvo: 100 (meta >= 100)
- [x] Reconexao de transporte: 100/100 (meta >= 99%)
- [x] Reentrada na sala: 100/100 (meta >= 99%)
- [x] Reconciliacao REST apos reconexao: 100/100 (meta >= 99%)
- [x] Sem erros de tick: 0 (meta 0)
- [x] Sem falhas de lock distribuido: 0 (meta 0)
- [x] Atraso P95 do agendador: 6 ms (meta <= 250 ms)
- [x] Duracao P95 do tick: 113 ms (meta <= 500 ms)
- [x] Conexoes PostgreSQL abaixo de 80% do limite: 13/100 (meta <= 80%)

## Limite da evidencia

O ensaio confirma o comportamento tecnico da instancia local sob carga sintetica. Ele nao demonstra que recompensas, drops ou pets estao economicamente equilibrados e nao reduz a estimativa de 496-860 horas dos insumos de pets. O proximo passo economico continua sendo capturar amostras reais suficientes por atividade e tier.
