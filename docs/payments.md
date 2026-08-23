# Pagamentos e loja

A loja atual possui somente três ofertas comerciais:

- `premium-abrigo-monthly`: assinatura Premium com a coleção Último Abrigo.
- `pacote-nucleo-helix`: pacote cosmético permanente.
- `pacote-protocolo-carmesim`: pacote cosmético permanente.

Os preços ainda não foram definidos e nenhuma cobrança está habilitada. O
frontend não envia valor, moeda, coleção ou duração escolhidos pelo cliente; o
backend deve continuar sendo a fonte da verdade para esses dados.

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
