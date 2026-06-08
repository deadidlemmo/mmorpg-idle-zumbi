# AUTOCOMBAT.md - Sistema de Auto-combate

Ultima revisao: 2026-06-08.

Este documento descreve o sistema atual de auto-combate do projeto com base no codigo local. O backend, o schema Prisma, os DTOs e os tipos do frontend continuam sendo a fonte da verdade. Quando uma regra nao estiver clara no codigo, ela deve ser confirmada manualmente antes de virar comportamento definitivo.

## Resumo

Auto-combate e uma atividade idle/realtime protegida por JWT. O jogador inicia uma caca em um mapa/submapa, o backend rastreia ameacas, persiste uma sessao, muda a fase para encontro pronto, e entao o jogador inicia a batalha contra uma ameaca escolhida ou selecionada pelo sistema. O frontend acompanha tudo por REST, Socket.IO, polling e reconciliacao por eventos recentes.

O sistema atual nao e apenas "iniciar combate direto em um submapa". Ele possui fase de caca, batches de hunt, selecao de alvo de batalha, eventos persistidos e reconciliacao visual.

## Fonte da verdade

- Estado canonico: PostgreSQL via Prisma.
- Regras canonicas: backend NestJS.
- Realtime: eventos emitidos pelo backend e reconciliados por REST.
- Frontend: representacao visual e fila de eventos, nunca fonte da verdade.

Arquivos principais:

```text
backend/src/modules/auto-combat/auto-combat.controller.ts
backend/src/modules/auto-combat/auto-combat.service.ts
backend/src/modules/auto-combat/auto-combat.gateway.ts
backend/src/modules/auto-combat/auto-combat-state-machine.ts
backend/src/modules/auto-combat/dto/start-auto-combat.dto.ts
backend/src/modules/auto-combat/dto/start-auto-combat-battle.dto.ts
backend/src/modules/auto-combat/dto/preview-auto-combat.dto.ts
backend/src/common/config/auto-combat.config.ts
backend/prisma/schema.prisma
frontend/src/features/auto-combat/
frontend/src/services/websocket/socketClient.ts
frontend/src/services/api/endpoints.ts
```

## Fluxo atual

1. Frontend carrega mapas e status.
2. Jogador inicia caca chamando `POST /auto-combat/hunt/start`.
3. Backend cria ou reaproveita uma sessao `AutoCombatSession` em fase `HUNTING`.
4. Backend processa hunt, incrementa ameacas encontradas e XP de caca.
5. Quando ha ameacas rastreadas, a sessao pode ir para `ENCOUNTER_READY`.
6. Jogador inicia batalha por `POST /auto-combat/:characterId/battle/start`.
7. Backend muda a fase para `COMBAT_ACTIVE`, define alvo e processa TTK/rodadas.
8. Ao terminar o alvo, a sessao volta para `ENCOUNTER_READY` se ainda houver ameacas, ou para `HUNTING` para continuar rastreando.
9. Sessao pode ser parada por hunt stop ou stop geral.
10. Frontend reconcilia status e eventos recentes apos F5, reconnect, alt-tab longo ou retorno offline.

## Fases persistidas

Enum Prisma:

```prisma
enum AutoCombatSessionPhase {
  HUNTING
  ENCOUNTER_READY
  COMBAT_ACTIVE
}
```

Transicoes permitidas em `auto-combat-state-machine.ts`:

```text
HUNTING -> ENCOUNTER_READY
ENCOUNTER_READY -> HUNTING
ENCOUNTER_READY -> COMBAT_ACTIVE
COMBAT_ACTIVE -> ENCOUNTER_READY
```

A transicao para a mesma fase tambem e permitida. Qualquer outra transicao deve ser tratada como invalida.

## Status persistidos

Enum Prisma:

```prisma
enum AutoCombatSessionStatus {
  ACTIVE
  FINISHED
  STOPPED
  DEFEATED
}
```

O frontend tambem possui tipos mais permissivos para compatibilidade visual, mas estes quatro status sao os confirmados no schema para a sessao.

## Endpoints REST

Controller: `backend/src/modules/auto-combat/auto-combat.controller.ts`.

Todas as rotas do controller usam `@UseGuards(JwtAuthGuard)`.

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/auto-combat/online-count` | Retorna jogadores online no gateway. |
| `POST` | `/auto-combat/start` | Alias legado para iniciar auto-combate/caca. |
| `POST` | `/auto-combat/hunt/start` | Inicia ou retoma a fase de caca. |
| `POST` | `/auto-combat/:characterId/hunt/stop` | Para a caca sem necessariamente tratar como stop geral da sessao. |
| `POST` | `/auto-combat/:characterId/battle/start` | Inicia batalha a partir de `ENCOUNTER_READY`. |
| `POST` | `/auto-combat/preview` | Calcula preview/projecao. |
| `GET` | `/auto-combat/:characterId/status` | Retorna snapshot sem cache. |
| `GET` | `/auto-combat/:characterId/recent-events` | Retorna eventos recentes; aceita `afterSequence`. |
| `POST` | `/auto-combat/:characterId/stop` | Para a sessao de auto-combate. |

O frontend usa `startAutoCombat()` apontando para `API_ENDPOINTS.autoCombat.startHunt`.

## DTOs

### StartAutoCombatDto

Arquivo: `backend/src/modules/auto-combat/dto/start-auto-combat.dto.ts`.

```ts
{
  characterId: string;
  subMapId?: string;
  mapId?: string;
}
```

`characterId`, `subMapId` e `mapId` sao UUIDs. `subMapId` e `mapId` sao opcionais no DTO atual.

### StartAutoCombatBattleDto

Arquivo: `backend/src/modules/auto-combat/dto/start-auto-combat-battle.dto.ts`.

```ts
{
  mobId?: string;
  encounterId?: string;
  quantity?: number;
}
```

`quantity` e inteiro minimo `1`. `mobId` e `encounterId` sao opcionais e UUIDs.

### PreviewAutoCombatDto

Arquivo: `backend/src/modules/auto-combat/dto/preview-auto-combat.dto.ts`.

```ts
{
  characterId: string;
  subMapId?: string;
  mapId?: string;
  projectionSeconds?: number;
  iterations?: number;
}
```

Limites confirmados:

- `projectionSeconds`: minimo 5, maximo 21600.
- `iterations`: minimo 1, maximo 14.

## Modelos Prisma

Models diretamente relacionados:

```text
CharacterHuntingSkill
AutoCombatSession
AutoCombatHuntBatch
AutoCombatHuntBatchMob
AutoCombatHuntBatchEvent
AutoCombatSessionLoot
AutoCombatSessionMobSummary
AutoCombatSessionEvent
```

Campos de alto impacto em `AutoCombatSession`:

- `characterId`
- `mapId`
- `subMapId`
- `status`
- `phase`
- `startedAt`
- `endsAt`
- `lastProcessedAt`
- `durationSeconds`
- `roundDurationSeconds`
- `huntStartedAt`
- `huntStoppedAt`
- `lastHuntProcessedAt`
- `huntingLevelAtStart`
- `huntingXpGained`
- `foundEnemiesCount`
- `bonusEnemiesFound`
- `selectedEncounterId`
- `selectedEncounterMobId`
- `battleTargetMobId`
- `battleTargetEncounterId`
- `battleTargetTotal`
- `battleTargetRemaining`
- `currentMobId`
- `currentMobHp`
- `currentMobMaxHp`
- `killProgressSeconds`
- `estimatedKillTimeSeconds`
- `baseKillTimeSeconds`
- `currentRound`
- `currentCombatIndex`

Campos importantes em eventos:

- `sequence`
- `eventKey`
- `cycleKey` nos eventos de hunt batch
- `payloadJson`

Constraints importantes:

- `AutoCombatSessionEvent`: unico por `(sessionId, sequence)` e `(sessionId, eventKey)`.
- `AutoCombatHuntBatchEvent`: unico por `(batchId, sequence)` e `(batchId, cycleKey)`.
- `AutoCombatHuntBatch`: `sessionId` unico opcional.
- `AutoCombatHuntBatchMob`: unico por `(batchId, mobId)`.

## Regras de hunt

Constantes identificadas em `auto-combat.service.ts`:

```text
AUTO_COMBAT_HUNTING_LEVEL_CAP = 50
AUTO_COMBAT_HUNTING_BASE_SECONDS_PER_ENEMY = 15
AUTO_COMBAT_HUNTING_MIN_SECONDS_PER_ENEMY = 6
AUTO_COMBAT_HUNTING_SPEED_GAIN_PER_LEVEL = 0.024
AUTO_COMBAT_HUNTING_XP_PER_ENEMY = 5
AUTO_COMBAT_HUNTING_MAX_EVENTS_PER_PROCESS = 500
AUTO_COMBAT_HUNTING_BASE_MAX_TRACKED_ENEMIES = 600
```

Interpretacao segura:

- Caca tem progressao propria em `CharacterHuntingSkill`.
- Nivel de caca reduz o tempo por ameaca ate o piso de 6 segundos.
- Cada ameaca encontrada concede XP de caca.
- Ameacas encontradas ficam agregadas em batch/mobs e podem alimentar a selecao de batalha.
- A UI deve mostrar hunt como estado derivado do backend, nao como contador local independente.

## Regras de combate/TTK

Constantes identificadas:

```text
AUTO_COMBAT_ROUND_DURATION_SECONDS = 3
AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS = 1
AUTO_COMBAT_TTK_MIN_SECONDS = 1
AUTO_COMBAT_TTK_MAX_SECONDS = 300
AUTO_COMBAT_TTK_POWER_EXPONENT = 0.75
AUTO_COMBAT_TTK_PROGRESS_UPDATES_PER_SECOND = 4
AUTO_COMBAT_REALTIME_TICK_MS ~= 250ms
```

Atencao: `AUTO_COMBAT_ROUND_DURATION_SECONDS` esta em `backend/src/common/config/auto-combat.config.ts`, mas o service atual usa `AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS = 1` em pontos importantes. Antes de alterar ritmo, TTK ou duracao de rodada, confirme o fluxo inteiro no service, nos testes e no frontend.

## Limites idle e premium

O auto-combate importa limites de `membership.config.ts`:

```text
FREE_IDLE_PROGRESS_LIMIT_SECONDS = 6h
PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS = 12h
```

O usuario premium e identificado por `User.premiumUntil`. A UI de membership nao deve ser fonte da verdade para bonus ou limite.

## ActivityGuard

Auto-combate deve respeitar `ActivityGuardService`.

O personagem nao deve iniciar auto-combate quando outra atividade incompativel estiver ativa, como:

- gathering
- crafting
- incursions
- world bosses
- combate manual
- enfermaria

Ao mudar auto-combate, revise o guard e os outros sistemas que dependem de sessao ativa.

## WebSocket

Namespace:

```text
/auto-combat
```

Gateway:

```text
backend/src/modules/auto-combat/auto-combat.gateway.ts
```

Cliente:

```text
frontend/src/services/websocket/socketClient.ts
frontend/src/features/auto-combat/hooks/useAutoCombatSocket.ts
frontend/src/features/auto-combat/realtime/AutoCombatRealtimeProvider.tsx
```

Mensagens enviadas pelo cliente:

```text
auto-combat:join
auto-combat:leave
```

Eventos recebidos pelo cliente:

```text
auto-combat:connected
auto-combat:joined
auto-combat:left
auto-combat:error
auto-combat:status
auto-combat:session-updated
auto-combat:finished
auto-combat:stopped
auto-combat:event
auto-combat:mob-spawned
auto-combat:hit
auto-combat:dodge
auto-combat:mob-defeated
auto-combat:player-defeated
auto-combat:potion-used
auto-combat:auto-rest
```

O gateway tambem emite eventos especificos e o evento generico `auto-combat:event` para eventos realtime.

## Reconciliacao frontend

O frontend combina:

- status REST
- recent-events REST
- Socket.IO
- fallback/polling
- reducer realtime
- fila visual de eventos
- dedupe por `eventKey`, `sequence`, `huntCycleKey`, `sessionId`, `enemyInstanceId` e campos equivalentes

Campos importantes para nao quebrar:

- `phase`
- `sessionId`
- `huntBatchId`
- `enemyInstanceId`
- `eventKey`
- `huntCycleKey`
- `sequence`
- `snapshotSequence`
- `latestEventSequence`
- `battleTargetMobId`
- `battleTargetEncounterId`
- `battleTargetTotal`
- `battleTargetRemaining`
- `battleSelection`
- `battleProgress`

Regras:

- A pagina deve buscar status ao montar.
- Apos F5, reconstruir a tela por status e eventos recentes.
- Apos reconnect, buscar snapshot/status e aplicar eventos faltantes.
- Apos alt-tab longo ou retorno offline, processar/reconciliar pelo backend.
- Se houver gap de eventos, usar snapshot; nao tentar "inventar" eventos no frontend.
- O visual pode animar e atrasar eventos, mas nao pode mudar estado canonico.

## Retencao de eventos

Constantes identificadas:

```text
AUTO_COMBAT_STORED_EVENTS_LIMIT = 50
AUTO_COMBAT_RECENT_EVENTS_LIMIT = 20
AUTO_COMBAT_MAX_REALTIME_EVENTS_TO_EMIT = 20
```

`GET /auto-combat/:characterId/recent-events` aceita `afterSequence` e pode sinalizar lacuna/snapshot por campos como:

- `latestSequence`
- `snapshotSequence`
- `oldestAvailableSequence`
- `needsSnapshot`
- `gapFromSequence`

Ao alterar eventos, mantenha compatibilidade com esse mecanismo.

## Frontend

Arquivos principais:

```text
frontend/src/features/auto-combat/api/auto-combat.api.ts
frontend/src/features/auto-combat/pages/AutoCombatPage.tsx
frontend/src/features/auto-combat/realtime/AutoCombatRealtimeProvider.tsx
frontend/src/features/auto-combat/realtime/autoCombatRealtime.reducer.ts
frontend/src/features/auto-combat/realtime/autoCombatRealtime.types.ts
frontend/src/features/auto-combat/realtime/autoCombatRealtime.utils.ts
frontend/src/features/auto-combat/hooks/useAutoCombatSocket.ts
frontend/src/features/auto-combat/types/auto-combat.types.ts
frontend/src/features/auto-combat/types/auto-combat-page.types.ts
frontend/src/features/auto-combat/utils/auto-combat-page.helpers.ts
```

Endpoints usados pelo frontend:

```text
GET  /maps
GET  /maps/:mapId
GET  /auto-combat/:characterId/status
GET  /auto-combat/:characterId/recent-events
POST /auto-combat/preview
POST /auto-combat/hunt/start
POST /auto-combat/:characterId/hunt/stop
POST /auto-combat/:characterId/battle/start
POST /auto-combat/:characterId/stop
```

## Variaveis de ambiente relevantes

Backend:

- `DATABASE_URL`: Prisma/PostgreSQL.
- `JWT_SECRET`: JWT HTTP e WebSocket.
- `JWT_EXPIRES_IN`: presente no exemplo, mas o `AuthModule` atual usa `7d` fixo.
- `REDIS_HOST` e `REDIS_PORT`: presentes em infra/deps, mas uso funcional em `backend/src` nao foi identificado.
- `APP_PORT`: porta do backend.

Frontend:

- `VITE_API_URL`: base HTTP.
- `VITE_SOCKET_URL`: base dos sockets quando definida.
- `VITE_BACKEND_URL`: fallback usado por providers de gathering/crafting.
- `VITE_HMR_PROTOCOL` e `VITE_HMR_CLIENT_PORT`: opcionais para HMR do Vite.

## Testes identificados

Arquivos de teste relacionados ao auto-combate:

```text
backend/src/common/utils/auto-combat-survival.util.spec.ts
backend/src/common/utils/auto-combat-ttk.util.spec.ts
backend/src/modules/auto-combat/auto-combat-hunting-processing.spec.ts
backend/src/modules/auto-combat/auto-combat-state-machine.spec.ts
backend/test/auto-combat-map-isolation.e2e-spec.ts
backend/test/auto-combat-status-concurrency.e2e-spec.ts
frontend/src/features/auto-combat/realtime/autoCombatRealtime.reducer.spec.ts
frontend/src/features/auto-combat/utils/auto-combat-page.helpers.spec.ts
frontend/src/features/auto-combat/utils/battle-timeline.spec.ts
```

Comandos:

```bash
cd backend
npm test
npm run test:e2e
npm run build
```

```bash
cd frontend
npm run build
```

Nao ha script oficial de testes frontend no `frontend/package.json`; os arquivos `.spec.ts` do frontend existem, mas o runner nao esta documentado em script.

## Cuidados ao alterar

Nao fazer:

- Nao usar estado local como fonte da verdade.
- Nao avancar fase apenas no frontend.
- Nao remover `eventKey`, `sequence`, `snapshotSequence` ou `latestEventSequence`.
- Nao emitir evento visual sem persistencia quando ele altera estado canonico.
- Nao ignorar `ActivityGuardService`.
- Nao alterar duracao/TTK sem testar status, eventos recentes e UI.
- Nao remover fallback REST/polling sem mecanismo equivalente.
- Nao quebrar compatibilidade de `recent-events` com `afterSequence`.

Fazer:

- Atualizar DTO, service, gateway, tipos frontend e reducer juntos.
- Manter backend como fonte da verdade.
- Garantir ownership por `userId`.
- Limpar listeners/intervals/timeouts em frontend e gateway.
- Validar F5, reconnect, alt-tab e retorno offline.
- Usar testes existentes e adicionar testes quando mudar regra compartilhada.

## Troubleshooting

### A tela mostra hunt/batalha errada apos F5

Verifique `GET /auto-combat/:characterId/status` e `GET /auto-combat/:characterId/recent-events`. A UI deve reconstruir a tela por status/eventos, nao por estado antigo em React.

### Eventos aparecem duplicados

Verifique `eventKey`, `sequence`, `huntCycleKey`, `sessionId` e `enemyInstanceId`. Dedupe deve acontecer antes de enfileirar evento visual.

### Socket conectado mas sem atualizacao

Verifique:

- token salvo em `dead_idle_access_token`
- namespace `/auto-combat`
- `auto-combat:join`
- room `auto-combat:character:${characterId}` no gateway
- CORS do backend
- `VITE_SOCKET_URL` e `VITE_API_URL`

### Batalha nao inicia

Confirme se a sessao esta em `ENCOUNTER_READY` e se ha batch/mobs rastreados. `startBattle` nao deve iniciar combate quando a fase atual for `HUNTING`.

### Status demora ou retorna concorrencia

O service usa lock local por personagem e mensagem de concorrencia quando a sessao esta sendo processada. Em multiplas instancias backend, nao foi identificado lock distribuido.

## Pontos a confirmar antes de producao

- Se `POST /auto-combat/start` deve continuar como alias legado ou se deve ser removido futuramente.
- Se Redis sera usado para lock distribuido, fila ou cache.
- Como o auto-combate deve se comportar em varias instancias backend.
- Se `JWT_EXPIRES_IN` deve passar a ser lido dinamicamente.
- Politica final de retencao de eventos alem dos limites atuais.
- Cobertura de testes esperada para o frontend, ja que nao ha script oficial.
- Se `AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS = 1` deve substituir ou coexistir com a config de 3 segundos.
