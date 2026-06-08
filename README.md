# MMORPG Idle Zumbi

Ultima revisao: 2026-06-08.

Este README foi refeito a partir do estado real do working tree local. O codigo, o schema Prisma, as migrations, os `package.json` e os arquivos de configuracao continuam sendo a fonte da verdade. Quando algo nao foi identificado diretamente no repositorio, isso esta marcado como "confirmar manualmente".

## Descricao

MMORPG Idle Zumbi e um jogo web full stack de sobrevivencia zumbi com progressao idle/MMORPG. O jogador cria personagens, escolhe classe, navega por mapas, enfrenta mobs, usa auto-combate com fase de caca, coleta materiais, cria itens, gerencia inventario/equipamentos, participa de incursions e world bosses, e pode ter beneficios premium.

O projeto esta dividido em:

- `backend/`: API NestJS, Prisma, PostgreSQL, regras de dominio e gateways Socket.IO.
- `frontend/`: aplicacao React/Vite, rotas de dashboard, estado local/global e clientes REST/WebSocket.
- `infra/`: Docker Compose local para PostgreSQL e Redis.
- `docs/`: documentos e dados auxiliares, incluindo CSVs de economia/crafting e pacote de imagens de mobs.

## Visao geral do sistema

Fluxo principal atual:

1. Usuario registra ou faz login por `/auth/register` ou `/auth/login`.
2. Backend retorna `user` sem `passwordHash` e um `accessToken`.
3. Frontend salva o token no `localStorage` com a chave `dead_idle_access_token`.
4. `apiClient` injeta `Authorization: Bearer <token>` nas chamadas REST.
5. Usuario seleciona ou cria personagem em `/characters`.
6. Dashboard em `/dashboard/:characterId` carrega overview, status, equipamentos, moedas, atividades e atalhos.
7. Sistemas idle e realtime sincronizam por REST e Socket.IO, com polling de apoio em algumas telas.

O backend deve ser tratado como fonte da verdade para estado de personagem, atividades, sessoes, timers, recompensas, eventos e progresso. O frontend renderiza e reconcilia esse estado.

## Stack utilizada

| Camada | Tecnologias identificadas |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, Zustand, Axios, Socket.IO Client, clsx, lucide-react |
| Backend | NestJS 11, TypeScript, Prisma 6, Passport/JWT, bcrypt, Socket.IO, ioredis |
| Banco | PostgreSQL via Prisma ORM |
| Realtime | Socket.IO no backend e no frontend |
| Infra local | Docker Compose com PostgreSQL 16 e Redis 7 |
| Testes backend | Jest e Supertest |
| Build frontend | `tsc -b` e `vite build` |

Nao foi identificado arquivo de CI/CD versionado. Nao foi identificado `Dockerfile` de aplicacao. Nao foi identificado arquivo `LICENSE`; o `backend/package.json` declara `UNLICENSED`.

## Estrutura de pastas

```text
.
|-- AGENTS.md
|-- README.md
|-- AUTOCOMBAT.md
|-- docs/
|   |-- economia-crafting-csv/
|   `-- mob-image-pack/
|-- infra/
|   `-- docker-compose.yml
|-- backend/
|   |-- package.json
|   |-- src/
|   |   |-- common/
|   |   |-- modules/
|   |   `-- prisma/
|   |-- prisma/
|   |   |-- schema.prisma
|   |   |-- migrations/
|   |   |-- seed.ts
|   |   `-- seed-data/
|   `-- test/
`-- frontend/
    |-- package.json
    |-- public/
    `-- src/
        |-- app/
        |-- assets/
        |-- components/
        |-- features/
        |-- services/
        |-- store/
        |-- types/
        `-- utils/
```

Pastas que exigem cuidado:

- `docs/mob-image-pack/` e `docs/mob-image-pack.zip`: pacote/manifesto de imagens.
- `docs/economia-crafting-csv/`: dados de economia/crafting.
- `frontend/src/assets/images/`: muitos assets do jogo; nao remover sem auditar referencias.
- `frontend/_backup_gathering/` e `frontend/_backup_gathering_unused/`: backups locais de telas/componentes de gathering.
- Arquivos auxiliares como `project-tree.md`, `project-files.md`, `local-changes.md` podem estar desatualizados; confirmar antes de confiar.

## Pre-requisitos

- Node.js e npm instalados. A versao minima nao foi identificada no repositorio; confirmar manualmente conforme a compatibilidade de NestJS 11, React 19 e Vite 8.
- Docker e Docker Compose para PostgreSQL/Redis locais.
- PostgreSQL disponivel, se nao usar Docker.
- Redis disponivel, se os fluxos que dependem dele forem exercitados.

Em Windows/PowerShell, se `npm` falhar por politica de execucao do `npm.ps1`, use `npm.cmd`.

## Configuracao de ambiente

### Backend

Crie `backend/.env` com base em `backend/.env.example`.

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/nome_do_banco?schema=public"
JWT_SECRET="sua_chave_jwt"
JWT_EXPIRES_IN="7d"
REDIS_HOST="localhost"
REDIS_PORT="6379"
APP_PORT="3000"
```

Para o Docker Compose deste repositorio, a porta local do PostgreSQL e `5433`:

```env
DATABASE_URL="postgresql://zumbi:zumbi123@localhost:5433/mmorpg_zumbi?schema=public"
JWT_SECRET="troque_esta_chave"
JWT_EXPIRES_IN="7d"
REDIS_HOST="localhost"
REDIS_PORT="6379"
APP_PORT="3000"
```

Observacao: `JWT_EXPIRES_IN` existe no `.env.example`, mas o `AuthModule` atual usa `expiresIn: '7d'` diretamente no codigo. Se precisar tornar esse valor configuravel, altere o codigo e documente a mudanca.

### Frontend

Crie `frontend/.env` com base em `frontend/.env.example`.

```env
VITE_API_URL=http://localhost:3000
VITE_DISCORD_URL=
```

Variaveis tambem usadas pelo codigo:

```env
VITE_SOCKET_URL=http://localhost:3000
VITE_BACKEND_URL=http://localhost:3000
VITE_HMR_PROTOCOL=ws
VITE_HMR_CLIENT_PORT=5173
```

`VITE_SOCKET_URL`, `VITE_BACKEND_URL`, `VITE_HMR_PROTOCOL` e `VITE_HMR_CLIENT_PORT` aparecem no codigo e estao refletidos no `.env.example` atual. As variaveis de HMR ficam comentadas por serem opcionais.

## Instalacao

Instale dependencias separadamente:

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

Nao ha `package.json` raiz identificado. Os comandos devem ser executados dentro de `backend/` ou `frontend/`.

## Docker local

O arquivo `infra/docker-compose.yml` sobe PostgreSQL 16 e Redis 7:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Parar containers:

```bash
docker compose -f infra/docker-compose.yml down
```

Parar e remover volumes:

```bash
docker compose -f infra/docker-compose.yml down -v
```

Servicos atuais:

- PostgreSQL: container `mmorpg-idle-zumbi-db`, porta local `5433`, banco `mmorpg_zumbi`, usuario `zumbi`, senha `zumbi123`.
- Redis: container `mmorpg-idle-zumbi-redis`, porta local `6379`.

## Banco, Prisma e seed

O schema fica em `backend/prisma/schema.prisma`. As migrations ficam em `backend/prisma/migrations/`.

Comandos principais:

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run prisma:studio
```

Scripts Prisma/auditoria identificados:

```bash
cd backend
npm run prisma:audit:crafting-chain
npm run prisma:audit:economy-time
npm run prisma:export:economy-csv
npm run prisma:recipes:from-csv
npm run prisma:reset-characters:apprentice
npm run prisma:cleanup-items
npm run prisma:cleanup-items:apply
```

O script `test:grant-lutador-t1` existe no `backend/package.json`, mas o arquivo `backend/prisma/grant-lutador-tier1-items.ts` nao foi identificado na listagem atual. Confirmar manualmente antes de usar.

Seed-data modular identificado em `backend/prisma/seed-data/`:

- classes
- consumables
- encounters
- gathering
- gathering materials
- incursions
- items
- maps
- mob drops
- mob stats
- mobs
- recipe balance overrides
- recipes
- world bosses

## Como rodar

### Backend em desenvolvimento

```bash
cd backend
npm run start:dev
```

Porta padrao: `3000`, configuravel por `APP_PORT`.

O backend habilita CORS com lista de origens locais e dominios `trycloudflare.com`, usa `credentials: true` e aplica `ValidationPipe` global com `whitelist`, `forbidNonWhitelisted` e `transform`.

### Frontend em desenvolvimento

```bash
cd frontend
npm run dev
```

Porta padrao do Vite: normalmente `5173`, salvo outra configuracao/local livre.

### Build

Backend:

```bash
cd backend
npm run build
```

Frontend:

```bash
cd frontend
npm run build
```

## Scripts uteis

### Backend

```bash
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

### Frontend

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

Nao foi identificado script oficial de testes frontend no `frontend/package.json`.

## Backend

Entrada principal:

- `backend/src/main.ts`: bootstrap Nest, CORS, `ValidationPipe`, porta e listen.
- `backend/src/app.module.ts`: composicao dos modulos.
- `backend/src/prisma/prisma.service.ts`: conexao Prisma.

Modulos atuais em `backend/src/modules/`:

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

Pastas comuns:

- `backend/src/common/activity-guard/`: exclusividade entre atividades.
- `backend/src/common/config/`: configuracoes de auto-combate, crafting, gathering, membership, progressao e starter kit.
- `backend/src/common/utils/`: formulas e utilitarios de combate, level, stats, gathering, membership e penalidades.

## Frontend

Entrada principal:

- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/app/routes.tsx`

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

Features atuais em `frontend/src/features/`:

- `auth`
- `auto-combat`
- `characters`
- `consumables`
- `crafting`
- `dashboard`
- `equipment`
- `gathering`
- `incursions`
- `infirmary`
- `inventory`
- `loot-notifications`
- `maps`
- `membership`
- `overview`
- `utils`
- `vendor`
- `world-bosses`

Servicos importantes:

- `frontend/src/services/api/apiClient.ts`: Axios, token Bearer e limpeza de token em `401`.
- `frontend/src/services/api/authToken.ts`: chave `dead_idle_access_token`.
- `frontend/src/services/api/endpoints.ts`: caminhos REST centralizados.
- `frontend/src/services/websocket/socketClient.ts`: sockets de auto-combate e world bosses.

Chaves de storage identificadas:

- `dead_idle_access_token`
- `dead_idle_selected_character_id`
- `dead-idle.dashboard.gathering-subnav-open`
- prefixo de `sessionStorage` `dead_idle_crafting_filters`

## Modelos e enums Prisma

Models principais identificados:

- Usuario e personagem: `User`, `Character`, `GameClass`, `GameMap`, `SubMap`, `SubMapEncounter`
- Proficiencias: `CharacterGatheringSkill`, `CharacterCraftingSkill`, `CharacterHuntingSkill`
- Combate e mobs: `Mob`, `MobDrop`, `Combat`, `CombatLog`
- Auto-combate: `AutoCombatSession`, `AutoCombatHuntBatch`, `AutoCombatHuntBatchMob`, `AutoCombatHuntBatchEvent`, `AutoCombatSessionLoot`, `AutoCombatSessionMobSummary`, `AutoCombatSessionEvent`
- Itens: `Item`, `InventoryItem`, `BankItem`, `Equipment`, `CharacterPotionConfig`
- Gathering/crafting: `GatheringSession`, `CraftingRecipe`, `CraftingSession`, `CraftingIngredient`
- Incursions: `Incursion`, `IncursionLootTable`, `CharacterIncursionSession`, `IncursionSessionReward`
- World bosses: `WorldBoss`, `WorldBossEvent`, `WorldBossParticipant`, `WorldBossReward`, `WorldBossGrantedReward`

Enums relevantes:

- `UserRole`
- `CharacterStatus`
- `Rarity`
- `ItemSlot`
- `InventoryItemType`
- `CombatStatus`
- `CombatActor`
- `AutoCombatSessionStatus`
- `AutoCombatSessionPhase`
- `AutoCombatHuntBatchStatus`
- `MaterialOrigin`
- `ActivityStatus`
- `CraftIngredientRole`
- `IncursionDifficulty`
- `IncursionRewardType`
- `IncursionSessionStatus`
- `WorldBossEventStatus`
- `WorldBossRewardType`

## Sistemas principais

### Autenticacao

- JWT Bearer com `JwtAuthGuard`.
- `UserRole`: `PLAYER`, `ADMIN`.
- Login e registro retornam `user` e `accessToken`.
- `passwordHash` nao deve ser retornado.
- Frontend remove o token em respostas `401`.

### Personagens

- `CharacterStatus`: `ACTIVE`, `DEAD`, `BLOCKED`, `DELETED`.
- Exclusao e logica via `deletedAt`.
- Limite atual identificado: 2 personagens por usuario.
- Classes jogaveis seedadas: `Lutador`, `Assassino`, `Atirador`, `Medico`.
- Personagem inicializa com classe, mapa, HP, equipamentos starter, inventario, configuracao de pocao e proficiencias.
- Avatares dependem da classe e usam `avatarKey`.

### Progressao e premium

- `LAUNCH_LEVEL_CAP = 50`.
- `FUTURE_LEVEL_CAP = 100`.
- `LEVELS_PER_TIER = 10`.
- Premium fica em `User.premiumUntil`.
- Limite idle free: 6 horas.
- Limite idle premium: 12 horas.
- Bonus premium de XP identificado: 10% (`PREMIUM_XP_BONUS_MULTIPLIER = 1.1`).
- A tela `/membership` existe, mas pagamento/compra nao foi identificado como funcional no repositorio.

### Atividades exclusivas

`ActivityGuardService` deve impedir conflitos entre atividades principais:

- auto-combate
- gathering
- crafting
- incursions
- world bosses
- combate manual
- enfermaria

Ao criar uma atividade nova, atualize o guard e revise todos os fluxos que dependem de sessao ativa.

### Auto-combate, Hunt e batalha

O auto-combate atual possui fases e estado persistido:

- `HUNTING`
- `ENCOUNTER_READY`
- `COMBAT_ACTIVE`

Entidades relacionadas:

- `AutoCombatSession`
- `AutoCombatHuntBatch`
- `AutoCombatHuntBatchMob`
- `AutoCombatHuntBatchEvent`
- `AutoCombatSessionEvent`

Endpoints REST protegidos em `/auto-combat` incluem start, hunt start/stop, battle start, preview, status, recent-events e stop.

Constantes identificadas:

- `AUTO_COMBAT_ROUND_DURATION_SECONDS = 3` em config.
- O service atual tambem possui `AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS = 1`; confirmar o impacto antes de alterar duracoes.
- Caca tem cap 50.
- Caca nivel 1 rastreia 1 ameaca a cada 15s.
- Piso de tempo por ameaca identificado: 6s.
- XP de caca por ameaca identificado: 5.
- Eventos recentes sao limitados e persistidos para reconciliacao visual.

Campos/eventos como `eventKey`, `sequence`, `snapshotSequence`, `latestEventSequence`, `phase`, `sessionId`, `enemyInstanceId`, `huntBatchId` e dados de alvo de batalha devem ser preservados para evitar duplicidade, eventos fora de ordem ou visual divergente.

### Gathering

- REST em `/gathering`.
- Socket.IO em `/gathering`.
- Origens: `DESMANCHE`, `COLETA`, `CONTENCAO`, `ARSENAL`, `PATRULHA`, `TECNOVARREDURA`, `DROP_MOBS`.
- Proficiencia por origem em `CharacterGatheringSkill`.
- Cap identificado: 50.
- O controller/gateway de gathering nao mostrou o mesmo padrao claro de `JwtAuthGuard` visto em outros modulos protegidos. Revisar autenticacao e ownership antes de tratar como pronto para producao.

### Crafting

- REST protegido em `/crafting`.
- Socket.IO em `/crafting`.
- Usa `CraftingRecipe`, `CraftingIngredient`, `CraftingSession` e `CharacterCraftingSkill`.
- Cap identificado em config: 100.
- Crafting e atividade exclusiva.

### Inventario, banco e equipamento

- Mochila: `InventoryItem`.
- Banco: `BankItem`.
- Equipamentos: `Equipment`.
- Equipar/desequipar deve validar ownership, posse do item, slot, tier, classe, requisitos e espaco no inventario.
- Venda ao mercado negro usa `/inventory/black-market/sell`.

### Consumiveis e enfermaria

- Config de pocao por personagem em `CharacterPotionConfig`.
- Auto-rest e flags de trade/use existem em migrations recentes.
- Enfermaria possui status, tratamento gratuito, claim, cancel e atendimento instantaneo pago.
- Tratamento gratuito identificado: 30 minutos.

### Incursions

- REST protegido em `/incursions`.
- Socket.IO em `/incursions`.
- Usa `Incursion`, `IncursionLootTable`, `CharacterIncursionSession`, `IncursionSessionReward`.
- Dificuldades: `LOW`, `MEDIUM`, `HIGH`, `EXTREME`.
- Recompensas: `XP`, `GOLD`, `MATERIAL`, `CONSUMABLE`, `EQUIPMENT`, `ITEM`.

### World bosses

- REST protegido em `/world-bosses`.
- Socket.IO em `/world-bosses`.
- Usa lobby, status de evento, dano, participacao, ranking e recompensas.
- Status: `SCHEDULED`, `LOBBY_OPEN`, `ACTIVE`, `DEFEATED`, `EXPIRED`, `REWARDED`, `CANCELLED`.
- Recompensas podem incluir `PET_EGG`.
- Ha modo de teste identificado no service (`WORLD_BOSS_TEST_UNLOCK_ENABLED = true`). Confirmar antes de tratar regras de agenda/disponibilidade como regras finais de producao.

### Vendor

- REST protegido em `/vendor`.
- Hub de mercadores no frontend fica em `/dashboard/:characterId/consumables`.
- Compra usa `/vendor/:characterId/buy`.

## Tempo real e sincronizacao

Namespaces Socket.IO identificados:

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

Pontos essenciais:

- Backend e banco sao a fonte da verdade.
- Frontend deve reconciliar por REST ao montar tela, apos F5, apos reconnect, apos alt-tab longo e apos retorno de periodo offline.
- Eventos visuais nao devem substituir status persistido.
- Ao perder socket, preserve fallback REST/polling quando existir.
- Sempre limpar listeners, rooms, intervals e timeouts em disconnect/unmount.
- Use snapshots/status/recent-events para fechar lacunas entre eventos.
- Nao confiar apenas em cache local para sessao ativa, fase de hunt, alvo selecionado, batalha em andamento, loot ou recompensas.

## Fluxo basico de desenvolvimento

1. Confira o estado:

```bash
git status --short
rg --files -g "!node_modules" -g "!dist" -g "!coverage"
```

2. Leia os arquivos reais do modulo que sera alterado.
3. Altere apenas o escopo necessario.
4. Atualize tipos, endpoints, DTOs, stores/providers e CSS juntos quando o contrato mudar.
5. Se alterar schema Prisma, crie migration e rode generate.
6. Rode validacoes proporcionais ao escopo.
7. Revise `git diff` antes de finalizar.

## Validacao

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

Escolha as validacoes conforme o escopo. Para mudancas somente de documentacao, `git diff --check` e revisao do diff podem ser suficientes.

## Troubleshooting

### `npm.ps1` bloqueado no PowerShell

Use `npm.cmd`:

```bash
npm.cmd install
npm.cmd run build
```

### Banco local nao conecta

Confirme se o Docker Compose esta rodando e se `DATABASE_URL` usa porta `5433` quando estiver usando `infra/docker-compose.yml`.

```bash
docker compose -f infra/docker-compose.yml ps
```

### Prisma client desatualizado

Rode:

```bash
cd backend
npm run prisma:generate
```

### Frontend nao fala com backend

Verifique:

- `VITE_API_URL`
- CORS em `backend/src/main.ts`
- token `dead_idle_access_token`
- resposta `401`, que remove token no frontend

### WebSocket nao conecta

Verifique:

- `VITE_SOCKET_URL`
- `VITE_API_URL`
- namespace correto (`/auto-combat`, `/gathering`, `/crafting`, `/incursions`, `/world-bosses`)
- token Bearer/auth
- CORS e credenciais
- fallback REST/polling da tela

### Auto-combate visual diverge do backend

Recarregue status/recent-events por REST e confirme `sessionId`, `phase`, `sequence`, `eventKey`, `huntBatchId` e alvo de batalha. O visual deve ser reconstruido a partir do estado persistido, nao de estado local antigo.

## Pontos a confirmar manualmente

- Versao minima exata de Node.js.
- Estrategia de deploy/producao e CI/CD.
- Dockerfile de aplicacao nao identificado.
- `JWT_EXPIRES_IN` existe no env, mas nao e usado dinamicamente no `AuthModule` atual.
- Confirmar se `VITE_BACKEND_URL` deve continuar como fallback legado ou se deve ser consolidado em `VITE_API_URL`/`VITE_SOCKET_URL`.
- `test:grant-lutador-t1` referencia arquivo nao identificado na arvore atual.
- Autenticacao/ownership de gathering precisa de revisao antes de producao.
- Modo de teste de world boss esta habilitado no codigo atual e deve ser revisado antes de producao.
