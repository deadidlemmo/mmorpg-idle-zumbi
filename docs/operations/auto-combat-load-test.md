# Teste de carga do autocombate

Última execução completa: 30 de agosto de 2026.

## Objetivo

A suite simula personagens reais do ponto de vista do backend:

- cada personagem pertence a um usuário distinto e recebe JWT próprio;
- T1-T5 e as quatro classes são distribuídos pela carga;
- equipamentos, gathering, poção e caça usam dados canônicos do seed;
- cada personagem inicia uma batalha e entra em sua sala Socket.IO;
- todos os sockets perdem o transporte simultaneamente no meio do teste;
- após reconectar, cada cliente entra novamente na sala e reconcilia o status por REST.

PostgreSQL, Redis e backend são criados em containers e processos descartáveis. O banco local dos jogadores e o backend público não recebem personagens sintéticos.

## Execução

Dentro de `backend/`:

```powershell
npm.cmd run load:auto-combat:suite -- --users=50,100 --duration-seconds=60 --warmup-seconds=5
```

O orquestrador compila o backend, aplica migrations, executa o seed, sobe uma instância isolada para cada cenário, gera os relatórios e remove os ambientes temporários mesmo quando há falha.

O runner rejeita qualquer `DATABASE_URL` que não seja local ou cujo banco não comece com `mmorpg_zumbi_load_test_`.

## Métricas e critérios

A suite mede:

- CPU do processo, expressa como percentual de um núcleo;
- RSS e heap do backend;
- conexões totais e ativas no PostgreSQL;
- quantidade, duração e erros dos ticks;
- atraso real entre o instante agendado e a execução do tick;
- falhas de lock distribuído;
- volume de eventos e bytes emitidos por Socket.IO;
- conexão inicial, reconexão, reentrada na sala e reconciliação REST.

Critérios iniciais:

- 100% das batalhas devem iniciar;
- a instância deve atingir todos os loops e sockets esperados;
- no mínimo 99% dos sockets devem reconectar, reentrar na sala e reconciliar;
- zero erros de tick e zero falhas de lock;
- atraso P95 do agendador menor ou igual a 250 ms;
- duração P95 do tick menor ou igual a 500 ms;
- conexões PostgreSQL abaixo de 80% de `max_connections`.

## Resultado de 30/08/2026

| Personagens | Resultado |  CPU média / P95 / máxima | RSS máximo | PostgreSQL | Tick P95 | Atraso P95 | Reconciliação P95 |
| ----------: | --------- | ------------------------: | ---------: | ---------: | -------: | ---------: | ----------------: |
|          50 | Aprovado  | 12,31% / 46,71% / 119,56% | 289,19 MiB |     13/100 |   126 ms |       4 ms |         508,25 ms |
|         100 | Aprovado  | 25,54% / 93,42% / 195,14% | 343,43 MiB |     13/100 |   113 ms |       6 ms |         761,09 ms |

Nos dois cenários:

- todas as batalhas iniciaram sem retry após a correção da transição;
- todos os sockets reconectaram, reentraram na sala e reconciliaram;
- não houve erro de tick, falha de lock, erro de conexão ou erro Socket.IO;
- 50 personagens geraram 201 ticks e 4,943 MiB em 60 segundos;
- 100 personagens geraram 398 ticks e 9,825 MiB em 60 segundos.

Relatórios reproduzíveis:

- `_reports/load-test/2026-08-30-t1-t5-50-100/summary.md`;
- `_reports/load-test/2026-08-30-t1-t5-50-100/summary.json`;
- relatórios detalhados nas pastas `50-characters/` e `100-characters/`.

## Correção encontrada pela carga

O primeiro cenário de 50 revelou abortos `P2034` quando jogadores independentes iniciavam a batalha ao mesmo tempo. A transição já bloqueia o personagem e reivindica a mudança de fase por atualização condicional; portanto, `Serializable` adicionava conflitos SSI entre jogadores sem aumentar a proteção por personagem.

A transição `ENCOUNTER_READY -> COMBAT_ACTIVE` passou a usar `ReadCommitted`. Um smoke de 20 personagens e os cenários de 50 e 100 confirmaram zero conflito e zero retry.

## Limite econômico

Este resultado prova capacidade técnica local, não equilíbrio econômico. A distribuição T1-T5 amplia a cobertura de código, mas continua sendo sintética. Nenhum preço, drop, recompensa, poção ou atributo foi alterado.

O gargalo antigo de 496-860 horas foi recalibrado depois deste ensaio. O
contrato atual projeta 133-240 horas de calendário para os insumos no perfil de
uma vitória elegível por dia. O teste de carga continua provando apenas
capacidade técnica; a telemetria real de bosses precisa atingir a amostra mínima
antes de uma nova revisão de recompensas.
