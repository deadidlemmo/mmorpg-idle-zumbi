# AGENTS.md — MMORPG Idle Zumbi

Este arquivo orienta futuras sessões de IA/Codex neste repositório. Ele foi escrito a partir da estrutura real do projeto em maio de 2026 e deve ser mantido atualizado sempre que a arquitetura, scripts, infraestrutura ou regras de domínio mudarem.

## Visão geral do projeto

**MMORPG Idle Zumbi** é um jogo web full stack em desenvolvimento/MVP com temática de sobrevivência zumbi e progressão idle/MMORPG.

O repositório contém:

- **Frontend**: SPA em React + TypeScript + Vite, com rotas protegidas, estado global via Zustand, HTTP via Axios e tempo real via Socket.IO Client.
- **Backend**: API NestJS + TypeScript, organizada por módulos de domínio, com Prisma ORM, PostgreSQL, JWT/Passport, validação global e gateways Socket.IO.
- **Banco/ORM**: Prisma com schema, migrations e seeds modulares.
- **Infra local**: Docker Compose com PostgreSQL 16 e Redis 7.
- **Docs/artefatos de análise**: README raiz específico, READMEs padrão/parciais em `backend/` e `frontend/`, arquivos `.txt`, `.md` e um `.docx` de documentação/análise.

Fluxo principal identificado:

1. Usuário registra/login em `/auth/register` ou `/auth/login`.
2. Backend retorna `user` e `accessToken` JWT.
3. Frontend persiste o token em `localStorage` na chave `dead_idle_access_token`.
4. Requisições autenticadas usam `Authorization: Bearer <token>`.
5. Usuário seleciona/cria personagem.
6. Dashboard do personagem consolida status, equipamentos, inventário, atividades e atalhos.
7. Sistemas principais: combate manual, auto-combate idle em tempo real, gathering/expedição idle, crafting, consumíveis, enfermaria, inventário/equipamento, mapas/submapas/mobs/classes/itens.

## Estrutura do repositório

```text
.
├── AGENTS.md                         # Instruções para agentes de IA/Codex.
├── README.md                         # Documentação geral do projeto.
├── AUTOCOMBAT.md                     # Documentação/anotações do auto-combate.
├── Gathering_Idle_Zumbi_Documento_Oficial.docx
├── local-changes.md                  # Registro/anotações locais.
├── project-files.md                  # Inventário/documentação da árvore de arquivos.
├── project-tree.md                   # Árvore/documentação do projeto.
├── backend/                          # API NestJS + Prisma.
├── frontend/                         # SPA React + Vite.
└── infra/                            # Docker Compose local.
```

### Backend

```text
backend/
├── package.json                      # Scripts/dependências do backend.
├── package-lock.json                 # Lockfile npm do backend.
├── nest-cli.json                     # Configuração Nest CLI.
├── tsconfig.json                     # TypeScript backend.
├── tsconfig.build.json               # Build TS/Nest.
├── eslint.config.mjs                 # ESLint flat config + Prettier.
├── .prettierrc                       # singleQuote/trailingComma.
├── .env.example                      # Variáveis de ambiente esperadas.
├── prisma/
│   ├── schema.prisma                 # Modelo de domínio e banco PostgreSQL.
│   ├── migrations/                   # Histórico de migrations Prisma.
│   ├── seed.ts                       # Seed principal modular.
│   ├── seed.reset.ts                 # Reset/seed auxiliar.
│   ├── cleanup-old-items.ts          # Script de limpeza de itens antigos.
│   ├── seed-types.ts                 # Tipos dos seeds.
│   └── seed-data/                    # Dados de classes, mapas, mobs, itens etc.
├── scripts/                          # Scripts utilitários pontuais.
├── src/
│   ├── main.ts                       # Bootstrap Nest, CORS e ValidationPipe.
│   ├── app.module.ts                 # Módulo raiz e composição dos módulos.
│   ├── app.controller.ts             # Health/root endpoint simples.
│   ├── app.service.ts                # Serviço raiz simples.
│   ├── common/
│   │   ├── activity-guard/           # Serviço/módulo para controle de atividade.
│   │   ├── config/                   # Constantes de auto-combate, gathering e progressão.
│   │   └── utils/                    # Fórmulas de combate, level, stats, gathering, penalidade.
│   ├── modules/                      # Módulos por domínio.
│   └── prisma/                       # PrismaModule/PrismaService Nest.
└── test/                             # Teste e2e Nest/Jest.
```

Módulos backend em `backend/src/modules/`:

- `auth`: registro, login, `/auth/me`, JWT, Passport strategy e guard.
- `users`: operações internas de usuário usadas pela autenticação.
- `characters`: criação/listagem/status/overview/exclusão lógica de personagens.
- `game-classes`: listagem/consulta de classes do jogo.
- `maps`: listagem/consulta de mapas.
- `mobs`: listagem/consulta de mobs.
- `items`: listagem/consulta de itens.
- `combat`: combate manual autenticado.
- `auto-combat`: auto-combate idle REST + gateway Socket.IO no namespace `/auto-combat`.
- `inventory`: inventário autenticado por personagem.
- `equipment`: equipamento/autoequip autenticado.
- `consumables`: uso de consumíveis e configuração de poção por personagem.
- `infirmary`: status e cura de personagem.
- `crafting`: receitas e craft.
- `gathering`: gathering idle REST + gateway Socket.IO no namespace `/gathering`.

### Frontend

```text
frontend/
├── package.json                      # Scripts/dependências do frontend.
├── package-lock.json                 # Lockfile npm do frontend.
├── vite.config.ts                    # Configuração Vite.
├── tsconfig.json                     # Referências TS.
├── tsconfig.app.json                 # TS app/browser.
├── tsconfig.node.json                # TS tooling/node.
├── eslint.config.js                  # ESLint flat config React/Vite.
├── .env.example                      # VITE_API_URL.
├── index.html                        # HTML de entrada.
├── public/                           # Assets públicos.
├── src/
│   ├── main.tsx                      # Entrada React.
│   ├── App.tsx / App.css             # App shell.
│   ├── app/routes.tsx                # Rotas públicas/protegidas e providers realtime.
│   ├── app/providers.tsx             # Reservado para providers globais.
│   ├── assets/                       # Imagens e CSS global/variáveis.
│   ├── components/                   # Componentes comuns e marca.
│   ├── features/                     # Funcionalidades por domínio.
│   ├── services/                     # API client, auth token e Socket.IO client.
│   ├── store/                        # Zustand stores.
│   ├── types/                        # Tipos compartilhados.
│   └── utils/                        # Formatadores e helpers.
├── _backup_gathering/                # Backup legado de gathering.
└── _backup_gathering_unused/         # Componentes/configs antigos de gathering.
```

Features frontend em `frontend/src/features/`:

- `auth`: tela/login/registro e tipos/API de autenticação.
- `characters`: seleção/criação de personagem, cards, opções de avatar e tipos.
- `dashboard`: layout do dashboard, topbar, cards, stats, equipamentos e progresso.
- `auto-combat`: página, API, componentes de batalha, realtime reducer/provider/hooks e assets de mobs/mapas.
- `gathering`: hub, página por origem, materiais, modal de uso e realtime provider/reducer/selectors.
- `inventory`: página, API, filtros, grid, card, modal e hook `useInventory`.
- `consumables`: API/tipos de consumíveis.
- `maps`: seleção de mapas.
- `loot-notifications`: provider/contexto de notificações de loot.
- `utils`: helpers específicos de assets do auto-combate.

### Infra

```text
infra/
└── docker-compose.yml                # PostgreSQL 16 em localhost:5433 e Redis 7 em localhost:6379.
```

## Principais arquivos e funções

### Raiz

- `README.md`: documentação geral e diagnóstico do estado do projeto.
- `AUTOCOMBAT.md`: documentação/anotações específicas do auto-combate.
- `project-tree.md`, `project-files.md`, `local-changes.md`: documentação auxiliar; confira antes de apagar/renomear.
- `Gathering_Idle_Zumbi_Documento_Oficial.docx`: documento oficial do sistema de gathering.

### Backend

- `backend/src/main.ts`: inicializa Nest, habilita CORS com `origin: true` e `credentials: true`, aplica `ValidationPipe` global com `whitelist`, `forbidNonWhitelisted` e `transform`, lê `APP_PORT` com fallback `3000`.
- `backend/src/app.module.ts`: registra `ConfigModule` global, `PrismaModule` e todos os módulos de domínio.
- `backend/prisma/schema.prisma`: fonte da verdade dos modelos, enums e relacionamentos de banco.
- `backend/prisma/seed.ts`: seed idempotente/upsert para classes, mapas, submapas, mobs, itens, drops, consumíveis, materiais de gathering e receitas.
- `backend/prisma/seed-data/*.ts`: dados canônicos iniciais do jogo.
- `backend/src/common/config/*.ts`: constantes de balanceamento e limites.
- `backend/src/common/utils/*.ts`: fórmulas de dano, stats, level, gathering e penalidades.
- `backend/src/prisma/prisma.service.ts`: lifecycle/conexão Prisma dentro do Nest.
- `backend/src/modules/*/*.controller.ts`: contratos HTTP.
- `backend/src/modules/*/*.service.ts`: regras de negócio.
- `backend/src/modules/auto-combat/auto-combat.gateway.ts`: eventos Socket.IO de auto-combate.
- `backend/src/modules/gathering/gathering.gateway.ts`: eventos Socket.IO de gathering.

### Frontend

- `frontend/src/main.tsx`: bootstrap React.
- `frontend/src/app/routes.tsx`: define `/`, `/characters`, `/dashboard/:characterId`, rotas filhas e providers realtime do dashboard.
- `frontend/src/services/api/apiClient.ts`: Axios com `VITE_API_URL`, timeout, header JSON, injeção de Bearer token e remoção de token em `401`.
- `frontend/src/services/api/authToken.ts`: leitura/gravação/remoção do token local.
- `frontend/src/services/api/endpoints.ts`: centraliza paths REST usados pelo frontend.
- `frontend/src/services/websocket/socketClient.ts`: cliente Socket.IO do auto-combate; normaliza `VITE_API_URL`/`VITE_SOCKET_URL` e namespace `/auto-combat`.
- `frontend/src/store/auth.store.ts`: estado de autenticação, login, registro e logout via Zustand.
- `frontend/src/store/character.store.ts`: lista/criação/seleção de personagens; usa `dead_idle_selected_character_id` no `localStorage`.
- `frontend/src/types/*.ts`: tipos compartilhados de API/jogo/common.
- `frontend/src/assets/styles/variables.css`: tokens CSS globais.
- `frontend/src/index.css` e `frontend/src/App.css`: estilos globais/app shell.

## Tecnologias usadas

### Backend

- Node.js + TypeScript.
- NestJS 11.
- Prisma ORM 6 + PostgreSQL.
- Socket.IO/Nest WebSockets.
- JWT com `@nestjs/jwt`, Passport e `passport-jwt`.
- `bcrypt` para hash de senha.
- `class-validator` e `class-transformer` para DTOs/validação.
- `@nestjs/config` para variáveis de ambiente.
- `ioredis` disponível como dependência; Redis local provisionado por Docker Compose.
- Jest/ts-jest/supertest para testes.
- ESLint flat config + Prettier.

### Frontend

- React 19 + TypeScript.
- Vite 8.
- React Router DOM 7.
- Zustand 5.
- Axios.
- Socket.IO Client.
- Lucide React.
- CSS modular por feature/arquivos globais.
- ESLint flat config com React Hooks e React Refresh.

### Infra

- Docker Compose.
- PostgreSQL 16 exposto em `localhost:5433`.
- Redis 7 exposto em `localhost:6379`.

## Padrões de arquitetura

### Backend

- Arquitetura NestJS modular por domínio: cada domínio deve manter `*.module.ts`, `*.controller.ts`, `*.service.ts` e, quando necessário, `dto/`.
- Controllers devem ser finos: validar/receber parâmetros e delegar regras para services.
- Services concentram regras de domínio e acesso Prisma.
- DTOs devem usar `class-validator`; o `ValidationPipe` global remove campos não permitidos e rejeita campos extras.
- Autenticação deve usar `JwtAuthGuard` em endpoints sensíveis.
- Sempre valide propriedade do recurso por `userId` antes de retornar/alterar dados de personagem, inventário, equipamento, consumível, enfermaria, combate ou atividades.
- Prisma schema e migrations são a fonte da verdade do banco. Não altere o banco manualmente sem refletir em migration.
- Seeds são modulares e devem permanecer idempotentes (`upsert`/operações seguras), porque são usados para dados canônicos de jogo.
- Regras/fórmulas compartilhadas devem viver em `backend/src/common/config` ou `backend/src/common/utils`, não duplicadas em services.
- Gateways Socket.IO devem manter autenticação, rooms por personagem e emissão de eventos consistentes com os tipos consumidos pelo frontend.

### Frontend

- Organização por feature: cada domínio em `frontend/src/features/<domínio>/` com `api/`, `components/`, `pages/`, `types/`, `utils/`, `styles/`, `realtime/` quando aplicável.
- Serviços HTTP devem usar `apiClient` e paths de `endpoints.ts` quando possível.
- Estado global somente quando necessário via Zustand (`store/`). Estado local deve permanecer nos componentes/hooks.
- Rotas protegidas devem ficar em `frontend/src/app/routes.tsx` usando `ProtectedRoute`/`PublicOnlyRoute`.
- Realtime do dashboard é provido por `AutoCombatRealtimeProvider`, `GatheringRealtimeProvider` e `LootNotificationProvider` na rota `/dashboard/:characterId`.
- Componentes React devem ser funcionais, tipados e pequenos; lógica de transformação deve ir para hooks/utils.
- CSS é organizado por feature e por responsabilidade; evite inflar `App.css`/`index.css` com estilos específicos de páginas.
- Assets de mobs, mapas, classes, avatares e marca vivem em `frontend/src/assets/images/` ou subpastas de feature.

## Padrões de código

### Gerais

- Idioma predominante do domínio e mensagens ao usuário: português brasileiro.
- Código em TypeScript.
- Prefira nomes claros e explícitos.
- Não adicione dependências sem necessidade real.
- Não coloque `try/catch` ao redor de imports.
- Não versionar `.env`, `dist`, `coverage`, caches ou `node_modules`.
- Preserve lockfiles (`package-lock.json`) quando alterar dependências.
- Antes de mexer em regras de jogo, procure constantes/utilitários existentes para evitar divergência.

### Backend

- Formatação Prettier: aspas simples e trailing comma.
- ESLint backend permite `any`, mas trate como exceção; prefira tipos Prisma/DTOs/tipos locais quando viável.
- TS backend usa `module: nodenext`, `target: ES2023`, decorators e `strictNullChecks`.
- Use exceptions Nest (`BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, etc.) em vez de erros genéricos para respostas HTTP.
- DTOs devem ser pequenos e específicos por operação.
- Não exponha `passwordHash` em responses.
- Ao criar modelos/campos Prisma: adicione índices/unique constraints coerentes com consultas existentes.
- Ao alterar Prisma: gerar migration, atualizar seed/tipos e rodar `prisma:generate`.

### Frontend

- TS frontend usa `jsx: react-jsx`, `moduleResolution: bundler`, `noUnusedLocals` e `noUnusedParameters`.
- Importações devem seguir ESM.
- Use `type` imports quando importar apenas tipos.
- APIs devem retornar tipos explícitos de `features/*/types` ou `src/types`.
- Trate erros de API preservando mensagens do backend quando existirem.
- Não duplique strings de endpoint fora de `endpoints.ts`, salvo WebSocket namespaces/eventos que já estejam centralizados.
- Ao criar nova tela de dashboard, registre rota filha em `app/routes.tsx` e adicione navegação/layout correspondente.

## Variáveis de ambiente

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

Para usar o Docker Compose local deste repositório, normalmente use a porta exposta `5433`:

```env
DATABASE_URL="postgresql://zumbi:zumbi123@localhost:5433/mmorpg_zumbi?schema=public"
JWT_SECRET="dev-secret-trocar-em-producao"
JWT_EXPIRES_IN="7d"
REDIS_HOST="localhost"
REDIS_PORT="6379"
APP_PORT="3000"
```

### Frontend (`frontend/.env`)

Base em `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:3000
```

O código também suporta `VITE_SOCKET_URL`; se omitido, deriva de `VITE_API_URL`:

```env
VITE_SOCKET_URL=http://localhost:3000
```

## Comandos de instalação, execução, build, lint, testes e banco

Execute comandos a partir da raiz do repositório, salvo indicação contrária.

### Instalação

```bash
cd backend && npm install
cd frontend && npm install
```

### Infra local

```bash
docker compose -f infra/docker-compose.yml up -d
```

Parar/remover containers:

```bash
docker compose -f infra/docker-compose.yml down
```

Remover também volumes/dados locais:

```bash
docker compose -f infra/docker-compose.yml down -v
```

### Backend

```bash
cd backend && npm run start:dev       # desenvolvimento com watch
cd backend && npm run start           # start Nest
cd backend && npm run start:debug     # debug com watch
cd backend && npm run build           # build em dist/
cd backend && npm run start:prod      # executa dist/main
cd backend && npm run lint            # ESLint com --fix
cd backend && npm run format          # Prettier em src/ e test/
cd backend && npm test                # testes unitários (*.spec.ts em src/)
cd backend && npm run test:watch
cd backend && npm run test:cov
cd backend && npm run test:e2e
```

### Prisma/migrations/seed

```bash
cd backend && npm run prisma:generate
cd backend && npm run prisma:migrate
cd backend && npm run prisma:seed
cd backend && npm run prisma:studio
```

Scripts auxiliares existentes:

```bash
cd backend && npm run prisma:cleanup-items
cd backend && npm run prisma:cleanup-items:apply
cd backend && npm run test:grant-lutador-t1
```

Observação: o script `test:grant-lutador-t1` referencia `prisma/grant-lutador-tier1-items.ts`; confirme se esse arquivo existe antes de usar, pois ele não apareceu na listagem atual do repositório.

### Frontend

```bash
cd frontend && npm run dev            # Vite dev server
cd frontend && npm run build          # tsc -b + vite build
cd frontend && npm run lint           # ESLint
cd frontend && npm run preview        # preview do build
```

Não há script `test` no `frontend/package.json` atual, embora existam arquivos `.spec.ts` em `frontend/src/features/auto-combat/`. Não invente comandos de teste frontend sem antes adicionar/configurar um runner.

## Regras de domínio do projeto

### Usuários e autenticação

- `UserRole`: `PLAYER`, `ADMIN`.
- Usuários têm `email` único e `passwordHash`.
- Autenticação usa JWT; endpoints sensíveis devem usar `JwtAuthGuard`.
- Frontend remove token local automaticamente ao receber HTTP `401`.

### Personagens

- `CharacterStatus`: `ACTIVE`, `DEAD`, `BLOCKED`, `DELETED`.
- Exclusão de personagem é lógica: usar `deletedAt`/status, não apagar dados sem necessidade.
- Personagem pertence a um usuário; sempre validar ownership.
- Limite atual identificado: 2 personagens por usuário no backend.
- Classes jogáveis atuais: `Lutador`, `Assassino`, `Atirador`, `Médico`.
- Personagem inicializa com classe, mapa inicial, HP calculado, equipamentos starter, inventário inicial, config de poção e proficiências de gathering.
- Avatares são associados à classe; validar `avatarKey` contra opções permitidas.

### Atributos, level e progressão

- Atributos primários: `strength`, `vitality`, `agility`, `precision`, `technique`, `willpower`.
- Stats derivados principais: `maxHp`, `attack`, `defense`, `speed`.
- Fórmulas de stats ficam em `backend/src/common/utils/stats.util.ts` e `level-stats.util.ts`.
- Config de progressão fica em `backend/src/common/config/progression.config.ts`:
  - `LAUNCH_LEVEL_CAP = 50`.
  - `FUTURE_LEVEL_CAP = 100`.
  - `LEVELS_PER_TIER = 10`.
  - balanceamento por tiers/dias/XP médio.
- Não replique fórmulas no frontend como fonte de verdade; o backend deve calcular e retornar dados canônicos.

### Mapas, submapas, mobs e encontros

- `GameMap` tem tier, minLevel, maxLevel e submaps.
- `SubMap` pertence a `GameMap` e tem encontros (`SubMapEncounter`) com pesos.
- `Mob` pertence a um mapa, tem level/tier/hp/attack/defense/speed/xpReward e drops.
- Seeds em `backend/prisma/seed-data/maps.seed-data.ts`, `mobs.seed-data.ts` e `encounters.seed-data.ts` são a base canônica inicial.

### Itens, inventário e equipamentos

- `Rarity`: `COMMON`, `UNCOMMON`, `RARE`, `EPIC`, `LEGENDARY`.
- `ItemSlot`: `MAIN_HAND`, `OFF_HAND`, `HEAD`, `ARMOR`, `PANTS`, `BOOTS`, `MATERIAL`, `CONSUMABLE`.
- `InventoryItemType`: `EQUIPMENT`, `MATERIAL`, `CONSUMABLE`.
- Equipamentos podem dar bônus nos seis atributos primários.
- Inventário agrega item/quantidade por personagem.
- Ao equipar, validar personagem, item no inventário, slot, classe/tier/requisitos quando aplicável.

### Combate manual

- `CombatStatus`: `IN_PROGRESS`, `PLAYER_WIN`, `PLAYER_LOSE`, `CANCELLED`.
- Logs usam `CombatActor`: `PLAYER`, `MOB`, `SYSTEM`.
- Fórmulas de dano/crítico/esquiva devem usar `backend/src/common/utils/combat-damage.util.ts`.
- Combate manual é endpoint autenticado em `/combat/start`.

### Auto-combate idle

- REST autenticado em `/auto-combat`.
- Socket.IO no namespace `/auto-combat`.
- Eventos de cliente principais: `auto-combat:join`, `auto-combat:leave`.
- Eventos de servidor incluem status, session-updated, finished, stopped, event, mob-spawned, hit, dodge, mob-defeated, player-defeated e potion-used.
- Config em `backend/src/common/config/auto-combat.config.ts`:
  - sessão padrão/máxima: 6 horas (`21600` segundos);
  - rodada atual: 3 segundos;
  - limite de processamento: 5000 combates por chamada;
  - finalizar ao chegar no `endsAt`.
- `AutoCombatSessionStatus`: `ACTIVE`, `FINISHED`, `STOPPED`, `DEFEATED`.
- Há histórico curto de eventos em `AutoCombatSessionEvent` com `sequence` único por sessão.
- Existe constraint/migration para sessão ativa única por personagem; preserve essa regra.
- Frontend processa eventos em fila visual; não aumente frequência/eventos sem verificar UX e backpressure.

### Gathering idle

- REST em `/gathering` e Socket.IO no namespace `/gathering`.
- Eventos de cliente: `gathering:join`, `gathering:leave`, `gathering:status:request`, `gathering:refresh`, `gathering:start`, `gathering:collect`, `gathering:stop`.
- `MaterialOrigin`: `DESMANCHE`, `COLETA`, `CONTENCAO`, `ARSENAL`, `PATRULHA`, `TECNOVARREDURA`, `DROP_MOBS`.
- `ActivityStatus`: `ACTIVE`, `STOPPED`, `COMPLETED`.
- Cada personagem tem proficiência por origem em `CharacterGatheringSkill`.
- Taxas por tier e limite de resolução ficam em `backend/src/common/config/gathering.config.ts`:
  - `GATHERING_RATE_BY_TIER` de tiers 1–10;
  - `MAX_GATHERING_HOURS_PER_RESOLVE = 24`.
- Materiais de gathering têm `requiredGatheringLevel`, `gatheringXpPerUnit` e `baseGatheringRatePerHour`.
- Sessões acumulam `collectedQuantity` e `collectedXp`.

### Consumíveis e enfermaria

- Consumíveis podem ter `healFlat`, `healPercent`, `usableInCombat`, `usableOutOfCombat`.
- Config de poção por personagem em `CharacterPotionConfig`:
  - `enabled`;
  - `hpThresholdPercent` padrão 35;
  - uso em combate manual e auto-combate;
  - item de poção opcional.
- Enfermaria tem endpoints autenticados de status e cura.

### Crafting

- Receitas em `CraftingRecipe`, ingredientes em `CraftingIngredient`.
- `CraftIngredientRole`: `MAIN_COMPONENT`, `SHARED_MATERIAL`, `RARE_MOB_DROP`.
- Itens craftáveis têm `isCraftable`, tier e ingredientes por origem.
- Seeds de receitas em `backend/prisma/seed-data/recipes.seed-data.ts`.

## Instruções para futuras sessões de IA/Codex

1. **Leia este arquivo primeiro** e depois confirme a estrutura real com comandos (`find`, `rg --files`, `git status`). Não assuma que a árvore continua igual.
2. **Preserve mudanças do usuário**: antes de editar, rode `git status --short`; não sobrescreva arquivos modificados por outra pessoa.
3. **Não use comandos lentos** como `ls -R` ou `grep -R`; prefira `find` limitado e `rg`.
4. **Não edite `node_modules`, `dist`, caches ou arquivos gerados** salvo solicitação explícita.
5. **Se alterar backend e frontend juntos**, mantenha contratos alinhados: DTO/response no backend, tipos/API/endpoints no frontend.
6. **Se alterar Prisma**, inclua migration, atualize seed se necessário e rode `prisma:generate`/validações possíveis.
7. **Se alterar regras de domínio**, atualize configs/utils/seeds/testes/docs relacionados. Evite duplicar regras entre backend e frontend.
8. **Se alterar endpoints**, atualize `frontend/src/services/api/endpoints.ts`, APIs das features e qualquer documentação afetada.
9. **Se alterar WebSocket events**, atualize gateway, client, tipos realtime e reducers/providers correspondentes.
10. **Se alterar UI perceptivelmente**, execute build/lint quando possível e capture screenshot se a tarefa exigir ou se houver app rodável no ambiente.
11. **Mantenha português brasileiro** para textos de interface, mensagens de erro de domínio e documentação do projeto.
12. **Ao adicionar dependência**, justifique a necessidade, atualize lockfile e verifique impactos de bundle/runtime.
13. **Ao adicionar testes**, siga padrões existentes: Jest/Nest no backend; frontend ainda não tem runner oficial configurado.
14. **Nunca invente comandos**: use somente scripts existentes ou explique claramente quando um comando exigir configuração adicional.
15. **Antes de finalizar**, rode a checklist abaixo e registre comandos executados no resumo final.

## Checklist de validação antes de finalizar alterações

### Sempre

- [ ] `git status --short` revisado antes e depois das alterações.
- [ ] Alterações limitadas ao escopo pedido.
- [ ] Nenhum segredo real em `.env`, logs, docs ou commits.
- [ ] Nenhum arquivo gerado pesado/caches/node_modules incluído.
- [ ] Documentação atualizada se comportamento, comandos, rotas ou regras mudaram.

### Backend

- [ ] `cd backend && npm run lint` quando houver alteração em `backend/src`, `backend/prisma` TS ou config relacionada.
- [ ] `cd backend && npm test` quando alterar services/utils/controllers testáveis.
- [ ] `cd backend && npm run test:e2e` quando alterar bootstrap, auth, rotas críticas ou integração HTTP.
- [ ] `cd backend && npm run build` antes de entregar mudanças backend relevantes.
- [ ] `cd backend && npm run prisma:generate` após alterar `schema.prisma`.
- [ ] `cd backend && npm run prisma:migrate`/migration criada após alteração de schema persistente.
- [ ] `cd backend && npm run prisma:seed` se seeds foram alterados ou se a mudança depende de dados canônicos.

### Frontend

- [ ] `cd frontend && npm run lint` quando houver alteração em `frontend/src` ou config frontend.
- [ ] `cd frontend && npm run build` antes de entregar mudanças frontend relevantes.
- [ ] Rotas, stores, APIs e tipos atualizados em conjunto.
- [ ] Verificar estados de loading/erro/vazio em telas novas/alteradas.
- [ ] Verificar responsividade/CSS quando alterar layout.

### Infra/ambiente

- [ ] `docker compose -f infra/docker-compose.yml up -d` se a validação exigir PostgreSQL/Redis local.
- [ ] Confirmar `DATABASE_URL` com porta `5433` ao usar o compose deste repo.
- [ ] Verificar migrations/seeds em banco limpo quando mudança afetar setup inicial.

### Tempo real

- [ ] Conferir namespace, eventos e payloads em backend e frontend.
- [ ] Validar join/leave por personagem e limpeza de listeners.
- [ ] Confirmar que polling/fallback REST continua funcionando se o socket falhar.

## Observações conhecidas do estado atual

- `backend/README.md` e `frontend/README.md` ainda parecem documentação padrão dos templates Nest/Vite; prefira o README raiz e este AGENTS para contexto específico.
- `frontend/src/app/providers.tsx` está vazio no momento.
- `frontend/src/store/game.store.ts` está vazio no momento.
- `frontend/src/features/characters/pages/CharacterCreatePage.tsx` existe, mas a criação parece estar integrada à seleção; confira `routes.tsx` antes de assumir rota própria.
- `frontend/.env.example` só documenta `VITE_API_URL`, mas o código suporta `VITE_SOCKET_URL`.
- `backend/.env.example` usa porta genérica `5432`; o Docker Compose local expõe PostgreSQL em `5433`.
- Há backups/arquivos legados de gathering em `frontend/_backup_gathering*`; não remova sem confirmação.
