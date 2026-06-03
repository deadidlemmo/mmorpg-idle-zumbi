# AGENTS.md - MMORPG Idle Zumbi

Instrucoes para futuras sessoes de IA/Codex neste repositorio.

Ultima revisao: 2026-06-01, baseada no working tree local atual. A arvore esta com mudancas nao commitadas relevantes; sempre confirme o estado real antes de editar.

## Regra Principal

Leia este arquivo primeiro, depois confira:

```bash
git status --short
rg --files -g "!node_modules" -g "!dist" -g "!coverage"
```

Nao assuma que a documentacao esta mais atual que o codigo. Preserve mudancas do usuario e limite edicoes ao escopo pedido.

## Visao Geral

**MMORPG Idle Zumbi** e um jogo web full stack de sobrevivencia zumbi com progressao idle/MMORPG.

Componentes principais:

- **Frontend**: React 19 + TypeScript + Vite, rotas com React Router, estado global com Zustand, HTTP via Axios e realtime via Socket.IO Client.
- **Backend**: NestJS 11 + TypeScript, arquitetura modular por dominio, Prisma ORM, PostgreSQL, JWT/Passport, DTOs com `class-validator`, gateways Socket.IO.
- **Banco**: Prisma schema, migrations e seeds modulares.
- **Infra local**: Docker Compose com PostgreSQL 16 e Redis 7.
- **Docs/assets**: CSVs de economia/crafting, pacote de imagens de mobs, backups de imagens e documentos de analise.

Fluxo principal:

1. Usuario registra/login em `/auth/register` ou `/auth/login`.
2. Backend retorna `user` e `accessToken`.
3. Frontend persiste o token em `localStorage` na chave `dead_idle_access_token`.
4. Axios injeta `Authorization: Bearer <token>`.
5. Usuario seleciona/cria personagem.
6. Dashboard carrega overview, status, equipamentos, moedas, atividades e atalhos.
7. Sistemas principais rodam por REST e, quando aplicavel, Socket.IO.

## Estrutura Atual

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
    ├── src/
    │   ├── app/
    │   ├── assets/
    │   ├── components/
    │   ├── features/
    │   ├── services/
    │   ├── store/
    │   ├── types/
    │   └── utils/
    ├── _backup_gathering/
    └── _backup_gathering_unused/
```

Arquivos e pastas que exigem cuidado:

- `_backup_remove_bg/`: backups locais de imagens, nao remover sem confirmacao.
- `docs/mob-image-pack/` e `docs/mob-image-pack.zip`: pacote/manifesto de imagens.
- `docs/economia-crafting-csv/`: exportacoes de economia e crafting.
- `project-tree.md`, `project-files.md`, `local-changes.md`: docs auxiliares antigas/locais.
- `frontend/src/assets/images/`: muitas imagens podem estar modificadas/deletadas no working tree.

## Backend

Entrada:

- `backend/src/main.ts`: bootstrap Nest, CORS `origin: true`, `credentials: true`, `ValidationPipe` global, porta `APP_PORT` ou `3000`.
- `backend/src/app.module.ts`: composicao dos modulos.
- `backend/prisma/schema.prisma`: fonte da verdade do banco.

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

`backend/src/common/` contem:

- `activity-guard/`: exclusividade e bloqueio entre atividades.
- `config/`: balanceamento, progressao, gathering, auto-combate e membership.
- `utils/`: formulas de stats, combate, level, gathering, membership e penalidades.

## Frontend

Entrada:

- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/app/routes.tsx`

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

Servicos importantes:

- `frontend/src/services/api/apiClient.ts`: Axios, Bearer token e remocao de token em `401`.
- `frontend/src/services/api/endpoints.ts`: paths REST centralizados.
- `frontend/src/services/api/authToken.ts`: chave `dead_idle_access_token`.
- `frontend/src/services/websocket/socketClient.ts`: sockets de auto-combate e world bosses; base por `VITE_API_URL`/`VITE_SOCKET_URL`.

Rotas atuais:

- `/`
- `/characters`
- `/dashboard/:characterId`
- `/dashboard/:characterId/auto-combat`
- `/dashboard/:characterId/gathering`
- `/dashboard/:characterId/gathering/:origin`
- `/dashboard/:characterId/crafting`
- `/dashboard/:characterId/inventory`
- `/dashboard/:characterId/equipment`
- `/dashboard/:characterId/consumables`
- `/dashboard/:characterId/consumables/:merchantId`
- `/dashboard/:characterId/infirmary`
- `/dashboard/:characterId/membership`
- `/dashboard/:characterId/maps`
- `/dashboard/:characterId/incursions`
- `/dashboard/:characterId/world-bosses`

Providers realtime no dashboard:

- `LootNotificationProvider`
- `AutoCombatRealtimeProvider`
- `GatheringRealtimeProvider`
- `CraftingRealtimeProvider`
- `IncursionsRealtimeProvider`

## Banco e Prisma

Models atuais no schema:

- `User`, `GameClass`, `GameMap`, `SubMap`, `SubMapEncounter`
- `Character`, `CharacterGatheringSkill`, `CharacterCraftingSkill`
- `Mob`, `Item`, `MobDrop`
- `InventoryItem`, `BankItem`, `Equipment`
- `CharacterPotionConfig`
- `Combat`, `CombatLog`
- `AutoCombatSession`, `AutoCombatSessionLoot`, `AutoCombatSessionMobSummary`, `AutoCombatSessionEvent`
- `GatheringSession`
- `CraftingRecipe`, `CraftingSession`, `CraftingIngredient`
- `Incursion`, `IncursionLootTable`, `CharacterIncursionSession`, `IncursionSessionReward`
- `WorldBoss`, `WorldBossEvent`, `WorldBossParticipant`, `WorldBossReward`, `WorldBossGrantedReward`

Enums relevantes:

- `UserRole`
- `CharacterStatus`
- `Rarity`
- `ItemSlot`
- `InventoryItemType`
- `CombatStatus`
- `CombatActor`
- `AutoCombatSessionStatus`
- `MaterialOrigin`
- `ActivityStatus`
- `CraftIngredientRole`
- `IncursionDifficulty`
- `IncursionRewardType`
- `IncursionSessionStatus`
- `WorldBossEventStatus`
- `WorldBossRewardType`

Ao alterar Prisma:

1. Atualize `backend/prisma/schema.prisma`.
2. Gere migration.
3. Atualize seeds/tipos/servicos.
4. Rode `npm run prisma:generate`.
5. Valide migrations e seed quando possivel.

## Regras de Dominio

### Autenticacao

- JWT Bearer via `JwtAuthGuard`.
- `UserRole`: `PLAYER`, `ADMIN`.
- Nao retornar `passwordHash`.
- Frontend remove token em `401`.
- `JWT_EXPIRES_IN` existe no `.env.example`; confirme o uso no codigo antes de documentar como funcional.

### Personagens

- `CharacterStatus`: `ACTIVE`, `DEAD`, `BLOCKED`, `DELETED`.
- Delete e logico.
- Personagem pertence a usuario; validar ownership sempre.
- Limite atual: 2 personagens por usuario.
- Classes jogaveis: `Lutador`, `Assassino`, `Atirador`, `Medico`.
- Personagem inicializa com classe, mapa, HP, equipamentos starter, inventario, config de pocao e proficiencias.
- Avatares dependem da classe; validar `avatarKey`.

### Progressao

- Level cap atual de lancamento: `LAUNCH_LEVEL_CAP = 50`.
- Cap futuro preparado: `FUTURE_LEVEL_CAP = 100`.
- `LEVELS_PER_TIER = 10`.
- Formulas ficam em `backend/src/common/utils/`.
- Frontend nao deve virar fonte da verdade de formulas de progressao.

### Membership e limites idle

- `FREE_IDLE_PROGRESS_LIMIT_SECONDS = 6 * 60 * 60`.
- `PREMIUM_IDLE_PROGRESS_LIMIT_SECONDS = 12 * 60 * 60`.
- Auto-combate e gathering usam esses limites.
- Tela `/membership` existe, mas pagamento/compra ainda nao esta ativo.

### Atividades exclusivas

`ActivityGuardService` deve ser usado para impedir conflitos entre:

- auto-combate;
- gathering;
- crafting;
- incursions;
- world bosses;
- combate manual;
- enfermaria.

Antes de criar uma atividade nova, atualize o guard para bloquear combinacoes invalidas.

### Auto-combate

- REST protegido em `/auto-combat`.
- Socket.IO em `/auto-combat`.
- Rodada atual: 3 segundos.
- Duracao free: 6h; premium: 12h.
- Sessao ativa unica por personagem deve ser preservada.
- Fase de caca usa proficiencia `CharacterHuntingSkill`, cap 50.
- Caca nivel 1 rastreia 1 ameaca a cada 15s e concede 5 XP de caca por ameaca.
- Level de caca reduz gradualmente o tempo por ameaca ate piso de 6s; curva de XP deve considerar jogador deixando 24h cacando sem upar facil demais.
- Eventos de realtime sao persistidos em `AutoCombatSessionEvent`.
- Frontend processa fila visual; cuidado com volume/frequencia de eventos.

### Gathering

- REST em `/gathering`.
- Socket.IO em `/gathering`.
- Origens: `DESMANCHE`, `COLETA`, `CONTENCAO`, `ARSENAL`, `PATRULHA`, `TECNOVARREDURA`, `DROP_MOBS`.
- Nivel maximo: 50.
- Proficiencia por origem em `CharacterGatheringSkill`.
- Atenção: controller/gateway de gathering atual nao aplica `JwtAuthGuard`; revisar ownership antes de producao.

### Crafting

- REST protegido em `/crafting`.
- Socket.IO em `/crafting`.
- Usa `CraftingRecipe`, `CraftingIngredient`, `CraftingSession` e `CharacterCraftingSkill`.
- Crafting e atividade exclusiva no guard.

### Inventario, banco e equipamento

- Mochila: `InventoryItem`.
- Banco: `BankItem`.
- Equipamento: `Equipment`.
- Equipar/desequipar deve validar ownership, posse do item, slot, tier/classe/requisitos e inventario.
- Mercado negro vende item via `/inventory/black-market/sell`.

### Consumiveis e enfermaria

- Config de pocao por personagem em `CharacterPotionConfig`.
- Enfermaria tem:
  - status;
  - `heal` legado apontando para instantaneo;
  - `start` tratamento gratuito;
  - `claim` conclusao;
  - `cancel`;
  - `instant` atendimento pago em gold.
- Tratamento gratuito atual: 30 minutos.
- Uso bloqueado durante atividades principais.

### Incursions

- REST protegido em `/incursions`.
- Socket.IO em `/incursions`.
- Usa `Incursion`, `IncursionLootTable`, `CharacterIncursionSession`, `IncursionSessionReward`.
- Dificuldades: `LOW`, `MEDIUM`, `HIGH`, `EXTREME`.
- Recompensas: `XP`, `GOLD`, `MATERIAL`, `CONSUMABLE`, `EQUIPMENT`, `ITEM`.

### World Bosses

- REST protegido em `/world-bosses`.
- Socket.IO em `/world-bosses`.
- Usa lobby, status de evento, dano, participacao, ranking e recompensas.
- Status: `SCHEDULED`, `LOBBY_OPEN`, `ACTIVE`, `DEFEATED`, `EXPIRED`, `REWARDED`, `CANCELLED`.
- Recompensas podem incluir `PET_EGG`.
- Participacao em world boss bloqueia outras atividades principais.

### Vendor

- REST protegido em `/vendor`.
- Frontend usa `/dashboard/:characterId/consumables` como hub de mercadores.
- Compra de itens via `/vendor/:characterId/buy`.

## Padroes de Codigo

### Geral

- Linguagem de dominio, UI e docs: portugues brasileiro.
- Codigo em TypeScript.
- Prefira nomes claros e explicitos.
- Nao adicione dependencias sem necessidade real.
- Preserve lockfiles ao alterar dependencias.
- Nao editar `node_modules`, `dist`, caches, coverage ou artefatos gerados.
- Antes de mexer em regras de jogo, procure configs/utils existentes.
- Nao coloque `try/catch` ao redor de imports.

### Backend

- Prettier: aspas simples e trailing comma.
- Controllers finos; services concentram regra de negocio.
- DTOs pequenos com `class-validator`.
- Use exceptions Nest (`BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`).
- Valide ownership por `userId` em recursos de personagem.
- Seeds devem ser idempotentes quando representarem dados canonicos.
- Regras compartilhadas ficam em `backend/src/common/config` ou `backend/src/common/utils`.
- Gateways devem autenticar, controlar rooms e limpar listeners/intervalos.

### Frontend

- Organizacao por feature.
- APIs devem usar `apiClient` e `API_ENDPOINTS`.
- Use `type` imports para tipos.
- Estado global so quando necessario; prefira estado local/hooks.
- Rotas protegidas ficam em `frontend/src/app/routes.tsx`.
- Ao criar nova tela de dashboard, adicione rota e entrada de navegacao quando aplicavel.
- Atualize tipos em `features/*/types` junto com contratos do backend.
- Trate erros preservando mensagem do backend quando existir.
- CSS por feature; evite inflar `App.css`/`index.css`.

## Variaveis de Ambiente

Backend (`backend/.env`):

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/nome_do_banco?schema=public"
JWT_SECRET="sua_chave_jwt"
JWT_EXPIRES_IN="7d"
REDIS_HOST="localhost"
REDIS_PORT="6379"
APP_PORT="3000"
```

Docker Compose local usa PostgreSQL em `5433`:

```env
DATABASE_URL="postgresql://zumbi:zumbi123@localhost:5433/mmorpg_zumbi?schema=public"
```

Frontend (`frontend/.env`):

```env
VITE_API_URL=http://localhost:3000
VITE_DISCORD_URL=
```

O codigo tambem aceita `VITE_SOCKET_URL`, embora o `.env.example` atual nao documente.

## Comandos Existentes

### Infra

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml down
docker compose -f infra/docker-compose.yml down -v
```

### Backend

```bash
cd backend && npm install
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

`test:grant-lutador-t1` existe no `package.json`, mas referencia `prisma/grant-lutador-tier1-items.ts`; confirme a existencia antes de usar.

### Frontend

```bash
cd frontend && npm install
cd frontend && npm run dev
cd frontend && npm run build
cd frontend && npm run lint
cd frontend && npm run preview
```

Nao ha script oficial de teste frontend.

## Checklist Antes de Finalizar

Sempre:

- [ ] `git status --short` revisado antes e depois.
- [ ] Mudancas limitadas ao escopo.
- [ ] Nenhuma mudanca do usuario revertida.
- [ ] Nenhum segredo real em docs/logs/env.
- [ ] Nenhum `node_modules`, `dist`, coverage, cache ou asset pesado novo sem pedido.
- [ ] README/AGENTS/docs atualizados quando comportamento, scripts, rotas ou regras mudarem.

Backend:

- [ ] `cd backend && npm run lint` se alterar `backend/src`, Prisma TS ou config.
- [ ] `cd backend && npm test` se alterar services/utils/controllers testaveis.
- [ ] `cd backend && npm run test:e2e` se alterar bootstrap, auth ou rotas criticas.
- [ ] `cd backend && npm run build` antes de entregar mudancas backend relevantes.
- [ ] `cd backend && npm run prisma:generate` apos alterar `schema.prisma`.
- [ ] Migration criada apos mudanca persistente de schema.
- [ ] `cd backend && npm run prisma:seed` se seeds foram alterados ou a mudanca depende deles.

Frontend:

- [ ] `cd frontend && npm run lint` se alterar `frontend/src` ou config frontend.
- [ ] `cd frontend && npm run build` antes de entregar mudancas frontend relevantes.
- [ ] Rotas, stores, APIs, tipos e endpoints atualizados juntos.
- [ ] Estados de loading/erro/vazio tratados em telas novas/alteradas.
- [ ] Responsividade/CSS verificada em alteracoes de layout.

Tempo real:

- [ ] Namespace conferido.
- [ ] Eventos e payloads alinhados entre backend e frontend.
- [ ] Join/leave por personagem/evento validado.
- [ ] Intervals/listeners limpos no disconnect/unmount.
- [ ] Fallback REST/polling continua aceitavel.

Infra:

- [ ] PostgreSQL/Redis locais sobem com `docker compose -f infra/docker-compose.yml up -d` quando necessario.
- [ ] `DATABASE_URL` usa `5433` no compose local.

## Observacoes Conhecidas

- Working tree local tem muitas alteracoes nao commitadas, incluindo imagens e novas features.
- `README.md` e este arquivo foram atualizados para refletir o working tree atual; commits antigos podem divergir.
- `backend/README.md` e `frontend/README.md` podem continuar como templates.
- `gathering` REST/gateway precisa de revisao de autenticacao/ownership.
- `frontend/.env.example` nao lista `VITE_SOCKET_URL`.
- `backend/.env.example` usa `5432`, enquanto o compose local expoe `5433`.
- `frontend/src/app/providers.tsx` pode estar vazio/reservado.
- `frontend/src/store/game.store.ts` pode estar vazio/reservado.
- `frontend/src/features/characters/pages/CharacterCreatePage.tsx` existe, mas a criacao parece integrada em `/characters`; confirme `routes.tsx` antes de criar rota propria.
- Nao ha CI/CD versionado.
- Nao ha Dockerfile de app.
- Nao ha arquivo `LICENSE`; backend declara `UNLICENSED`.
