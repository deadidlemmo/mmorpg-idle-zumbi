# AGENTS.md - MMORPG Idle Zumbi

Ultima revisao: 2026-06-08.

Guia para agentes de IA/Codex trabalharem neste repositorio. Foi refeito a partir do working tree local atual. Nao assuma que este arquivo esta mais atualizado que o codigo: sempre confirme no checkout antes de editar.

## Regra principal

Leia este arquivo primeiro. Em seguida execute:

```bash
git status --short
rg --files -g "!node_modules" -g "!dist" -g "!coverage"
```

Regras obrigatorias:

- Preserve mudancas do usuario.
- Nao reverta arquivos que voce nao alterou.
- Nao edite `node_modules`, `dist`, `coverage`, caches ou builds gerados.
- Nao invente arquitetura, scripts, variaveis ou regras de jogo.
- Nao altere comportamento funcional quando a tarefa for documentacao.
- Em mudancas de codigo, limite o escopo ao pedido e valide com comandos proporcionais ao risco.

## Contexto rapido

MMORPG Idle Zumbi e um jogo web full stack de sobrevivencia zumbi com progressao idle/MMORPG.

Stack real identificada:

- Frontend: React 19, TypeScript, Vite, React Router, Zustand, Axios, Socket.IO Client.
- Backend: NestJS 11, TypeScript, Prisma, PostgreSQL, JWT/Passport, Socket.IO, Redis/ioredis.
- Banco: Prisma ORM com migrations em `backend/prisma/migrations`.
- Infra local: Docker Compose em `infra/docker-compose.yml` com PostgreSQL 16 e Redis 7.

Nao ha `package.json` raiz identificado. Use os comandos dentro de `backend/` ou `frontend/`.

## Fontes da verdade

Use estas fontes antes de tomar decisoes:

- Banco e persistencia: `backend/prisma/schema.prisma` e migrations.
- Regras backend: `backend/src/modules/`, `backend/src/common/config/`, `backend/src/common/utils/`.
- Contratos REST: controllers em `backend/src/modules/**`.
- Contratos frontend: `frontend/src/services/api/endpoints.ts`, APIs por feature e tipos em `frontend/src/features/**/types`.
- Realtime: gateways backend e providers/hooks frontend.
- Rotas frontend: `frontend/src/app/routes.tsx`.
- Scripts: `backend/package.json`, `frontend/package.json`, `infra/docker-compose.yml`.
- Seeds canonicos: `backend/prisma/seed.ts` e `backend/prisma/seed-data/`.

Documentos auxiliares podem estar desatualizados. O codigo e o schema vencem.

## Mapa do projeto

```text
.
|-- AGENTS.md
|-- README.md
|-- AUTOCOMBAT.md
|-- docs/
|-- infra/
|   `-- docker-compose.yml
|-- backend/
|   |-- src/
|   |   |-- common/
|   |   |-- modules/
|   |   `-- prisma/
|   |-- prisma/
|   |   |-- schema.prisma
|   |   |-- migrations/
|   |   `-- seed-data/
|   `-- test/
`-- frontend/
    |-- src/
    |   |-- app/
    |   |-- assets/
    |   |-- components/
    |   |-- features/
    |   |-- services/
    |   |-- store/
    |   `-- utils/
    |-- _backup_gathering/
    `-- _backup_gathering_unused/
```

Arquivos/pastas sensiveis:

- `frontend/src/assets/images/`: assets do jogo, muitas referencias indiretas.
- `docs/mob-image-pack/` e `docs/mob-image-pack.zip`: pacote de imagens.
- `docs/economia-crafting-csv/`: dados de economia/crafting.
- `frontend/_backup_gathering/` e `frontend/_backup_gathering_unused/`: backups locais.
- Arquivos locais antigos como `project-tree.md`, `project-files.md`, `local-changes.md`: confirmar atualidade antes de usar.

## Como entender antes de editar

1. Confira `git status --short`.
2. Liste arquivos com `rg --files`.
3. Abra `package.json` da parte afetada.
4. Leia o schema Prisma se a mudanca envolve persistencia, personagem, item, sessao, evento, recompensa ou atividade.
5. Leia controller, service, DTO, gateway e tipos frontend do mesmo dominio.
6. Se houver realtime, leia tambem provider/hook/reducer frontend e gateway backend.
7. So depois edite.

Para buscas, prefira `rg`.

## Comandos de verificacao

Estado e diff:

```bash
git status --short
git diff -- README.md AGENTS.md
git diff --check
```

Backend:

```bash
cd backend
npm run lint
npm test
npm run test:e2e
npm run build
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Prisma:

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Docker local:

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml down
docker compose -f infra/docker-compose.yml down -v
```

Em Windows/PowerShell, se `npm` bater em erro de politica do `npm.ps1`, use `npm.cmd`.

## Padroes gerais de codigo

- Linguagem de dominio, UI e docs: portugues brasileiro.
- Codigo: TypeScript.
- Use nomes explicitos.
- Evite dependencia nova sem necessidade real.
- Preserve lockfiles quando dependencias mudarem.
- Nao coloque `try/catch` ao redor de imports.
- Prefira helpers/configs existentes antes de criar novas formulas.
- Comentarios devem explicar blocos realmente complexos, nao o obvio.
- Nao expor segredos de `.env` em docs, logs ou respostas.

## Regras de backend

Entrada:

- `backend/src/main.ts`: bootstrap Nest, CORS, `ValidationPipe`, porta.
- `backend/src/app.module.ts`: composicao dos modulos.
- `backend/prisma/schema.prisma`: fonte da verdade do banco.

Padroes:

- Controllers devem ficar finos.
- Services concentram regra de negocio.
- DTOs pequenos com `class-validator`.
- Use exceptions Nest (`BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`).
- Valide ownership por `userId` em recursos de personagem.
- Nao retornar `passwordHash`.
- Gateways devem autenticar, controlar rooms e limpar listeners/intervalos.

Modulos atuais:

- `auth`
- `users`
- `characters`
- `game-classes`
- `maps`
- `mobs`
- `items`
- `combat`
- `auto-combat`
- `gathering`
- `crafting`
- `inventory`
- `equipment`
- `consumables`
- `infirmary`
- `incursions`
- `vendor`
- `world-bosses`

## Regras de frontend

Entrada:

- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/app/routes.tsx`

Padroes:

- Organize por feature em `frontend/src/features/`.
- APIs devem usar `apiClient` e, quando aplicavel, `API_ENDPOINTS`.
- Use `type` imports para tipos.
- Estado global so quando necessario; prefira estado local/hooks.
- Rotas protegidas ficam em `frontend/src/app/routes.tsx`.
- Ao criar nova tela do dashboard, atualizar rota, navegacao e providers se aplicavel.
- Atualize tipos junto com mudancas de contrato backend.
- Preserve mensagens de erro do backend quando existirem.
- CSS por feature; evite inflar `App.css` e `index.css`.
- Validar responsividade quando alterar layout.

Rotas atuais:

```text
/
/characters
/dashboard/:characterId
/dashboard/:characterId/auto-combat
/dashboard/:characterId/gathering
/dashboard/:characterId/gathering/:origin
/dashboard/:characterId/crafting
/dashboard/:characterId/inventory
/dashboard/:characterId/equipment
/dashboard/:characterId/consumables
/dashboard/:characterId/consumables/:merchantId
/dashboard/:characterId/infirmary
/dashboard/:characterId/membership
/dashboard/:characterId/maps
/dashboard/:characterId/incursions
/dashboard/:characterId/world-bosses
```

Storage conhecido:

- `dead_idle_access_token`
- `dead_idle_selected_character_id`
- `dead-idle.dashboard.gathering-subnav-open`
- prefixo `dead_idle_crafting_filters` em `sessionStorage`

## Regras de banco e migrations

Ao alterar persistencia:

1. Atualize `backend/prisma/schema.prisma`.
2. Crie migration com `npm run prisma:migrate` ou comando Prisma equivalente.
3. Rode `npm run prisma:generate`.
4. Atualize services, DTOs, seeds e tipos frontend/backend.
5. Rode testes/build proporcionais.

Nao altere migration antiga para "corrigir" schema ja migrado, salvo se o usuario pedir explicitamente e o ambiente for descartavel. Crie nova migration para evolucao normal.

Seeds canonicos ficam em `backend/prisma/seed-data/`. Seeds devem ser idempotentes quando representam dados canonicos.

Models atuais de alto impacto:

- `User`, `Character`, `GameClass`, `GameMap`, `SubMap`, `SubMapEncounter`
- `CharacterGatheringSkill`, `CharacterCraftingSkill`, `CharacterHuntingSkill`
- `Mob`, `MobDrop`, `Item`, `InventoryItem`, `BankItem`, `Equipment`, `CharacterPotionConfig`
- `Combat`, `CombatLog`
- `AutoCombatSession`, `AutoCombatHuntBatch`, `AutoCombatHuntBatchMob`, `AutoCombatHuntBatchEvent`, `AutoCombatSessionEvent`
- `GatheringSession`, `CraftingRecipe`, `CraftingSession`, `CraftingIngredient`
- `Incursion`, `CharacterIncursionSession`, `IncursionSessionReward`
- `WorldBoss`, `WorldBossEvent`, `WorldBossParticipant`, `WorldBossReward`, `WorldBossGrantedReward`

## Regras de autenticacao

- JWT Bearer via `JwtAuthGuard`.
- `UserRole`: `PLAYER`, `ADMIN`.
- `AuthService` retorna `user` e `accessToken`; nunca retornar `passwordHash`.
- Frontend remove token em `401`.
- `JWT_EXPIRES_IN` existe no `.env.example`, mas o `AuthModule` atual usa `expiresIn: '7d'` diretamente. Confirmar antes de documentar como variavel funcional.

## Regras de personagens e progressao

- `CharacterStatus`: `ACTIVE`, `DEAD`, `BLOCKED`, `DELETED`.
- Delete e logico via `deletedAt`.
- Personagem pertence a usuario; validar ownership sempre.
- Limite atual identificado: 2 personagens por usuario.
- Classes jogaveis: `Lutador`, `Assassino`, `Atirador`, `Medico`.
- Avatares dependem da classe; validar `avatarKey`.
- `LAUNCH_LEVEL_CAP = 50`.
- `FUTURE_LEVEL_CAP = 100`.
- `LEVELS_PER_TIER = 10`.
- Formulas de progressao ficam no backend, especialmente em `backend/src/common/config/` e `backend/src/common/utils/`.

## Regras de premium e idle

- Premium fica em `users.premiumUntil`.
- Helper compartilhado: conferir `membership.util.ts` e `membership.config.ts`.
- Free idle identificado: 6 horas.
- Premium idle identificado: 12 horas.
- Bonus premium de XP identificado: 20%.
- Tela `/membership` existe, mas compra/pagamento nao foi identificado como funcional.

Nao transforme a tela de membership em fonte de verdade. O backend decide se premium esta ativo.

## Regras de atividades exclusivas

`ActivityGuardService` deve bloquear conflitos entre:

- auto-combate
- gathering
- crafting
- incursions
- world bosses
- combate manual
- enfermaria

Antes de criar ou alterar atividade, revise o guard e os status persistidos. Nao permita duas sessoes ativas incompativeis por personagem.

## Regras de realtime

Namespaces Socket.IO atuais:

- `/auto-combat`
- `/gathering`
- `/crafting`
- `/incursions`
- `/world-bosses`

Providers realtime no dashboard:

- `LootNotificationProvider`
- `AutoCombatRealtimeProvider`
- `GatheringRealtimeProvider`
- `CraftingRealtimeProvider`
- `IncursionsRealtimeProvider`

Regras obrigatorias:

- Backend e banco sao a fonte da verdade.
- O visual nunca deve ser tratado como fonte real do estado.
- Ao montar tela, recarregar apos F5, voltar de alt-tab longo, reconectar socket ou retornar de offline, busque status/snapshot por REST quando existir.
- Eventos visuais sao derivados; eles nao podem substituir status persistido.
- Preserve fallback REST/polling quando socket cair.
- Limpe listeners, rooms, intervals e timeouts em unmount/disconnect.
- Evite duplicar eventos usando chaves como `eventKey`, `sequence`, `snapshotSequence`, `latestEventSequence`, `sessionId`, `enemyInstanceId` e identificadores de batch quando existirem.
- Nao resolva problema de sincronizacao apenas com `localStorage`, `sessionStorage`, estado React ou Zustand.
- Se houver lacuna de eventos, faca reconciliacao por status e recent-events.

## Regras de auto-combate, Hunt e batalha

Auto-combate e um dos sistemas mais sensiveis do projeto. Antes de alterar, leia:

- `backend/src/modules/auto-combat/auto-combat.service.ts`
- `backend/src/modules/auto-combat/auto-combat-state-machine.ts`
- `backend/src/modules/auto-combat/auto-combat.gateway.ts`
- `backend/src/modules/auto-combat/auto-combat.controller.ts`
- `frontend/src/features/auto-combat/`
- `frontend/src/services/websocket/socketClient.ts`

Estado atual identificado:

- `AutoCombatSessionStatus`: `ACTIVE`, `FINISHED`, `STOPPED`, `DEFEATED`.
- `AutoCombatSessionPhase`: `HUNTING`, `ENCOUNTER_READY`, `COMBAT_ACTIVE`.
- `AutoCombatHuntBatchStatus`: `HUNTING`, `READY`, `CONSUMED`, `CANCELLED`.
- Sessao ativa unica por personagem deve ser preservada.
- Eventos realtime sao persistidos em `AutoCombatSessionEvent` e entidades de hunt batch.

Regras especificas:

- Nao criar combate visual que nao exista no backend.
- Nao avancar fase apenas no frontend.
- Nao consumir loot, derrotar mob, trocar alvo ou encerrar sessao sem persistencia backend.
- Preservar ordem e dedupe de eventos.
- Preservar `huntBatchId`, `enemyInstanceId`, alvo selecionado e fase atual.
- Ao recarregar a pagina, reconstruir tela a partir de status/recent-events.
- Ao voltar de offline ou alt-tab longo, processar progresso pelo backend e reconciliar.
- Cuidado com timers: eles sao representacao visual; o calculo real deve estar no backend.
- Cuidado com volume de eventos; o frontend possui fila/reducer visual e o backend limita eventos recentes.
- `AUTO_COMBAT_ROUND_DURATION_SECONDS = 3` esta em config, mas o service atual tambem possui `AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS = 1`. Confirmar impacto antes de alterar duracao/TTK.

Parametros de hunt identificados no codigo:

- Cap de caca: 50.
- Nivel 1 rastreia 1 ameaca a cada 15s.
- Piso de tempo por ameaca: 6s.
- XP por ameaca: 5.

## Regras de gathering

- REST em `/gathering`.
- Socket.IO em `/gathering`.
- Origens: `DESMANCHE`, `COLETA`, `CONTENCAO`, `ARSENAL`, `PATRULHA`, `TECNOVARREDURA`, `DROP_MOBS`.
- Proficiencia por origem em `CharacterGatheringSkill`.
- Cap identificado: 50.
- O controller/gateway de gathering nao mostrou o mesmo padrao claro de `JwtAuthGuard` encontrado em outros modulos protegidos. Revisar autenticacao e ownership antes de producao.
- Gathering e atividade exclusiva; use `ActivityGuardService`.

## Regras de crafting

- REST protegido em `/crafting`.
- Socket.IO em `/crafting`.
- Usa `CraftingRecipe`, `CraftingIngredient`, `CraftingSession`, `CharacterCraftingSkill`.
- Cap identificado: 100.
- Crafting e atividade exclusiva.
- Atualizar receitas, ingredientes, seed-data, tipos e UI juntos.

## Regras de inventario, banco e equipamento

- Mochila: `InventoryItem`.
- Banco: `BankItem`.
- Equipamento: `Equipment`.
- Equipar/desequipar deve validar ownership, posse, slot, tier, classe, requisitos e espaco.
- Venda ao mercado negro usa `/inventory/black-market/sell`.
- Nao remover assets de itens sem auditar referencias no frontend, seeds e banco.

## Regras de consumiveis e enfermaria

- Config de pocao por personagem: `CharacterPotionConfig`.
- Auto-rest e flags de trade/use existem em migrations recentes.
- Enfermaria possui status, tratamento gratuito, claim, cancel e instant pago em gold.
- Tratamento gratuito identificado: 30 minutos.
- Uso deve respeitar atividades exclusivas.

## Regras de incursions

- REST protegido em `/incursions`.
- Socket.IO em `/incursions`.
- Dificuldades: `LOW`, `MEDIUM`, `HIGH`, `EXTREME`.
- Recompensas: `XP`, `GOLD`, `MATERIAL`, `CONSUMABLE`, `EQUIPMENT`, `ITEM`.
- Sessao de incursion deve reconciliar por status backend apos F5/reconnect.
- Incursion e atividade exclusiva.

## Regras de world bosses

- REST protegido em `/world-bosses`.
- Socket.IO em `/world-bosses`.
- Status: `SCHEDULED`, `LOBBY_OPEN`, `ACTIVE`, `DEFEATED`, `EXPIRED`, `REWARDED`, `CANCELLED`.
- Recompensas podem incluir `PET_EGG`.
- Participacao em world boss bloqueia outras atividades principais.
- Seed-data e `worldBoss.id` sao fontes importantes para deduplicar cards/eventos.
- Ha modo de teste identificado no service (`WORLD_BOSS_TEST_UNLOCK_ENABLED = true`). Confirmar antes de tratar disponibilidade como regra final de producao.

## Regras de vendor

- REST protegido em `/vendor`.
- Hub de mercadores no frontend usa `/dashboard/:characterId/consumables`.
- Compra usa `/vendor/:characterId/buy`.
- Validar gold, estoque/regra do item, ownership e inventario.

## Variaveis de ambiente

Backend (`backend/.env.example`):

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/nome_do_banco?schema=public"
JWT_SECRET="sua_chave_jwt"
JWT_EXPIRES_IN="7d"
REDIS_HOST="localhost"
REDIS_PORT="6379"
APP_PORT="3000"
```

Compose local usa PostgreSQL em `5433`:

```env
DATABASE_URL="postgresql://zumbi:zumbi123@localhost:5433/mmorpg_zumbi?schema=public"
```

Frontend (`frontend/.env.example`):

```env
VITE_API_URL=http://localhost:3000
VITE_DISCORD_URL=
```

O codigo tambem usa `VITE_SOCKET_URL`, `VITE_BACKEND_URL`, `VITE_HMR_PROTOCOL` e `VITE_HMR_CLIENT_PORT` em pontos especificos. O `frontend/.env.example` atual documenta essas variaveis, com HMR comentado por ser opcional.

## Comandos existentes

Backend:

```bash
cd backend
npm run build
npm run format
npm run start
npm run start:dev
npm run start:debug
npm run start:prod
npm run lint
npm test
npm run test:watch
npm run test:cov
npm run test:debug
npm run test:e2e
```

Prisma:

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
npm run prisma:seed
npm run prisma:audit:crafting-chain
npm run prisma:audit:economy-time
npm run prisma:export:economy-csv
npm run prisma:recipes:from-csv
npm run prisma:reset-characters:apprentice
npm run prisma:cleanup-items
npm run prisma:cleanup-items:apply
```

`test:grant-lutador-t1` existe no `backend/package.json`, mas o arquivo referenciado nao foi identificado. Confirmar antes de usar.

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm run lint
npm run preview
```

Nao ha script oficial de teste frontend identificado.

## Alteracoes seguras

Antes:

- Entenda o dominio e os contratos.
- Confira se ha mudancas nao suas no worktree.
- Identifique quais arquivos precisam mudar juntos.

Durante:

- Edite somente o necessario.
- Use helpers e padroes existentes.
- Nao troque fonte da verdade do backend para frontend.
- Nao remova fallbacks de polling/reconciliacao sem substituir por mecanismo equivalente.
- Mantenha erros legiveis e mensagens do backend quando possivel.

Depois:

- Rode lint/build/test conforme o escopo.
- Rode `git diff --check`.
- Revise `git status --short`.
- Informe arquivos alterados, comandos executados e riscos.

## Checklist antes de finalizar

Sempre:

- [ ] `git status --short` revisado antes e depois.
- [ ] Mudancas limitadas ao escopo.
- [ ] Nenhuma mudanca do usuario revertida.
- [ ] Nenhum segredo real exposto.
- [ ] Nenhum asset pesado, build, cache ou backup novo sem pedido.
- [ ] Documentacao atualizada quando comportamento, rota, script, env, schema ou regra mudar.

Backend:

- [ ] `cd backend && npm run lint` se alterar `backend/src` ou config backend.
- [ ] `cd backend && npm test` se alterar services/utils testaveis.
- [ ] `cd backend && npm run test:e2e` se alterar bootstrap, auth, rotas criticas ou fluxos integrados.
- [ ] `cd backend && npm run build` antes de entregar backend relevante.
- [ ] `cd backend && npm run prisma:generate` apos alterar `schema.prisma`.
- [ ] Migration criada para mudanca persistente de schema.
- [ ] Seed atualizada e validada quando a regra depende de dados canonicos.

Frontend:

- [ ] `cd frontend && npm run lint` se alterar `frontend/src` ou config frontend.
- [ ] `cd frontend && npm run build` antes de entregar frontend relevante.
- [ ] Rotas, APIs, tipos, stores/providers e CSS atualizados juntos.
- [ ] Loading, erro e vazio tratados em telas novas/alteradas.
- [ ] Responsividade verificada em alteracoes de layout.

Realtime:

- [ ] Namespace correto conferido.
- [ ] Eventos e payloads alinhados entre backend e frontend.
- [ ] Join/leave por personagem/evento validado.
- [ ] Listeners/intervals limpos.
- [ ] F5, reconnect, alt-tab e retorno offline reconciliam por backend.
- [ ] Fallback REST/polling continua aceitavel.

## Pontos conhecidos a confirmar

- Versao minima exata de Node.js nao identificada.
- CI/CD nao identificado.
- Dockerfile de aplicacao nao identificado.
- `LICENSE` nao identificado; backend declara `UNLICENSED`.
- `JWT_EXPIRES_IN` nao e usado dinamicamente no `AuthModule` atual.
- Confirmar se `VITE_BACKEND_URL` deve continuar como fallback legado ou se deve ser consolidado em `VITE_API_URL`/`VITE_SOCKET_URL`.
- Gathering precisa de revisao de autenticacao/ownership antes de producao.
- World boss tem modo de teste habilitado no service atual.
