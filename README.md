# MMORPG Idle Zumbi

## Visão Geral

**MMORPG Idle Zumbi** é um projeto full stack de jogo idle/MMORPG com temática de sobrevivência zumbi. O sistema combina uma aplicação web em React com uma API NestJS, banco PostgreSQL via Prisma e infraestrutura local com Docker Compose.

A aplicação permite autenticação de usuários, criação e seleção de personagens, evolução por nível e XP, gerenciamento de inventário/equipamentos, combate manual, combate automático idle com eventos em tempo real, gathering/expedições, crafting, consumíveis de cura e enfermaria.

> Este README foi elaborado com base nos arquivos do repositório `deadidlemmo/mmorpg-idle-zumbi`, especialmente `frontend/package.json`, `backend/package.json`, `backend/src/app.module.ts`, `backend/prisma/schema.prisma`, controllers, DTOs, services, arquivos `.env.example` e `infra/docker-compose.yml`.

## Resumo Técnico do Projeto

O projeto está organizado em duas aplicações principais:

- **Frontend**: SPA em React + TypeScript + Vite, com rotas protegidas, estado global via Zustand, consumo de API com Axios e eventos em tempo real via Socket.IO Client.
- **Backend**: API NestJS com módulos por domínio, autenticação JWT via Passport, validação global com `ValidationPipe`, persistência com Prisma ORM e banco PostgreSQL.

A infraestrutura local versionada contém PostgreSQL e Redis em `infra/docker-compose.yml`. O backend depende de `DATABASE_URL`, `JWT_SECRET`, configurações de Redis e `APP_PORT`. O frontend consome a API configurada por `VITE_API_URL` e usa Socket.IO para auto-combate, com suporte opcional a `VITE_SOCKET_URL` no código.

### Fluxo básico identificado

1. O usuário registra ou faz login em `/auth/register` ou `/auth/login`.
2. O backend retorna `user` e `accessToken`.
3. O frontend salva o token no `localStorage` com a chave `dead_idle_access_token`.
4. Requisições autenticadas enviam `Authorization: Bearer <token>`.
5. O usuário acessa a seleção de personagens.
6. O personagem pode ser consultado, criado, equipado, curado, enviado para gathering ou colocado em auto-combate.
7. O dashboard do personagem consolida status, atributos, equipamentos, progressão, atividades ativas e atalhos.
8. O auto-combate possui API REST e canal Socket.IO no namespace `/auto-combat`.
9. O banco mantém usuários, personagens, classes, mapas, submapas, mobs, itens, inventário, equipamentos, sessões e eventos.

## Status do Projeto

O projeto aparenta estar em **desenvolvimento/MVP**.

Evidências:

- `frontend/README.md` ainda contém documentação padrão do template Vite.
- `backend/README.md` ainda contém documentação padrão do template NestJS.
- Existem rotas placeholder no frontend para `crafting`, `inventory`, `equipment`, `consumables` e `maps` dentro do dashboard.
- A página `frontend/src/features/characters/pages/CharacterCreatePage.tsx` existe, mas a rota `/characters/new` não está registrada em `frontend/src/app/routes.tsx`.
- O backend possui módulos reais de domínio, migrations, seeds e testes básicos.
- Não foi identificado `README.md` na raiz do repositório antes desta documentação.

## Principais Sistemas e Módulos

### Sistema de autenticação

Arquivos principais:

- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/auth/auth.module.ts`
- `backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `backend/src/modules/auth/strategies/jwt.strategy.ts`
- `frontend/src/features/auth/`
- `frontend/src/store/auth.store.ts`
- `frontend/src/services/api/authToken.ts`

Funcionalidades confirmadas:

- Registro de usuário.
- Login de usuário.
- Geração de JWT.
- Hash de senha com `bcrypt`.
- Estratégia JWT via `passport-jwt`.
- Proteção de rotas backend com `JwtAuthGuard`.
- Armazenamento do token no frontend via `localStorage`.
- Remoção automática do token em resposta HTTP `401`.

### Sistema de usuários

Arquivos principais:

- `backend/src/modules/users/users.module.ts`
- `backend/src/modules/users/users.service.ts`
- `backend/prisma/schema.prisma`

Funcionalidades confirmadas:

- Busca de usuário por e-mail.
- Busca de usuário por ID.
- Criação de usuário com `email` e `passwordHash`.
- Papel de usuário via enum `UserRole`, com valores `PLAYER` e `ADMIN`.

Não foi identificado controller público específico para administração de usuários além dos endpoints de autenticação.

### Sistema de personagens

Arquivos principais:

- `backend/src/modules/characters/characters.controller.ts`
- `backend/src/modules/characters/characters.service.ts`
- `backend/src/modules/characters/dto/create-character.dto.ts`
- `frontend/src/features/characters/`
- `frontend/src/store/character.store.ts`

Funcionalidades confirmadas:

- Criação de personagem autenticada.
- Listagem de personagens do usuário autenticado.
- Consulta de personagem por ID.
- Consulta de status.
- Consulta de overview para dashboard.
- Exclusão lógica por `deletedAt` e status `DELETED`.
- Limite de 2 personagens por usuário no backend.
- Validação de nome, classe e avatar.
- Inicialização de personagem com classe, mapa inicial, equipamentos starter, HP calculado, inventário inicial, configuração de poção e proficiências de gathering.

Classes aceitas no backend para criação:

- `Lutador`
- `Assassino`
- `Atirador`
- `Médico`

### Sistema de classes, mapas, submapas, mobs e itens

Arquivos principais:

- `backend/src/modules/game-classes/`
- `backend/src/modules/maps/`
- `backend/src/modules/mobs/`
- `backend/src/modules/items/`
- `backend/prisma/schema.prisma`
- `backend/prisma/seed-data/`
- `backend/prisma/seed.ts`

Funcionalidades confirmadas:

- Listagem e consulta de classes.
- Listagem e consulta de mapas.
- Listagem e consulta de mobs.
- Listagem e consulta de itens.
- Seed modular para classes, mapas, mobs, encontros, itens, consumíveis, materiais, receitas e drops.

### Sistema de inventário

Arquivos principais:

- `backend/src/modules/inventory/inventory.controller.ts`
- `backend/src/modules/inventory/inventory.service.ts`
- `backend/prisma/schema.prisma`
- `frontend/src/features/inventory/`

Funcionalidades confirmadas:

- Consulta do inventário de um personagem autenticado por `GET /inventory/:characterId`.
- Modelagem de itens de inventário com tipo `EQUIPMENT`, `MATERIAL` ou `CONSUMABLE`.
- Relação entre personagem, item e quantidade.

### Sistema de equipamentos

Arquivos principais:

- `backend/src/modules/equipment/equipment.controller.ts`
- `backend/src/modules/equipment/equipment.service.ts`
- `backend/src/modules/equipment/dto/equip-item.dto.ts`
- `backend/prisma/schema.prisma`
- `frontend/src/features/equipment/`
- `frontend/src/features/dashboard/components/DashboardEquipmentBody.tsx`

Funcionalidades confirmadas:

- Consulta de equipamentos por personagem.
- Equipar item por `characterId` e `itemId`.
- Slots modelados: `MAIN_HAND`, `OFF_HAND`, `HEAD`, `ARMOR`, `PANTS`, `BOOTS`.
- Equipamento atual do personagem modelado como relação única em `Equipment`.

### Sistema de consumíveis e poção automática

Arquivos principais:

- `backend/src/modules/consumables/consumables.controller.ts`
- `backend/src/modules/consumables/consumables.service.ts`
- `backend/src/modules/consumables/dto/use-consumable.dto.ts`
- `backend/src/modules/consumables/dto/update-potion-config.dto.ts`
- `backend/prisma/schema.prisma`
- `frontend/src/features/consumables/`
- `frontend/src/features/auto-combat/types/auto-combat-page.types.ts`

Funcionalidades confirmadas:

- Uso de consumível por `characterId` e `itemId`.
- Consulta da configuração de poção automática.
- Atualização da configuração de poção automática.
- Configuração com `enabled`, `potionItemId`, `hpThresholdPercent`, `useInManualCombat` e `useInAutoCombat`.
- Validação de `hpThresholdPercent` entre 1 e 100.

### Sistema de enfermaria

Arquivos principais:

- `backend/src/modules/infirmary/infirmary.controller.ts`
- `backend/src/modules/infirmary/infirmary.service.ts`
- `backend/src/common/activity-guard/activity-guard.service.ts`

Funcionalidades confirmadas:

- Consulta do status de enfermaria por personagem.
- Cura de personagem por endpoint autenticado.
- Bloqueio de uso durante auto-combate ou gathering ativo via `ActivityGuardService`.

### Sistema de combate manual

Arquivos principais:

- `backend/src/modules/combat/combat.controller.ts`
- `backend/src/modules/combat/combat.service.ts`
- `backend/src/modules/combat/dto/start-combat.dto.ts`
- `backend/prisma/schema.prisma`

Funcionalidades confirmadas:

- Início de combate manual por `characterId` e `mobId`.
- Registro de combates e logs no banco via modelos `Combat` e `CombatLog`.

### Sistema de auto-combate idle

Arquivos principais:

- `backend/src/modules/auto-combat/auto-combat.controller.ts`
- `backend/src/modules/auto-combat/auto-combat.service.ts`
- `backend/src/modules/auto-combat/auto-combat.gateway.ts`
- `backend/src/modules/auto-combat/dto/start-auto-combat.dto.ts`
- `backend/src/modules/auto-combat/dto/preview-auto-combat.dto.ts`
- `backend/src/common/config/auto-combat.config.ts`
- `frontend/src/features/auto-combat/`
- `frontend/src/services/websocket/socketClient.ts`

Funcionalidades confirmadas:

- Iniciar sessão de auto-combate.
- Gerar preview/projeção de auto-combate.
- Consultar status de sessão.
- Consultar eventos recentes.
- Parar sessão.
- Duração padrão de sessão de 6 horas no backend.
- Duração de rodada configurada em 3 segundos.
- Persistência de sessão, loot, resumo de mobs e eventos.
- Eventos em tempo real via Socket.IO.
- Sala por personagem no formato `auto-combat:character:<characterId>`.

### Sistema de gathering/expedições

Arquivos principais:

- `backend/src/modules/gathering/gathering.controller.ts`
- `backend/src/modules/gathering/gathering.service.ts`
- `backend/src/modules/gathering/dto/start-gathering.dto.ts`
- `backend/src/common/config/gathering.config.ts`
- `backend/prisma/schema.prisma`
- `frontend/src/features/gathering/`

Funcionalidades confirmadas:

- Listagem de materiais disponíveis por mapa e origem.
- Início de gathering.
- Consulta de status.
- Coleta de produção acumulada.
- Parada de gathering.
- Sessão com `progressRemainder`, `collectedQuantity` e `collectedXp`.
- Proficiências por personagem em `CharacterGatheringSkill`.
- Limite de resolução de gathering de 24 horas por chamada.

Origens de material modeladas:

- `DESMANCHE`
- `COLETA`
- `CONTENCAO`
- `ARSENAL`
- `PATRULHA`
- `TECNOVARREDURA`
- `DROP_MOBS`

### Sistema de crafting

Arquivos principais:

- `backend/src/modules/crafting/crafting.controller.ts`
- `backend/src/modules/crafting/crafting.service.ts`
- `backend/src/modules/crafting/dto/craft-item.dto.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/seed-data/recipes.seed-data.ts`
- `frontend/src/features/crafting/`

Funcionalidades confirmadas:

- Listagem de receitas por personagem.
- Filtros por tier, slot e `craftableOnly`.
- Consulta de receita por item de saída.
- Criação/craft de item por `characterId`, `itemId` e quantidade opcional.
- Modelos `CraftingRecipe` e `CraftingIngredient`.

### Sistema de atividade exclusiva

Arquivo principal:

- `backend/src/common/activity-guard/activity-guard.service.ts`

Responsabilidades confirmadas:

- Impedir início de auto-combate se o personagem já estiver em gathering.
- Impedir início de gathering se o personagem já estiver em auto-combate.
- Impedir ação se personagem não estiver ativo ou estiver sem HP.
- Impedir uso da enfermaria durante auto-combate ou gathering ativo.

### Sistema de frontend

Arquivos principais:

- `frontend/src/app/routes.tsx`
- `frontend/src/services/api/apiClient.ts`
- `frontend/src/services/api/endpoints.ts`
- `frontend/src/services/websocket/socketClient.ts`
- `frontend/src/store/`
- `frontend/src/features/`

Funcionalidades confirmadas:

- SPA com rotas públicas e protegidas.
- Login/cadastro.
- Seleção de personagem.
- Dashboard com providers de tempo real para auto-combate e gathering.
- Páginas de auto-combate e gathering.
- Placeholders de telas futuras no dashboard.

## Tecnologias Utilizadas

### Frontend

| Tecnologia | Uso |
|---|---|
| React `^19.2.5` | Interface web |
| React DOM `^19.2.5` | Renderização |
| TypeScript `~6.0.2` | Tipagem |
| Vite `^8.0.10` | Dev server e build |
| React Router DOM `^7.14.2` | Rotas SPA |
| Axios `^1.15.2` | Cliente HTTP |
| Zustand `^5.0.12` | Estado global |
| Socket.IO Client `^4.8.3` | Eventos em tempo real |
| Lucide React `^1.11.0` | Ícones |
| clsx `^2.1.1` | Composição de classes |
| ESLint | Lint |

### Backend

| Tecnologia | Uso |
|---|---|
| NestJS `^11.0.1` | Framework backend |
| TypeScript `^5.7.3` | Tipagem |
| Prisma `^6.19.0` | ORM e migrations |
| PostgreSQL | Banco de dados via Prisma |
| Passport + Passport JWT | Estratégia de autenticação JWT |
| `@nestjs/jwt` | Emissão/validação de JWT |
| bcrypt `^6.0.0` | Hash de senha |
| class-validator | Validação de DTOs |
| class-transformer | Transformação de payloads |
| Socket.IO `^4.8.3` | WebSocket/tempo real |
| ioredis `^5.10.1` | Dependência instalada; uso runtime específico não confirmado no código analisado |
| Jest | Testes |
| Supertest | Testes e2e |
| Prettier | Formatação |
| ESLint | Lint |

### Banco e infraestrutura

| Tecnologia | Uso |
|---|---|
| PostgreSQL 16 | Banco local no Docker Compose |
| Redis 7 | Serviço local no Docker Compose |
| Docker Compose | Subida de serviços locais |

## Arquitetura do Projeto

### Frontend

O frontend é uma SPA em React. A entrada da aplicação está em:

```text
frontend/src/main.tsx
frontend/src/App.tsx
frontend/src/app/routes.tsx
```

A arquitetura é organizada por features:

```text
frontend/src/features/auth
frontend/src/features/characters
frontend/src/features/dashboard
frontend/src/features/auto-combat
frontend/src/features/gathering
frontend/src/features/consumables
frontend/src/features/crafting
frontend/src/features/equipment
frontend/src/features/inventory
frontend/src/features/maps
```

A camada HTTP fica em `frontend/src/services/api`, e o Socket.IO em `frontend/src/services/websocket`.

Rotas protegidas usam `useAuthStore` para verificar `isAuthenticated`. Não foi identificado carregamento inicial de `/auth/me` na inicialização da aplicação; a autenticação inicial considera a existência do token salvo.

### Backend

O backend usa NestJS com módulos por domínio. O arquivo `backend/src/app.module.ts` importa:

- `ConfigModule`
- `PrismaModule`
- `GameClassesModule`
- `MapsModule`
- `MobsModule`
- `ItemsModule`
- `UsersModule`
- `AuthModule`
- `CharactersModule`
- `CombatModule`
- `AutoCombatModule`
- `InventoryModule`
- `EquipmentModule`
- `ConsumablesModule`
- `InfirmaryModule`
- `CraftingModule`
- `GatheringModule`

A aplicação habilita CORS com `origin: true` e `credentials: true`, e usa `ValidationPipe` global com:

```ts
whitelist: true
forbidNonWhitelisted: true
transform: true
```

A porta usa `APP_PORT` ou fallback `3000`.

### Banco de dados

O banco é PostgreSQL com Prisma. O schema está em:

```text
backend/prisma/schema.prisma
```

O datasource usa:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### Infraestrutura

A infraestrutura local versionada está em:

```text
infra/docker-compose.yml
```

Ela sobe:

- PostgreSQL 16 em `localhost:5433`.
- Redis 7 em `localhost:6379`.

Não foi identificado Dockerfile para frontend ou backend.

### Autenticação

A autenticação usa JWT Bearer Token. O backend valida token com `JwtStrategy`, extraindo o JWT de `Authorization: Bearer <token>`.

O frontend salva o token no `localStorage` e o Axios injeta o header automaticamente.

### Serviços e middlewares

Serviços principais por domínio:

- `AuthService`
- `UsersService`
- `CharactersService`
- `CombatService`
- `AutoCombatService`
- `InventoryService`
- `EquipmentService`
- `ConsumablesService`
- `InfirmaryService`
- `CraftingService`
- `GatheringService`
- `ActivityGuardService`
- `PrismaService`

Não foi identificado middleware customizado global. A proteção é feita principalmente por guards (`JwtAuthGuard`) em controllers específicos.

### Rotas

As rotas backend são definidas por decorators NestJS nos controllers. A API não possui prefixo global como `/api` identificado em `main.ts`.

### Models/Schemas

Os models Prisma confirmados são:

- `User`
- `GameClass`
- `GameMap`
- `SubMap`
- `SubMapEncounter`
- `Character`
- `CharacterGatheringSkill`
- `Mob`
- `Item`
- `CraftingRecipe`
- `CraftingIngredient`
- `GatheringSession`
- `InventoryItem`
- `Equipment`
- `CharacterPotionConfig`
- `MobDrop`
- `Combat`
- `CombatLog`
- `AutoCombatSession`
- `AutoCombatSessionLoot`
- `AutoCombatSessionMobSummary`
- `AutoCombatSessionEvent`

### Migrations

Foram identificadas migrations em `backend/prisma/migrations`, incluindo alterações para:

- schema inicial;
- refatoração de atributos primários;
- submapas de auto-combate;
- consumíveis e configuração de poção;
- crafting e gathering;
- soft delete de personagens;
- avatar do personagem;
- estado em tempo real do auto-combate;
- eventos de sessão de auto-combate;
- nivelamento de gathering;
- totais coletados por sessão de gathering.

### Testes

O backend possui testes unitários e e2e básicos:

- `backend/src/app.controller.spec.ts`
- `backend/src/prisma/prisma.service.spec.ts`
- `backend/test/app.e2e-spec.ts`
- `backend/test/jest-e2e.json`

O frontend não possui script de teste identificado em `frontend/package.json`.

## Estrutura de Pastas

```text
.
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── seed-data/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── seed.reset.ts
│   ├── src/
│   │   ├── common/
│   │   ├── modules/
│   │   ├── prisma/
│   │   ├── app.controller.ts
│   │   ├── app.module.ts
│   │   ├── app.service.ts
│   │   └── main.ts
│   ├── test/
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   └── README.md
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── features/
│   │   ├── services/
│   │   ├── store/
│   │   ├── types/
│   │   └── utils/
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   └── README.md
├── infra/
│   └── docker-compose.yml
├── _diagnostico-gathering/
└── README.md
```

### `backend/`

Aplicação NestJS. Contém módulos, services, controllers, DTOs, testes, Prisma schema, migrations e seeds.

### `backend/src/common/`

Código compartilhado do backend, incluindo:

- `activity-guard/`
- configurações de progressão, gathering e auto-combate;
- utilitários de dano, stats, level, gathering e penalidade de farm.

### `backend/src/modules/`

Módulos de domínio do backend:

- `auth`
- `users`
- `characters`
- `combat`
- `auto-combat`
- `inventory`
- `equipment`
- `consumables`
- `infirmary`
- `crafting`
- `gathering`
- `game-classes`
- `maps`
- `mobs`
- `items`

### `backend/prisma/`

Contém o schema Prisma, migrations e seeds.

### `frontend/`

Aplicação React + TypeScript + Vite.

### `frontend/src/features/`

Organização por domínio/tela do frontend.

### `frontend/src/services/`

Clientes e serviços compartilhados:

- API HTTP com Axios;
- autenticação/token;
- Socket.IO.

### `frontend/src/store/`

Stores Zustand para autenticação, personagem e estado de jogo.

### `infra/`

Infraestrutura local com Docker Compose.

### `_diagnostico-gathering/`

Arquivos de diagnóstico e análise relacionados especialmente ao sistema de gathering. Esses arquivos são úteis como referência técnica, mas não substituem os arquivos-fonte do backend/frontend.

## Funcionalidades

### Frontend

- Página de autenticação com login e cadastro.
- Proteção de rotas baseada em autenticação local.
- Seleção de personagem.
- Tela de criação de personagem implementada em arquivo próprio.
- Dashboard do personagem.
- Painel de atributos.
- Painel de equipamentos.
- Painel de proficiências de gathering.
- Página de auto-combate.
- Página hub de gathering.
- Página de origem de gathering.
- Providers de tempo real para dashboard.
- Integração HTTP com backend via Axios.
- Integração Socket.IO para auto-combate.

### Backend

- API NestJS modular.
- Registro e login de usuários.
- JWT Bearer Token.
- CRUD parcial de personagens.
- Soft delete de personagens.
- Consulta de status e overview de personagem.
- Combate manual.
- Auto-combate idle.
- Gateway Socket.IO de auto-combate.
- Inventário.
- Equipamentos.
- Consumíveis.
- Configuração de poção automática.
- Enfermaria.
- Crafting.
- Gathering.
- Listagem de classes, mapas, mobs e itens.
- Seeds de dados-base do jogo.
- Migrations Prisma.

### Banco de Dados

- Usuários.
- Personagens.
- Classes.
- Mapas e submapas.
- Mobs.
- Itens.
- Inventário.
- Equipamentos.
- Consumíveis e configuração de poção.
- Combates manuais.
- Sessões de auto-combate.
- Eventos de auto-combate.
- Gathering e proficiências.
- Crafting e ingredientes.
- Drops de mobs.

## Pré-requisitos

- Git.
- Node.js.
- npm.
- Docker e Docker Compose, para subir PostgreSQL e Redis localmente.
- PostgreSQL, caso não use Docker.
- Redis, caso os fluxos que dependam dele sejam habilitados fora do Docker.

> Não foi identificado `.nvmrc`, `volta`, `asdf` ou campo `engines` nos `package.json` do projeto. A versão mínima exata de Node.js deve ser confirmada pela equipe. As dependências utilizadas são modernas e compatíveis com stacks recentes de NestJS/Vite.

## Instalação

Clone o repositório:

```bash
git clone https://github.com/deadidlemmo/mmorpg-idle-zumbi.git
cd mmorpg-idle-zumbi
```

Instale as dependências do backend:

```bash
cd backend
npm install
```

Instale as dependências do frontend:

```bash
cd ../frontend
npm install
```

## Configuração de Ambiente

### Backend

Arquivo de exemplo:

```text
backend/.env.example
```

Variáveis identificadas:

| Variável | Obrigatória | Descrição | Exemplo seguro |
|---|---:|---|---|
| `DATABASE_URL` | Sim | String de conexão PostgreSQL usada pelo Prisma. | `postgresql://<usuario>:<senha>@localhost:5433/mmorpg_zumbi?schema=public` |
| `JWT_SECRET` | Sim | Chave secreta usada para assinar/verificar JWT. | `<chave-jwt-forte>` |
| `JWT_EXPIRES_IN` | A confirmar | Presente no `.env.example`; o código atual em `AuthModule` usa `expiresIn: '7d'` fixo. | `7d` |
| `REDIS_HOST` | A confirmar | Host Redis presente no `.env.example`. Uso runtime específico não foi confirmado nos arquivos analisados. | `localhost` |
| `REDIS_PORT` | A confirmar | Porta Redis presente no `.env.example`. | `6379` |
| `APP_PORT` | Não | Porta HTTP do backend. Fallback: `3000`. | `3000` |

Crie o `.env` do backend:

```bash
cd backend
cp .env.example .env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
```

> Se usar o PostgreSQL do `infra/docker-compose.yml`, ajuste a porta do `DATABASE_URL` para `5433`, pois o container expõe `5433:5432` no host.

### Frontend

Arquivo de exemplo:

```text
frontend/.env.example
```

Variáveis identificadas:

| Variável | Obrigatória | Descrição | Exemplo seguro |
|---|---:|---|---|
| `VITE_API_URL` | Recomendada | URL base da API HTTP consumida pelo Axios. Fallback no código: `http://localhost:3000`. | `http://localhost:3000` |
| `VITE_SOCKET_URL` | Opcional | URL base para Socket.IO. Não está no `.env.example`, mas é lida por `frontend/src/services/websocket/socketClient.ts`. Se ausente, usa `VITE_API_URL` ou fallback. | `http://localhost:3000` |

Crie o `.env.local` do frontend:

```bash
cd frontend
cp .env.example .env.local
```

No PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Exemplo seguro:

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

## Como Executar o Projeto

### Executar infraestrutura local

A partir da raiz do projeto:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Serviços:

| Serviço | Porta local | Container |
|---|---:|---|
| PostgreSQL | `5433` | `zumbi_postgres` |
| Redis | `6379` | `zumbi_redis` |

Parar os containers:

```bash
docker compose -f infra/docker-compose.yml down
```

Parar e remover volumes:

```bash
docker compose -f infra/docker-compose.yml down -v
```

### Executar Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

Backend em desenvolvimento:

```text
http://localhost:3000
```

A porta pode ser alterada por `APP_PORT`.

### Executar Frontend

```bash
cd frontend
npm install
npm run dev
```

O Vite exibirá a URL local no terminal.

### Executar em produção local

Backend:

```bash
cd backend
npm run build
npm run start:prod
```

Frontend:

```bash
cd frontend
npm run build
npm run preview
```

## Scripts Disponíveis

### Backend

Arquivo: `backend/package.json`

| Comando | Descrição |
|---|---|
| `npm run build` | Compila o backend com Nest CLI. |
| `npm run format` | Formata arquivos TypeScript de `src` e `test` com Prettier. |
| `npm run start` | Inicia o backend com Nest. |
| `npm run start:dev` | Inicia o backend em modo watch. |
| `npm run start:debug` | Inicia o backend em modo debug/watch. |
| `npm run start:prod` | Executa `node dist/main`. |
| `npm run lint` | Executa ESLint com `--fix`. |
| `npm run test` | Executa testes Jest. |
| `npm run test:watch` | Executa Jest em watch mode. |
| `npm run test:cov` | Executa testes com cobertura. |
| `npm run test:debug` | Executa Jest com inspector/debug. |
| `npm run test:e2e` | Executa testes e2e com `test/jest-e2e.json`. |
| `npm run prisma:generate` | Executa `prisma generate`. |
| `npm run prisma:migrate` | Executa `prisma migrate dev`. |
| `npm run prisma:studio` | Abre Prisma Studio. |
| `npm run prisma:seed` | Executa `prisma db seed`, configurado para `tsx prisma/seed.ts`. |
| `npm run test:grant-lutador-t1` | Executa `tsx prisma/grant-lutador-tier1-items.ts`. Arquivo não foi analisado em detalhe neste README. |

### Frontend

Arquivo: `frontend/package.json`

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o Vite em desenvolvimento. |
| `npm run build` | Executa `tsc -b` e `vite build`. |
| `npm run lint` | Executa ESLint no frontend. |
| `npm run preview` | Executa preview local do build Vite. |

## API e Endpoints

A API backend não possui prefixo global identificado. As rotas partem da raiz do servidor, por exemplo:

```text
POST /auth/login
GET /characters/me
POST /auto-combat/start
```

### Health/root

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/` | Retorna `Hello World!`. | Não identificada |

### Auth

Controller: `backend/src/modules/auth/auth.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `POST` | `/auth/register` | Registra usuário e retorna token. | Não |
| `POST` | `/auth/login` | Autentica usuário e retorna token. | Não |
| `GET` | `/auth/me` | Retorna usuário autenticado. | JWT |

Payload de registro:

```json
{
  "email": "usuario@example.com",
  "password": "senha123"
}
```

Validações confirmadas:

- `email`: e-mail válido, máximo de 120 caracteres, normalizado para minúsculo.
- `password`: texto obrigatório, 6 a 72 caracteres.
- Registro exige pelo menos uma letra e um número na senha.

Resposta de login/registro:

```json
{
  "user": {
    "id": "uuid",
    "email": "usuario@example.com",
    "role": "PLAYER",
    "createdAt": "datetime",
    "updatedAt": "datetime"
  },
  "accessToken": "jwt"
}
```

### Characters

Controller: `backend/src/modules/characters/characters.controller.ts`

Todas as rotas do controller usam `JwtAuthGuard`.

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `POST` | `/characters` | Cria personagem para o usuário autenticado. | JWT |
| `GET` | `/characters/me` | Lista personagens do usuário autenticado. | JWT |
| `GET` | `/characters/:id/status` | Consulta status do personagem. | JWT |
| `GET` | `/characters/:id/overview` | Consulta overview completo para dashboard. | JWT |
| `GET` | `/characters/:id` | Consulta personagem por ID. | JWT |
| `DELETE` | `/characters/:id` | Faz soft delete do personagem. | JWT |

Payload de criação:

```json
{
  "name": "Sobrevivente 01",
  "className": "Lutador",
  "avatarKey": "lutador-01"
}
```

Validações confirmadas:

- `name`: obrigatório, 3 a 24 caracteres, letras/números/espaços.
- `className`: `Lutador`, `Assassino`, `Atirador` ou `Médico`.
- `avatarKey`: opcional, deve pertencer à lista de avatares permitidos por classe.

Regras confirmadas:

- Máximo de 2 personagens por usuário.
- Nome único por usuário, incluindo personagens já excluídos logicamente.
- Não é possível excluir personagem com auto-combate ativo.
- Não é possível excluir personagem com gathering ativo.

### Game Classes

Controller: `backend/src/modules/game-classes/game-classes.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/game-classes` | Lista classes. | Não identificada no controller |
| `GET` | `/game-classes/:id` | Consulta classe por ID. | Não identificada no controller |

### Maps

Controller: `backend/src/modules/maps/maps.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/maps` | Lista mapas. | Não identificada no controller |
| `GET` | `/maps/:id` | Consulta mapa por ID. | Não identificada no controller |

### Mobs

Controller: `backend/src/modules/mobs/mobs.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/mobs` | Lista mobs. | Não identificada no controller |
| `GET` | `/mobs/:id` | Consulta mob por ID. | Não identificada no controller |

### Items

Controller: `backend/src/modules/items/items.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/items` | Lista itens. | Não identificada no controller |
| `GET` | `/items/:id` | Consulta item por ID. | Não identificada no controller |

### Combat

Controller: `backend/src/modules/combat/combat.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `POST` | `/combat/start` | Inicia combate manual. | JWT |

Payload:

```json
{
  "characterId": "uuid-ou-string",
  "mobId": "uuid-ou-string"
}
```

### Auto-combat

Controller: `backend/src/modules/auto-combat/auto-combat.controller.ts`

Todas as rotas do controller usam `JwtAuthGuard`.

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `POST` | `/auto-combat/start` | Inicia sessão de auto-combate. | JWT |
| `POST` | `/auto-combat/preview` | Gera projeção/preview de auto-combate. | JWT |
| `GET` | `/auto-combat/:characterId/status` | Consulta status da sessão. | JWT |
| `GET` | `/auto-combat/:characterId/recent-events` | Consulta eventos recentes. | JWT |
| `POST` | `/auto-combat/:characterId/stop` | Para sessão ativa. | JWT |

Payload de início:

```json
{
  "characterId": "uuid",
  "subMapId": "uuid"
}
```

Payload de preview:

```json
{
  "characterId": "uuid",
  "subMapId": "uuid",
  "projectionSeconds": 300,
  "iterations": 5
}
```

Validações confirmadas para preview:

- `projectionSeconds`: opcional, inteiro, mínimo 5, máximo 21600.
- `iterations`: opcional, inteiro, mínimo 1, máximo 14.

### Auto-combat WebSocket

Gateway: `backend/src/modules/auto-combat/auto-combat.gateway.ts`

Namespace:

```text
/auto-combat
```

Autenticação do socket:

- `handshake.auth.token`
- `handshake.auth.accessToken`
- `handshake.query.token`
- `handshake.query.accessToken`
- header `authorization`

Eventos recebidos do cliente:

| Evento | Payload |
|---|---|
| `auto-combat:join` | `{ "characterId": "uuid" }` |
| `auto-combat:leave` | `{ "characterId": "uuid" }` |

Eventos emitidos pelo servidor:

| Evento | Descrição |
|---|---|
| `auto-combat:connected` | Socket autenticado. |
| `auto-combat:joined` | Cliente entrou na sala do personagem. |
| `auto-combat:left` | Cliente saiu da sala. |
| `auto-combat:error` | Erro de autenticação ou operação. |
| `auto-combat:status` | Status da sessão. |
| `auto-combat:session-updated` | Atualização de sessão. |
| `auto-combat:hit` | Evento de golpe. |
| `auto-combat:dodge` | Evento de esquiva. |
| `auto-combat:mob-spawned` | Mob apareceu. |
| `auto-combat:mob-defeated` | Mob derrotado. |
| `auto-combat:player-defeated` | Personagem derrotado. |
| `auto-combat:potion-used` | Poção usada. |
| `auto-combat:finished` | Sessão finalizada. |
| `auto-combat:stopped` | Sessão parada. |
| `auto-combat:event` | Evento genérico espelhado para o frontend. |

### Inventory

Controller: `backend/src/modules/inventory/inventory.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/inventory/:characterId` | Lista inventário do personagem autenticado. | JWT |

### Equipment

Controller: `backend/src/modules/equipment/equipment.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/equipment/:characterId` | Consulta equipamentos do personagem. | JWT |
| `POST` | `/equipment/equip` | Equipa item. | JWT |

Payload:

```json
{
  "characterId": "uuid-ou-string",
  "itemId": "uuid-ou-string"
}
```

### Consumables

Controller: `backend/src/modules/consumables/consumables.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `POST` | `/consumables/use` | Usa consumível. | JWT |
| `GET` | `/consumables/:characterId/config` | Consulta configuração de poção automática. | JWT |
| `PATCH` | `/consumables/:characterId/config` | Atualiza configuração de poção automática. | JWT |

Payload para usar consumível:

```json
{
  "characterId": "uuid",
  "itemId": "uuid"
}
```

Payload para configuração de poção:

```json
{
  "enabled": true,
  "potionItemId": "uuid",
  "hpThresholdPercent": 35,
  "useInManualCombat": true,
  "useInAutoCombat": true
}
```

### Infirmary

Controller: `backend/src/modules/infirmary/infirmary.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/infirmary/:characterId/status` | Consulta status de cura. | JWT |
| `POST` | `/infirmary/:characterId/heal` | Cura personagem. | JWT |

### Crafting

Controller: `backend/src/modules/crafting/crafting.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/crafting/character/:characterId/recipes` | Lista receitas do personagem. | Não identificada no controller |
| `GET` | `/crafting/:itemId/recipe` | Consulta receita por item de saída. | Não identificada no controller |
| `POST` | `/crafting/craft` | Cria item. | Não identificada no controller |

Query params de listagem:

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `tier` | number opcional | Filtra por tier. |
| `slot` | `ItemSlot` opcional | Filtra por slot. |
| `craftableOnly` | string opcional | Quando `true`, lista apenas receitas craftáveis. |

Payload de craft:

```json
{
  "characterId": "uuid-ou-string",
  "itemId": "uuid-ou-string",
  "quantity": 1
}
```

### Gathering

Controller: `backend/src/modules/gathering/gathering.controller.ts`

| Método | Endpoint | Descrição | Autenticação |
|---|---|---|---|
| `GET` | `/gathering/materials` | Lista materiais por mapa e origem. | Não identificada no controller |
| `POST` | `/gathering/start` | Inicia gathering. | Não identificada no controller |
| `GET` | `/gathering/:characterId/status` | Consulta status de gathering. | Não identificada no controller |
| `POST` | `/gathering/:characterId/collect` | Coleta produção acumulada. | Não identificada no controller |
| `POST` | `/gathering/:characterId/stop` | Para gathering. | Não identificada no controller |

Query params de `/gathering/materials`:

```json
{
  "mapId": "uuid-ou-string",
  "origin": "DESMANCHE"
}
```

Payload de início:

```json
{
  "characterId": "uuid-ou-string",
  "mapId": "uuid-ou-string",
  "origin": "DESMANCHE",
  "targetMaterialId": "uuid-ou-string"
}
```

## Rotas do Frontend

Arquivo: `frontend/src/app/routes.tsx`

| Rota | Tipo | Tela |
|---|---|---|
| `/` | Pública apenas para não autenticado | `AuthPage` |
| `/characters` | Protegida | `CharacterSelectPage` |
| `/dashboard/:characterId` | Protegida | `DashboardOverviewPage` |
| `/dashboard/:characterId/auto-combat` | Protegida | `AutoCombatPage` |
| `/dashboard/:characterId/gathering` | Protegida | `GatheringHubPage` |
| `/dashboard/:characterId/gathering/:origin` | Protegida | `GatheringOriginPage` |
| `/dashboard/:characterId/crafting` | Protegida | Placeholder de Criação |
| `/dashboard/:characterId/inventory` | Protegida | Placeholder de Mochila |
| `/dashboard/:characterId/equipment` | Protegida | Placeholder de Equipamentos |
| `/dashboard/:characterId/consumables` | Protegida | Placeholder de Consumíveis e Enfermaria |
| `/dashboard/:characterId/maps` | Protegida | Placeholder de Mapas |

### Inconsistência identificada

O código de seleção de personagens navega para `/characters/new`, e existe `frontend/src/features/characters/pages/CharacterCreatePage.tsx`. Porém, essa rota não está registrada em `frontend/src/app/routes.tsx`.

## Banco de Dados

### Tipo de banco

PostgreSQL.

### ORM

Prisma ORM.

### Schema

Arquivo:

```text
backend/prisma/schema.prisma
```

### Enums

Enums confirmados:

- `UserRole`: `PLAYER`, `ADMIN`
- `CharacterStatus`: `ACTIVE`, `DEAD`, `BLOCKED`, `DELETED`
- `Rarity`: `COMMON`, `UNCOMMON`, `RARE`, `EPIC`, `LEGENDARY`
- `ItemSlot`: `MAIN_HAND`, `OFF_HAND`, `HEAD`, `ARMOR`, `PANTS`, `BOOTS`, `MATERIAL`, `CONSUMABLE`
- `InventoryItemType`: `EQUIPMENT`, `MATERIAL`, `CONSUMABLE`
- `CombatStatus`: `IN_PROGRESS`, `PLAYER_WIN`, `PLAYER_LOSE`, `CANCELLED`
- `CombatActor`: `PLAYER`, `MOB`, `SYSTEM`
- `AutoCombatSessionStatus`: `ACTIVE`, `FINISHED`, `STOPPED`, `DEFEATED`
- `MaterialOrigin`: `DESMANCHE`, `COLETA`, `CONTENCAO`, `ARSENAL`, `PATRULHA`, `TECNOVARREDURA`, `DROP_MOBS`
- `ActivityStatus`: `ACTIVE`, `STOPPED`, `COMPLETED`
- `CraftIngredientRole`: `MAIN_COMPONENT`, `SHARED_MATERIAL`, `RARE_MOB_DROP`

### Models e responsabilidades

| Model | Responsabilidade |
|---|---|
| `User` | Conta de usuário e papel. |
| `GameClass` | Classes jogáveis e atributos base. |
| `GameMap` | Mapas do jogo por tier/faixa de nível. |
| `SubMap` | Subáreas de mapas usadas pelo auto-combate. |
| `SubMapEncounter` | Relação ponderada entre submapas e mobs. |
| `Character` | Personagem do usuário, status, XP, HP, avatar e vínculos. |
| `CharacterGatheringSkill` | Proficiências de gathering por origem e personagem. |
| `Mob` | Inimigos, atributos e XP. |
| `Item` | Equipamentos, materiais e consumíveis. |
| `CraftingRecipe` | Receita de criação por item de saída. |
| `CraftingIngredient` | Ingredientes de receitas. |
| `GatheringSession` | Sessões de gathering ativas/paradas/completas. |
| `InventoryItem` | Estoque de itens do personagem. |
| `Equipment` | Equipamentos atualmente equipados por slot. |
| `CharacterPotionConfig` | Configuração de poção automática. |
| `MobDrop` | Drops por mob. |
| `Combat` | Combate manual. |
| `CombatLog` | Logs de rounds de combate manual. |
| `AutoCombatSession` | Sessão idle de auto-combate. |
| `AutoCombatSessionLoot` | Loot acumulado da sessão. |
| `AutoCombatSessionMobSummary` | Resumo de kills/XP por mob. |
| `AutoCombatSessionEvent` | Eventos persistidos do auto-combate em tempo real. |

### Seeds

Arquivo seguro/modular:

```text
backend/prisma/seed.ts
```

Esse seed registra/atualiza dados-base e informa no próprio código que **não apaga usuários, personagens, inventário, equipamentos ou progresso**.

Comando:

```bash
cd backend
npm run prisma:seed
```

Arquivo destrutivo:

```text
backend/prisma/seed.reset.ts
```

Esse arquivo informa no próprio código que apaga personagens, inventário, equipamentos, sessões, configurações, mapas, mobs e itens, preservando usuários/login. Não há script dedicado no `package.json` para executá-lo.

### Migrations

Comando configurado:

```bash
cd backend
npm run prisma:migrate
```

Prisma Studio:

```bash
cd backend
npm run prisma:studio
```

## Autenticação e Autorização

### Estratégia

- Backend: JWT com `@nestjs/jwt`, `passport` e `passport-jwt`.
- Guard: `JwtAuthGuard` baseado em `AuthGuard('jwt')`.
- Estratégia: token extraído de `Authorization: Bearer <token>`.
- Senhas: hash com `bcrypt.hash(password, 10)`.

### Roles

O enum `UserRole` possui:

- `PLAYER`
- `ADMIN`

O schema define `PLAYER` como padrão.

Não foi identificado controller administrativo ou guard de autorização por role nos arquivos analisados.

### Rotas protegidas por JWT

Controllers com `@UseGuards(JwtAuthGuard)` identificado:

- `AuthController` em `GET /auth/me`.
- `CharactersController` completo.
- `CombatController` completo.
- `AutoCombatController` completo.
- `InventoryController` completo.
- `EquipmentController` completo.
- `ConsumablesController` completo.
- `InfirmaryController` completo.

### Rotas sem guard identificado no controller

Controllers sem `@UseGuards(JwtAuthGuard)` identificado:

- `GameClassesController`
- `MapsController`
- `MobsController`
- `ItemsController`
- `CraftingController`
- `GatheringController`

Não foi identificado guard global em `main.ts`. Caso essas rotas devam ser restritas, isso deve ser ajustado ou confirmado.

## Integrações Externas

Integrações confirmadas:

| Integração | Uso |
|---|---|
| PostgreSQL | Banco principal via Prisma. |
| Redis | Serviço local no Docker Compose e variáveis no `.env.example`; uso runtime específico não confirmado. |
| Socket.IO | Canal em tempo real para auto-combate. |
| API HTTP backend | Consumida pelo frontend via Axios. |

Não foram identificadas integrações com:

- serviços de e-mail;
- storage externo;
- gateway de pagamento;
- OAuth;
- webhooks externos;
- filas externas;
- serviços de observabilidade externos.

## Docker e Infraestrutura

Arquivo:

```text
infra/docker-compose.yml
```

Serviços:

| Serviço | Imagem | Porta local | Volume |
|---|---|---:|---|
| `postgres` | `postgres:16` | `5433` | `zumbi_postgres_data` |
| `redis` | `redis:7` | `6379` | `zumbi_redis_data` |

Subir containers:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Parar containers:

```bash
docker compose -f infra/docker-compose.yml down
```

Remover volumes:

```bash
docker compose -f infra/docker-compose.yml down -v
```

> O Compose contém credenciais locais de desenvolvimento para PostgreSQL. Não reutilize esses valores em produção. Configure credenciais reais via variáveis de ambiente seguras.

### Dockerfile

Não foi identificado `Dockerfile` para backend ou frontend.

## Testes

### Backend

Frameworks identificados:

- Jest.
- Supertest.
- `@nestjs/testing`.
- `ts-jest`.

Comandos:

```bash
cd backend
npm run test
npm run test:e2e
npm run test:cov
```

Testes identificados:

- `backend/src/app.controller.spec.ts`: testa retorno `Hello World!` do `AppController`.
- `backend/test/app.e2e-spec.ts`: teste e2e de `GET /` retornando `Hello World!`.
- `backend/src/prisma/prisma.service.spec.ts`: arquivo listado na estrutura do projeto; conteúdo não foi detalhado neste README.

### Frontend

Não foi identificado script de teste no `frontend/package.json`.

## Build e Deploy

### Backend

Build:

```bash
cd backend
npm run build
```

Execução em produção local:

```bash
npm run start:prod
```

### Frontend

Build:

```bash
cd frontend
npm run build
```

Preview do build:

```bash
npm run preview
```

### Deploy

Não foram identificados arquivos de deploy, como:

- Dockerfile de produção;
- GitHub Actions;
- configuração Vercel/Netlify/Render/Railway/Fly;
- Kubernetes;
- Nginx;
- PM2;
- Terraform.

A estratégia de deploy deve ser confirmada.

## Fluxo de Desenvolvimento

Fluxo local recomendado com base nos scripts existentes:

```bash
# 1. Clonar
git clone https://github.com/deadidlemmo/mmorpg-idle-zumbi.git
cd mmorpg-idle-zumbi

# 2. Subir infraestrutura
docker compose -f infra/docker-compose.yml up -d

# 3. Preparar backend
cd backend
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

Em outro terminal:

```bash
# 4. Preparar frontend
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Antes de abrir PR ou integrar mudanças:

```bash
cd backend
npm run lint
npm run test
npm run test:e2e
npm run build

cd ../frontend
npm run lint
npm run build
```

## Troubleshooting

### Backend não conecta ao banco

Verifique `DATABASE_URL` no `backend/.env`.

Se estiver usando Docker Compose, a porta local do PostgreSQL é `5433`:

```env
DATABASE_URL="postgresql://<usuario>:<senha>@localhost:5433/mmorpg_zumbi?schema=public"
```

### Prisma não encontra schema ou client

Execute:

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
```

### API retorna 401

Verifique:

- se o token foi enviado como `Authorization: Bearer <token>`;
- se `JWT_SECRET` está configurado no backend;
- se o frontend aponta para a API correta em `VITE_API_URL`;
- se o token salvo em `localStorage` não expirou.

### Socket.IO não conecta

Verifique:

- `VITE_API_URL` e `VITE_SOCKET_URL`;
- se o backend está rodando;
- se o namespace `/auto-combat` está acessível;
- se o token está sendo enviado no handshake;
- CORS e credenciais.

### Página de criação de personagem não abre

Existe `CharacterCreatePage.tsx`, e o código navega para `/characters/new`, mas essa rota não está registrada em `frontend/src/app/routes.tsx`. Registre a rota se a tela deve estar disponível.

### Gathering ou crafting acessíveis sem JWT

`GatheringController` e `CraftingController` não têm `@UseGuards(JwtAuthGuard)` identificado no controller. Confirme se isso é intencional ou se essas rotas devem ser protegidas.

### Alterações no `.env.local` do frontend não aparecem

Reinicie o Vite:

```bash
npm run dev
```

### Porta 5433 em uso

Altere o mapeamento no `infra/docker-compose.yml` ou pare o serviço que está usando a porta.

## Segurança

Recomendações diretamente relacionadas ao projeto:

- Não versionar arquivos `.env` reais.
- Usar `JWT_SECRET` forte em produção.
- Não reutilizar credenciais locais do Docker Compose em produção.
- Restringir CORS em produção; o backend atualmente usa `origin: true`.
- Confirmar se `CraftingController` e `GatheringController` devem exigir JWT.
- Implementar autorização por role se `ADMIN` for usado no futuro.
- Validar se `JWT_EXPIRES_IN` deve ser lido do ambiente em vez de ficar fixo em `AuthModule`.
- Garantir que tokens não sejam expostos em logs, URLs ou mensagens de erro.
- Revisar persistência de token em `localStorage` conforme o nível de risco aceito.
- Não expor URLs, senhas ou chaves reais em documentação ou issues.

## Contribuição

Não foi identificado guia formal de contribuição no repositório.

Fluxo sugerido:

```bash
git checkout -b feature/nome-da-feature
```

Antes de abrir pull request:

```bash
cd backend
npm run lint
npm run test
npm run test:e2e
npm run build

cd ../frontend
npm run lint
npm run build
```

Inclua no PR:

- objetivo da mudança;
- módulos alterados;
- endpoints impactados;
- migrations, se houver;
- variáveis de ambiente novas, se houver;
- evidências de teste manual ou automatizado;
- riscos conhecidos.

## Licença

Não foi identificado arquivo `LICENSE` no repositório.

O `backend/package.json` declara:

```json
"license": "UNLICENSED"
```

Portanto, no nível do repositório, nenhuma licença pública foi identificada.

## A Confirmar

- Owner/nome final do repositório caso o remoto local use namespace diferente de `deadidlemmo/mmorpg-idle-zumbi`.
- Versão mínima oficial de Node.js.
- Estratégia de deploy em produção.
- URL de produção do frontend e backend.
- Banco usado em produção.
- Se Redis é usado em runtime ou está apenas preparado como dependência/infraestrutura.
- Se `JWT_EXPIRES_IN` deve ser usado pelo código; atualmente `AuthModule` define `expiresIn: '7d'` fixo.
- Se `GatheringController` e `CraftingController` devem ser protegidos por JWT.
- Se `GameClasses`, `Maps`, `Mobs` e `Items` devem ser públicos ou protegidos.
- Registro da rota `/characters/new` no frontend.
- Existência de pipeline CI/CD.
- Estratégia de logs, observabilidade e monitoramento.
- Cobertura de testes esperada.
- Estratégia de autorização para `ADMIN`.
- Se o arquivo `backend/prisma/seed.reset.ts` deve ter script próprio ou permanecer execução manual.
- Se `VITE_SOCKET_URL` deve ser incluída oficialmente no `frontend/.env.example`.
- Se o frontend deve validar sessão inicial chamando `/auth/me`.

## Observações Técnicas

- Substituir os READMEs padrão em `frontend/README.md` e `backend/README.md` por documentação específica ou apontar para o README raiz.
- Adicionar rota para `CharacterCreatePage` se a criação de personagem deve estar disponível pela SPA.
- Atualizar `frontend/.env.example` com `VITE_SOCKET_URL`, já que o código lê essa variável.
- Alinhar `backend/.env.example` com a porta do PostgreSQL exposta pelo Docker Compose (`5433`) ou documentar explicitamente a diferença.
- Avaliar leitura de `JWT_EXPIRES_IN` no `AuthModule` em vez de manter expiração fixa.
- Adicionar `engines` ou `.nvmrc` para padronizar ambiente Node.js.
- Adicionar Dockerfile para backend/frontend caso o deploy seja containerizado.
- Adicionar documentação OpenAPI/Swagger para os endpoints.
- Revisar autenticação de `gathering` e `crafting` se forem operações sensíveis por personagem.
- Criar testes de domínio para serviços críticos: autenticação, personagens, auto-combate, gathering, crafting e consumíveis.
- Adicionar testes frontend ou ao menos scripts oficiais se houver estratégia de teste de UI.
- Criar CI para lint, testes e build.
- Formalizar licença do repositório.
