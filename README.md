# MMORPG Idle Zumbi

Documentacao atualizada do projeto **MMORPG Idle Zumbi**, um jogo web full stack de sobrevivencia zumbi com progressao idle/MMORPG.

Ultima revisao deste README: 2026-06-01, com base no working tree local atual.

## Estado Atual

O projeto esta em desenvolvimento/MVP, mas ja possui uma base jogavel com:

- autenticacao por JWT;
- criacao, selecao e dashboard de personagens;
- progressao de nivel, XP, HP, gold e cash;
- inventario, banco do personagem, equipamentos e venda no mercado negro;
- combate manual e auto-combate idle;
- gathering/expedicoes idle por origem de material;
- crafting com sessoes temporizadas;
- mercadores/loja de consumiveis;
- enfermaria com atendimento gratuito temporizado e atendimento instantaneo pago;
- incursions/operacoes temporizadas;
- world bosses/ameacas globais com lobby, participacao e ranking;
- tela premium/membership em preparacao;
- tempo real via Socket.IO em sistemas idle e eventos globais.

O working tree local esta com varias mudancas nao commitadas, principalmente em imagens, membership, enfermaria, balanceamento idle e contratos de realtime. A ultima versao commitada pode nao conter tudo que esta descrito aqui.

## Stack

### Backend

- Node.js + TypeScript.
- NestJS 11.
- Prisma ORM 6.
- PostgreSQL.
- Socket.IO com gateways NestJS.
- JWT com `@nestjs/jwt`, Passport e `passport-jwt`.
- `bcrypt` para senha.
- `class-validator` e `class-transformer`.
- Jest, Supertest, ESLint e Prettier.

### Frontend

- React 19.
- TypeScript.
- Vite 8.
- React Router DOM 7.
- Zustand.
- Axios.
- Socket.IO Client.
- Lucide React.
- CSS por feature.

### Infra local

- Docker Compose.
- PostgreSQL 16 em `localhost:5433`.
- Redis 7 em `localhost:6379`.

## Estrutura

```text
.
├── AGENTS.md
├── README.md
├── AUTOCOMBAT.md
├── Gathering_Idle_Zumbi_Documento_Oficial.docx
├── docs/
│   ├── economia-crafting-csv/
│   └── mob-image-pack/
├── infra/
│   └── docker-compose.yml
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   ├── seed.ts
│   │   └── seed-data/
│   ├── src/
│   │   ├── common/
│   │   ├── modules/
│   │   └── prisma/
│   └── test/
└── frontend/
    ├── public/
    └── src/
        ├── app/
        ├── assets/
        ├── components/
        ├── features/
        ├── services/
        ├── store/
        ├── types/
        └── utils/
```

Arquivos auxiliares relevantes:

- `AUTOCOMBAT.md`: notas especificas de auto-combate.
- `docs/economia-crafting-csv/`: CSVs de economia, crafting, drops, mapas e resumo.
- `docs/mob-image-pack/`: manifestos e prompts de imagens de mobs.
- `_backup_remove_bg/`: backup local de imagens antes de remocao de fundo.
- `tools/remove_bg_to_backup.py`: ferramenta local para fluxo de assets.
- `project-tree.md`, `project-files.md`, `local-changes.md`: documentacao auxiliar antiga/local.

## Backend

Entrada principal:

- `backend/src/main.ts`: cria a app Nest, habilita CORS com `origin: true`, aplica `ValidationPipe` global com `whitelist`, `forbidNonWhitelisted` e `transform`, e usa `APP_PORT` com fallback `3000`.
- `backend/src/app.module.ts`: registra `ConfigModule`, `PrismaModule` e todos os modulos de dominio.

Modulos atuais em `backend/src/modules/`:

- `auth`: registro, login, `/auth/me`, JWT e Passport.
- `users`: operacoes internas de usuario.
- `characters`: criacao, listagem, status, overview, troca de mapa e delete logico.
- `game-classes`: classes jogaveis.
- `maps`: mapas e consulta por ID.
- `mobs`: mobs e consulta por ID.
- `items`: itens e consulta por ID.
- `combat`: combate manual.
- `auto-combat`: auto-combate idle REST e Socket.IO.
- `gathering`: gathering idle REST e Socket.IO.
- `crafting`: receitas, craft temporizado e Socket.IO.
- `inventory`: mochila, banco, deposito, saque e venda no mercado negro.
- `equipment`: equipar e desequipar.
- `consumables`: uso de consumiveis e configuracao de pocao.
- `infirmary`: cura instantanea e tratamento temporizado.
- `incursions`: operacoes temporizadas por mapa, custo e recompensas.
- `vendor`: loja/mercadores.
- `world-bosses`: ameacas globais, lobby, combate coletivo e ranking.

### Rotas HTTP

Nao ha prefixo global `/api` configurado em `main.ts`.

Rotas publicas ou catalogo:

| Metodo | Endpoint | Descricao |
|---|---|---|
| `GET` | `/` | Health/root simples. |
| `POST` | `/auth/register` | Cadastro. |
| `POST` | `/auth/login` | Login. |
| `GET` | `/game-classes` | Lista classes. |
| `GET` | `/game-classes/:id` | Consulta classe. |
| `GET` | `/maps` | Lista mapas. |
| `GET` | `/maps/:id` | Consulta mapa. |
| `GET` | `/mobs` | Lista mobs. |
| `GET` | `/mobs/:id` | Consulta mob. |
| `GET` | `/items` | Lista itens. |
| `GET` | `/items/:id` | Consulta item. |
| `GET` | `/gathering/materials` | Lista materiais por mapa/origem. |

Rotas protegidas por `JwtAuthGuard`:

| Metodo | Endpoint |
|---|---|
| `GET` | `/auth/me` |
| `POST` | `/characters` |
| `GET` | `/characters/me` |
| `GET` | `/characters/:id` |
| `GET` | `/characters/:id/status` |
| `GET` | `/characters/:id/overview` |
| `PATCH` | `/characters/:id/current-map` |
| `DELETE` | `/characters/:id` |
| `POST` | `/combat/start` |
| `GET` | `/auto-combat/online-count` |
| `POST` | `/auto-combat/start` |
| `POST` | `/auto-combat/preview` |
| `GET` | `/auto-combat/:characterId/status` |
| `GET` | `/auto-combat/:characterId/recent-events` |
| `POST` | `/auto-combat/:characterId/stop` |
| `GET` | `/inventory/:characterId` |
| `GET` | `/inventory/:characterId/bank` |
| `POST` | `/inventory/bank/deposit` |
| `POST` | `/inventory/bank/withdraw` |
| `POST` | `/inventory/black-market/sell` |
| `GET` | `/equipment/:characterId` |
| `POST` | `/equipment/equip` |
| `POST` | `/equipment/unequip` |
| `POST` | `/consumables/use` |
| `GET` | `/consumables/:characterId/config` |
| `PATCH` | `/consumables/:characterId/config` |
| `GET` | `/infirmary/:characterId/status` |
| `POST` | `/infirmary/:characterId/heal` |
| `POST` | `/infirmary/:characterId/start` |
| `POST` | `/infirmary/:characterId/claim` |
| `POST` | `/infirmary/:characterId/cancel` |
| `POST` | `/infirmary/:characterId/instant` |
| `GET` | `/vendor/:characterId/shop` |
| `POST` | `/vendor/:characterId/buy` |
| `GET` | `/crafting/character/:characterId/recipes` |
| `GET` | `/crafting/character/:characterId/status` |
| `GET` | `/crafting/:itemId/recipe` |
| `POST` | `/crafting/craft` |
| `POST` | `/crafting/character/:characterId/stop` |
| `GET` | `/incursions` |
| `GET` | `/incursions/:characterId/available` |
| `GET` | `/incursions/:characterId/status` |
| `POST` | `/incursions/start` |
| `POST` | `/incursions/claim` |
| `POST` | `/incursions/:characterId/cancel` |
| `GET` | `/world-bosses/:characterId/available` |
| `GET` | `/world-bosses/:characterId/active` |
| `GET` | `/world-bosses/:characterId/status` |
| `POST` | `/world-bosses/join` |
| `POST` | `/world-bosses/leave` |
| `POST` | `/world-bosses/:eventId/leave` |
| `GET` | `/world-bosses/:eventId/ranking` |

Observacao: as rotas REST de `gathering/start`, `gathering/:characterId/status`, `collect` e `stop` ainda nao usam `JwtAuthGuard` no controller atual. Revise isso antes de considerar o modulo seguro para producao.

### WebSocket

Namespaces atuais:

| Namespace | Uso |
|---|---|
| `/auto-combat` | Eventos de auto-combate. |
| `/gathering` | Progresso de gathering. |
| `/crafting` | Progresso de crafting. |
| `/incursions` | Progresso de incursions. |
| `/world-bosses` | Lobby, status e eventos de world boss. |

Eventos principais:

- auto-combat: `auto-combat:join`, `auto-combat:leave`, `status`, `session-updated`, `hit`, `dodge`, `mob-spawned`, `mob-defeated`, `player-defeated`, `potion-used`, `finished`, `stopped`.
- gathering: `gathering:join`, `leave`, `status:request`, `refresh`, `start`, `collect`, `stop`.
- crafting: `crafting:join`, `leave`, `status:request`, `refresh`, `started`, `progress`, `completed`, `stopped`.
- incursions: `incursion:join`, `leave`, `status:request`, `started`, `progress`, `completed`, `rewarded`, `cancelled`.
- world bosses: `worldBoss:join`, `leave`, `statusUpdated`, `lobbyOpened`, `joinedLobby`, `leftLobby`, `lobbyUpdated`, `battleStarted`, `damage`, `progress`, `defeated`, `expired`, `rewarded`.

## Frontend

Entrada principal:

- `frontend/src/main.tsx`.
- `frontend/src/App.tsx`.
- `frontend/src/app/routes.tsx`.

Features atuais em `frontend/src/features/`:

- `auth`
- `characters`
- `dashboard`
- `auto-combat`
- `gathering`
- `crafting`
- `inventory`
- `equipment`
- `consumables`
- `infirmary`
- `vendor`
- `maps`
- `incursions`
- `world-bosses`
- `membership`
- `loot-notifications`
- `overview`
- `utils`

Rotas atuais:

| Rota | Tela |
|---|---|
| `/` | Login/cadastro (`AuthPage`) |
| `/characters` | Selecao/criacao de personagem |
| `/dashboard/:characterId` | Visao geral |
| `/dashboard/:characterId/auto-combat` | Auto-combate |
| `/dashboard/:characterId/gathering` | Hub de gathering |
| `/dashboard/:characterId/gathering/:origin` | Origem de gathering |
| `/dashboard/:characterId/crafting` | Crafting |
| `/dashboard/:characterId/inventory` | Mochila/banco/mercado negro |
| `/dashboard/:characterId/equipment` | Placeholder de equipamentos |
| `/dashboard/:characterId/consumables` | Hub de mercadores |
| `/dashboard/:characterId/consumables/:merchantId` | Loja de mercador |
| `/dashboard/:characterId/infirmary` | Enfermaria |
| `/dashboard/:characterId/membership` | Premium |
| `/dashboard/:characterId/maps` | Selecao de mapas |
| `/dashboard/:characterId/incursions` | Incursions |
| `/dashboard/:characterId/world-bosses` | World bosses |

Providers realtime no dashboard:

- `LootNotificationProvider`
- `AutoCombatRealtimeProvider`
- `GatheringRealtimeProvider`
- `CraftingRealtimeProvider`
- `IncursionsRealtimeProvider`

O cliente HTTP fica em `frontend/src/services/api/apiClient.ts`, injeta `Authorization: Bearer <token>` e remove o token local em `401`.

Chaves de `localStorage` importantes:

- `dead_idle_access_token`
- `dead_idle_selected_character_id`
- `dead-idle.dashboard.gathering-subnav-open`

## Banco de Dados

Schema Prisma:

```text
backend/prisma/schema.prisma
```

Enums principais:

- `UserRole`: `PLAYER`, `ADMIN`.
- `CharacterStatus`: `ACTIVE`, `DEAD`, `BLOCKED`, `DELETED`.
- `Rarity`: `COMMON`, `UNCOMMON`, `RARE`, `EPIC`, `LEGENDARY`.
- `ItemSlot`: `MAIN_HAND`, `OFF_HAND`, `HEAD`, `ARMOR`, `PANTS`, `BOOTS`, `MATERIAL`, `CONSUMABLE`.
- `InventoryItemType`: `EQUIPMENT`, `MATERIAL`, `CONSUMABLE`.
- `CombatStatus`: `IN_PROGRESS`, `PLAYER_WIN`, `PLAYER_LOSE`, `CANCELLED`.
- `CombatActor`: `PLAYER`, `MOB`, `SYSTEM`.
- `AutoCombatSessionStatus`: `ACTIVE`, `FINISHED`, `STOPPED`, `DEFEATED`.
- `MaterialOrigin`: `DESMANCHE`, `COLETA`, `CONTENCAO`, `ARSENAL`, `PATRULHA`, `TECNOVARREDURA`, `DROP_MOBS`.
- `ActivityStatus`: `ACTIVE`, `STOPPED`, `COMPLETED`.
- `CraftIngredientRole`: `MAIN_COMPONENT`, `SHARED_MATERIAL`, `RARE_MOB_DROP`.
- `IncursionDifficulty`: `LOW`, `MEDIUM`, `HIGH`, `EXTREME`.
- `IncursionRewardType`: `XP`, `GOLD`, `MATERIAL`, `CONSUMABLE`, `EQUIPMENT`, `ITEM`.
- `IncursionSessionStatus`: `ACTIVE`, `COMPLETED`, `CLAIMED`, `FAILED`, `CANCELLED`.
- `WorldBossEventStatus`: `SCHEDULED`, `LOBBY_OPEN`, `ACTIVE`, `DEFEATED`, `EXPIRED`, `REWARDED`, `CANCELLED`.
- `WorldBossRewardType`: `XP`, `GOLD`, `MATERIAL`, `CONSUMABLE`, `EQUIPMENT`, `ITEM`, `PET_EGG`.

Models atuais:

- `User`
- `GameClass`
- `GameMap`
- `SubMap`
- `SubMapEncounter`
- `Character`
- `CharacterGatheringSkill`
- `CharacterCraftingSkill`
- `Mob`
- `Item`
- `CraftingRecipe`
- `CraftingSession`
- `CraftingIngredient`
- `GatheringSession`
- `InventoryItem`
- `BankItem`
- `Equipment`
- `CharacterPotionConfig`
- `MobDrop`
- `Combat`
- `CombatLog`
- `AutoCombatSession`
- `AutoCombatSessionLoot`
- `AutoCombatSessionMobSummary`
- `AutoCombatSessionEvent`
- `Incursion`
- `IncursionLootTable`
- `CharacterIncursionSession`
- `IncursionSessionReward`
- `WorldBoss`
- `WorldBossEvent`
- `WorldBossParticipant`
- `WorldBossReward`
- `WorldBossGrantedReward`

Seeds:

- `backend/prisma/seed.ts`: seed principal.
- `backend/prisma/seed-data/`: classes, mapas, submapas, mobs, itens, drops, gathering, receitas, incursions e world bosses conforme o estado atual.
- scripts de auditoria/exportacao de economia e crafting ficam em `backend/prisma/*.ts`.

## Regras de Dominio

### Personagens

- Personagens pertencem a usuarios e devem validar ownership em rotas sensiveis.
- Delete de personagem e logico (`deletedAt`/`DELETED`).
- Limite identificado: 2 personagens por usuario.
- Classes jogaveis atuais: `Lutador`, `Assassino`, `Atirador`, `Medico`.
- Personagem tem mapa atual, nivel, XP, HP, gold, cash, avatar, equipamentos, mochila, banco, proficiencias e configs de pocao.

### Atividades exclusivas

`ActivityGuardService` centraliza bloqueios entre atividades principais:

- auto-combate;
- gathering;
- crafting;
- incursions;
- world bosses;
- enfermaria;
- combate manual.

Antes de iniciar uma atividade nova, confira se ela deve bloquear ou ser bloqueada pelas demais.

### Idle e membership

Config atual:

- `FREE_IDLE_PROGRESS_LIMIT_SECONDS = 6 * 60 * 60`.
- `PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS = 12 * 60 * 60`.
- auto-combate usa 6h para free e 12h para premium.
- gathering usa limite de resolucao em horas derivado dos mesmos limites.
- tela premium existe, mas compra/pagamento ainda nao esta implementado.

### Auto-combate

- Rodada atual: 3 segundos.
- Descanso automatico entre lutas pode recuperar HP fora da luta.
- Sessao ativa unica por personagem deve ser preservada.
- Eventos persistidos usam `AutoCombatSessionEvent`.
- Frontend processa uma fila visual de eventos; cuidado ao aumentar frequencia.

### Gathering

- Origens: `DESMANCHE`, `COLETA`, `CONTENCAO`, `ARSENAL`, `PATRULHA`, `TECNOVARREDURA`, `DROP_MOBS`.
- Nivel maximo de gathering: 50.
- Proficiencias por origem ficam em `CharacterGatheringSkill`.
- Materiais possuem tier, origem, taxa, nivel requerido e XP por unidade.

### Crafting

- Receitas usam `CraftingRecipe` e `CraftingIngredient`.
- Crafting pode gerar `CraftingSession` temporizada.
- Existe proficiencia por personagem em `CharacterCraftingSkill`.
- Crafting e uma atividade exclusiva no `ActivityGuardService`.

### Inventario e economia

- `InventoryItem` representa mochila.
- `BankItem` representa banco.
- Mercado negro vende itens do inventario por valor calculado.
- Itens podem ter flags de compra/venda e dados de trade conforme schema atual.

### Enfermaria

- Atendimento gratuito dura 30 minutos.
- Atendimento instantaneo custa gold.
- Campos de tratamento ficam no personagem (`infirmaryStartedAt`, `infirmaryEndsAt`).
- Uso e bloqueado durante atividades principais.

### Incursions

- Incursions sao operacoes temporizadas por mapa/tier/nivel.
- Podem custar gold.
- Possuem tabela de loot com tipos `XP`, `GOLD`, `MATERIAL`, `CONSUMABLE`, `EQUIPMENT` e `ITEM`.
- Sessao ativa usa `CharacterIncursionSession`.

### World bosses

- World boss tem evento, lobby, status, participantes, dano e ranking.
- Status de evento: `SCHEDULED`, `LOBBY_OPEN`, `ACTIVE`, `DEFEATED`, `EXPIRED`, `REWARDED`, `CANCELLED`.
- Recompensas podem incluir `PET_EGG`.
- Participacao em world boss bloqueia outras atividades principais.

## Variaveis de Ambiente

### Backend (`backend/.env`)

Base em `backend/.env.example`:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/nome_do_banco?schema=public"
JWT_SECRET="sua_chave_jwt"
JWT_EXPIRES_IN="7d"
REDIS_HOST="localhost"
REDIS_PORT="6379"
APP_PORT="3000"
```

Para o Docker Compose local deste repositorio:

```env
DATABASE_URL="postgresql://zumbi:zumbi123@localhost:5433/mmorpg_zumbi?schema=public"
JWT_SECRET="dev-secret-trocar-em-producao"
JWT_EXPIRES_IN="7d"
REDIS_HOST="localhost"
REDIS_PORT="6379"
APP_PORT="3000"
```

### Frontend (`frontend/.env`)

Base atual:

```env
VITE_API_URL=http://localhost:3000
VITE_DISCORD_URL=
```

O codigo tambem suporta `VITE_SOCKET_URL`; se omitida, deriva de `VITE_API_URL`.

## Comandos

Execute a partir da raiz, salvo quando indicado.

### Instalar

```bash
cd backend && npm install
cd frontend && npm install
```

### Infra local

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml down
docker compose -f infra/docker-compose.yml down -v
```

### Backend

```bash
cd backend && npm run start:dev
cd backend && npm run start
cd backend && npm run start:debug
cd backend && npm run build
cd backend && npm run start:prod
cd backend && npm run lint
cd backend && npm run format
cd backend && npm test
cd backend && npm run test:watch
cd backend && npm run test:cov
cd backend && npm run test:e2e
```

### Prisma

```bash
cd backend && npm run prisma:generate
cd backend && npm run prisma:migrate
cd backend && npm run prisma:seed
cd backend && npm run prisma:studio
cd backend && npm run prisma:audit:crafting-chain
cd backend && npm run prisma:audit:economy-time
cd backend && npm run prisma:export:economy-csv
cd backend && npm run prisma:recipes:from-csv
cd backend && npm run prisma:reset-characters:apprentice
cd backend && npm run prisma:cleanup-items
cd backend && npm run prisma:cleanup-items:apply
```

Observacao: `test:grant-lutador-t1` referencia `prisma/grant-lutador-tier1-items.ts`; confirme a existencia do arquivo antes de usar.

### Frontend

```bash
cd frontend && npm run dev
cd frontend && npm run build
cd frontend && npm run lint
cd frontend && npm run preview
```

Nao ha script oficial de teste no `frontend/package.json`.

## Fluxo Local Sugerido

```bash
docker compose -f infra/docker-compose.yml up -d
```

Em um terminal:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

URLs locais esperadas:

- backend: `http://localhost:3000`
- frontend Vite: URL exibida pelo `npm run dev`
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6379`

## Validacao

Antes de entregar mudancas relevantes:

```bash
cd backend && npm run lint
cd backend && npm test
cd backend && npm run build
cd frontend && npm run lint
cd frontend && npm run build
```

Adicione validacoes extras quando alterar:

- Prisma schema: `npm run prisma:generate` e migration.
- Seeds/economia: `npm run prisma:seed` e scripts de auditoria/exportacao quando fizer sentido.
- Rotas/contratos: frontend `endpoints.ts`, tipos e APIs das features.
- Realtime: gateway, provider/hook, tipos e reducer.
- UI: build e verificacao visual em desktop/mobile.

## Pontos de Atencao

- O repositorio esta com muitas mudancas locais nao commitadas. Preserve trabalho do usuario.
- `README.md` e `AGENTS.md` sao a referencia mais atual; os READMEs de `backend/` e `frontend/` podem continuar como template.
- `gathering` REST/WebSocket ainda merece revisao de autenticacao/ownership.
- `frontend/.env.example` nao documenta `VITE_SOCKET_URL`, embora o codigo aceite.
- `backend/.env.example` usa porta generica `5432`; Docker Compose local expoe `5433`.
- Existem assets grandes e backups locais. Nao remova `_backup_remove_bg/`, `docs/mob-image-pack/` ou imagens sem confirmacao.
- Nao ha CI/CD, Dockerfile de app ou estrategia de deploy versionada.
- Nao ha arquivo `LICENSE`; `backend/package.json` declara `UNLICENSED`.
