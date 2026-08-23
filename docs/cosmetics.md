# Cosméticos de personagem

O sistema de cosméticos separa assinatura Premium de propriedade permanente.
O backend e o banco são a fonte da verdade para desbloqueios e aparência pública.

## Slots disponíveis

- `AVATAR`: retrato alternativo, opcionalmente restrito a uma classe.
- `AVATAR_FRAME`: moldura do avatar.
- `PROFILE_BANNER`: fundo do cartão de identidade.
- `OVERVIEW_BACKGROUND`: cenário da página de visão geral.
- `PROFILE_EFFECT`: animação visual predefinida.
- `TITLE`: título público abaixo do nome.
- `BADGE`: distintivo curto exibido junto à classe.

O frontend resolve `assetKey` e `effectPreset` por listas locais permitidas. O
banco não fornece URL, CSS ou código arbitrário.

## Formas de acesso

- `FREE`: disponível para todos os jogadores.
- `PREMIUM`: disponível enquanto `User.premiumUntil` estiver ativo.
- `ENTITLEMENT`: exige um registro ativo em `UserCosmeticEntitlement`.

Um direito explícito também pode liberar um item Premium permanentemente. Isso
permite vender um cosmético originalmente incluído na assinatura sem duplicar o
catálogo.

Quando o Premium expira, a seleção permanece salva, mas o perfil usa o visual
base. Se a assinatura for renovada, o visual selecionado volta automaticamente.
Itens de pacote continuam ativos enquanto o respectivo direito não estiver
expirado ou revogado.

## Endpoints

Jogador autenticado:

- `GET /cosmetics/characters/:characterId`
- `PATCH /cosmetics/characters/:characterId/appearance`
- `GET /social/characters/:characterId/profile`
- `GET /storefront/characters/:characterId`
- `POST /storefront/checkout` (contrato reservado; cobrança desativada)

Administrador:

- `GET /admin/cosmetics/users/:userId`
- `POST /admin/cosmetics/grant`
- `POST /admin/cosmetics/revoke`

O grant aceita exatamente uma `collectionKey` ou `cosmeticKey`. A chave de
concessão é idempotente por usuário, cosmético, origem e referência externa.
Use `sourceReference` para o identificador do pagamento, pacote ou evento; assim
um webhook repetido não cria direitos duplicados.

## Fluxo comercial futuro

1. O provedor confirma o pagamento por webhook autenticado.
2. O backend valida valor, produto, estado e idempotência do evento.
3. O produto comercial é traduzido para uma coleção ou cosmético.
4. O backend cria os direitos com `source` e `sourceReference`.
5. Cancelamento ou estorno revoga somente os direitos associados ao pagamento.

O painel administrativo concede e revoga direitos para suporte e testes. Ele não
substitui a validação de webhook do futuro provedor de pagamento.

## Catálogo inicial

O seed registra:

- `premium-ultimo-abrigo`: oito avatares por classe, moldura, banner, fundo,
  efeito, título e distintivo da assinatura Premium.
- `premium-nucleo-helix`: pacote permanente com oito avatares lendários por
  classe, moldura orbital, banner, fundo, efeito, título e distintivo.
- `premium-protocolo-carmesim`: pacote permanente com oito avatares lendários
  por classe, moldura blindada, banner, fundo, efeito, título e distintivo.

`fundadores-alpha` e `temporada-01-quarentena` foram aposentados. O seed apenas
os marca como inativos para preservar histórico e direitos antigos, sem
exibi-los no catálogo atual.

## Matriz de avatares

Cada combinação de coleção e classe deve conter oito retratos: quatro de
apresentação masculina e quatro de apresentação feminina. Cada grupo cobre as
representações `WHITE`, `JAPANESE`, `BLACK` e `OTHER`. O campo
`representationLabel` documenta internamente a escolha usada em `OTHER`; essas
categorias não são exibidas como rótulos de etnia para jogadores.

Os retratos precisam ser WebP de `1024x1024`, com fundo transparente real e
silhueta legível em miniatura. O frontend inclui automaticamente arquivos
`avatar-*.webp` nas pastas de coleção. As verificações obrigatórias são:

```bash
cd backend && npm run cosmetics:audit:avatars
cd frontend && npm run images:audit:cosmetic-avatars
```
