# Pagamentos e loja

A loja atual possui somente três ofertas comerciais:

- `premium-abrigo-monthly`: assinatura Premium com a coleção Último Abrigo.
- `pacote-nucleo-helix`: pacote cosmético permanente.
- `pacote-protocolo-carmesim`: pacote cosmético permanente.

Os preços ainda não foram definidos e nenhuma cobrança está habilitada. O
frontend não envia valor, moeda, coleção ou duração escolhidos pelo cliente; o
backend deve continuar sendo a fonte da verdade para esses dados.

## Direção comercial da loja

- Cash será vendido avulso por dinheiro real e creditado no saldo da conta. O
  saldo não será negociável.
- Premium terá assinatura vinculada à conta e uma versão em item. Somente o
  item poderá ser listado no Market ou transferido por trade.
- Avatares, backgrounds, efeitos e molduras poderão ser comprados com Cash.
- Aceleradores serão entregues como itens de inventário e poderão ser
  negociáveis quando o catálogo marcar o item dessa forma.
- Passes e pacotes ocuparão uma categoria própria da loja.

Market e trade ainda não estão implementados. O Market precisará persistir o
item anunciado, quantidade, preço definido pelo vendedor, comprador, estado e
liquidação atômica. O trade precisará bloquear os itens oferecidos e concluir a
troca somente após a confirmação atual de ambos os jogadores.

## Contrato atual

- `GET /storefront/characters/:characterId` retorna ofertas, propriedade,
  status Premium e provedores planejados.
- `POST /storefront/checkout` valida autenticação, personagem, oferta e provedor,
  mas retorna `503 CHECKOUT_NOT_CONFIGURED` sem criar cobrança.

O frontend já aceita uma futura resposta com `checkoutId`, `checkoutUrl` e
`expiresAt`. Ele só habilita compra quando o catálogo informar que o checkout e
o provedor selecionado estão disponíveis.

## Antes de habilitar Mercado Pago ou Stripe

1. Definir preços em centavos e moeda no backend.
2. Criar uma entidade persistida de pedido com usuário, oferta, provedor, valor,
   moeda, status e chave de idempotência.
3. Implementar adaptadores separados para Mercado Pago e Stripe.
4. Criar checkout somente no backend e usar chave de idempotência no provedor.
5. Validar assinatura e origem dos webhooks antes de alterar qualquer direito.
6. Confirmar produto, valor e moeda recebidos contra o catálogo do servidor.
7. Ativar Premium ou conceder a coleção somente após pagamento confirmado.
8. Tratar repetição de webhook, expiração, cancelamento, estorno e reembolso.
9. Registrar eventos financeiros em auditoria sem armazenar dados sensíveis de
   cartão ou segredos do provedor.
10. Cobrir checkout, webhook e reconciliação com testes de integração.

Credenciais secretas nunca devem usar variáveis `VITE_*` nem chegar ao browser.
Elas devem ficar exclusivamente no backend/ambiente de produção.
