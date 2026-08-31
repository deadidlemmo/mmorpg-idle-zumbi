# Pagamentos e loja

Mercado Pago e Stripe usam checkout hospedado. O navegador escolhe apenas a
oferta e o provedor; preço, moeda, duração e conteúdo são resolvidos no backend.
Nenhum segredo ou valor confiável usa variável `VITE_*`.

## Catálogo inicial

| Oferta | Tipo | Preço | Entrega confirmada por webhook |
| --- | --- | ---: | --- |
| Premium do Abrigo | Assinatura mensal | R$ 19,90 | 30 dias de Premium na conta |
| Passe Premium de 30 dias | Item | R$ 19,90 | 1 item na mochila |
| Núcleo Helix | Pacote permanente | R$ 19,90 | Cosméticos em Aparência |
| Protocolo Carmesim | Pacote permanente | R$ 19,90 | Cosméticos em Aparência |
| 100 Cash | Recarga | R$ 9,90 | 100 Cash no personagem |
| 200 Cash | Recarga | R$ 17,90 | 200 Cash no personagem |
| 500 Cash | Recarga | R$ 19,90 | 500 Cash no personagem |

O Passe Premium é negociável no Mercado do Abrigo, não pode ser vendido ao NPC
e adiciona 30 dias ao prazo já ativo quando usado pela mochila. A assinatura é
da conta e se renova pelo provedor. Os pacotes criam direitos permanentes para
os cosméticos, que passam a aparecer na página Aparência.

## Segurança e idempotência

- `StorefrontOrder` persiste a intenção antes de abrir o checkout.
- `requestId` impede que duplo clique crie duas intenções para a mesma compra.
- O valor confirmado precisa coincidir exatamente com o pedido em BRL.
- A assinatura de cada webhook é validada antes de consultar ou alterar dados.
- `StorefrontPayment` é único por provedor e pagamento.
- `fulfillmentAppliedAt` impede entrega duplicada quando o webhook é reenviado.
- Entrega e registro econômico ocorrem na mesma transação serializável.
- Reembolso ou chargeback coloca o pedido em revisão; a implementação não remove
  automaticamente itens já negociados nem cosméticos sem análise de suporte.

## Endpoints

Autenticados:

- `GET /storefront/characters/:characterId`
- `POST /storefront/checkout`
- `GET /storefront/orders/:orderId`

Públicos, mas obrigatoriamente assinados:

- `POST /storefront/webhooks/mercado-pago`
- `POST /storefront/webhooks/stripe`

Para a infraestrutura atual, configure os webhooks de produção como:

```text
https://deadidle-api.botpokeidle.com.br/storefront/webhooks/mercado-pago
https://deadidle-api.botpokeidle.com.br/storefront/webhooks/stripe
```

## Variáveis do backend

```env
FRONTEND_URL="https://deadidle.pages.dev"
PUBLIC_API_URL="https://deadidle-api.botpokeidle.com.br"

MERCADO_PAGO_ACCESS_TOKEN=""
MERCADO_PAGO_WEBHOOK_SECRET=""

STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
```

Um provedor só aparece como disponível quando as duas URLs e os dois segredos
dele estão preenchidos. O checkout continua desativado de forma segura enquanto
essa configuração estiver incompleta.

## Mercado Pago

Use a mesma conta vendedora se desejar, mas crie uma aplicação **Dead Idle**.
Não reutilize a aplicação **Bot Poke Idle**: aplicações separadas isolam
credenciais, webhooks, métricas, testes e uma eventual rotação de segredo.

Na aplicação Dead Idle:

1. Gere credenciais de teste e mantenha as credenciais de produção desativadas.
2. Configure a URL pública do webhook.
3. Ative os tópicos `payment` e `subscription_preapproval`.
4. Copie o Access Token e a assinatura secreta para o backend.
5. Use contas de teste distintas para vendedor e comprador.

Compras únicas usam Checkout Pro. A assinatura usa PreApproval mensal. O evento
`payment` é o único que concede Premium, item, Cash ou pacote; o evento de
preapproval apenas sincroniza o estado da assinatura.

## Stripe

Use primeiro as chaves do modo de teste. No endpoint de webhook, selecione:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copie `sk_test_*` para `STRIPE_SECRET_KEY` e o segredo `whsec_*` do endpoint
para `STRIPE_WEBHOOK_SECRET`. Na produção, troque ambos pelas credenciais live.

## Roteiro de homologação

1. Faça backup e aplique a migration de pagamentos.
2. Rode o seed para garantir o Passe Premium no catálogo de itens.
3. Configure somente credenciais de teste e os dois webhooks HTTPS.
4. Compre cada oferta uma vez e aguarde `FULFILLED` na página da loja.
5. Confirme a assinatura em `User.premiumUntil`.
6. Confirme o Passe Premium na mochila e ative exatamente uma unidade.
7. Confirme Helix e Carmesim na página Aparência.
8. Reenvie cada webhook no painel e confirme que nada é entregue duas vezes.
9. Teste pagamento recusado, expirado e assinatura cancelada.
10. Só depois repita o roteiro com uma compra real de baixo risco em produção.

Os testes automatizados usam eventos assinados sintéticos e não criam cobrança
real. A homologação ponta a ponta depende das credenciais de teste e dos
webhooks públicos da nova aplicação Dead Idle.
