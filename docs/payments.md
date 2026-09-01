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
| Cash sob medida | Recarga de 1 a 1.000 | R$ 1,00 por Cash | Quantidade escolhida no personagem |
| Pacote R$ 25 | Recarga pronta | R$ 25,00 | 25 Cash no personagem |
| Pacote R$ 50 | Recarga com 10% de bônus | R$ 50,00 | 55 Cash no personagem |
| Pacote R$ 100 | Recarga com 15% de bônus | R$ 100,00 | 115 Cash no personagem |
| Pacote R$ 200 | Recarga com 20% de bônus | R$ 200,00 | 240 Cash no personagem |

O Passe Premium é negociável no Mercado do Abrigo, não pode ser vendido ao NPC
e adiciona 30 dias ao prazo já ativo quando usado pela mochila. A assinatura é
da conta e se renova pelo provedor. Os pacotes criam direitos permanentes para
os cosméticos, que passam a aparecer na página Aparência.

Na recarga sob medida, o frontend envia apenas a quantidade desejada. O backend
aceita de 1 a 1.000 Cash por pedido, calcula R$ 1,00 por unidade e persiste a
quantidade da recompensa antes de abrir o checkout. Nos pacotes prontos, preço,
quantidade total e bônus também ficam congelados no pedido antes de abrir o
provedor.

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
MERCADO_PAGO_CHECKOUT_ENABLED="false"

STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_CHECKOUT_ENABLED="false"
```

Um provedor só aparece como disponível quando as duas URLs, os dois segredos e
a respectiva chave `*_CHECKOUT_ENABLED=true` estiverem configurados. O webhook
continua aceitando pagamentos anteriores assinados mesmo com o checkout
desativado.

## Mercado Pago

Use a mesma conta vendedora se desejar, mas crie uma aplicação **Dead Idle**.
Não reutilize a aplicação **Bot Poke Idle**: aplicações separadas isolam
credenciais, webhooks, métricas, testes e uma eventual rotação de segredo.

Na aplicação Dead Idle:

1. Gere credenciais de teste e mantenha as credenciais de produção desativadas.
2. Configure a URL pública do webhook.
3. Ative os tópicos `payment`, `subscription_preapproval` e
   `subscription_authorized_payment`.
4. Copie o Access Token e a assinatura secreta para o backend.
5. Use contas de teste distintas para vendedor e comprador.

Compras únicas usam Checkout Pro. A assinatura usa PreApproval mensal. O evento
`payment` é o único que concede Premium, item, Cash ou pacote; o evento de
preapproval apenas sincroniza o estado da assinatura.

No Windows, grave as credenciais sem expô-las no terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\windows\Configure-DeadIdlePayments.ps1 -Provider MercadoPago
```

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

Para configurar produção exigindo explicitamente uma chave LIVE:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\windows\Configure-DeadIdlePayments.ps1 -Provider Stripe -RequiredMode Live
```

No Windows, use o mesmo assistente para a Stripe:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\windows\Configure-DeadIdlePayments.ps1 -Provider Stripe
```

## Roteiro de homologação

1. Faça backup e aplique a migration de pagamentos.
2. Rode o seed para garantir o Passe Premium no catálogo de itens.
3. Configure somente credenciais de teste e os dois webhooks HTTPS.
4. Compre cada oferta uma vez e aguarde `FULFILLED` na página da loja.
5. Teste recargas personalizadas de 1 e 27 Cash e os limites inválidos.
6. Confirme a assinatura em `User.premiumUntil`.
7. Confirme o Passe Premium na mochila e ative exatamente uma unidade.
8. Confirme Helix e Carmesim na página Aparência.
9. Reenvie cada webhook no painel e confirme que nada é entregue duas vezes.
10. Teste pagamento recusado, expirado e assinatura cancelada.
11. Só depois repita o roteiro com uma compra real de baixo risco em produção.

Os testes automatizados usam eventos assinados sintéticos e não criam cobrança
real. A homologação ponta a ponta depende das credenciais de teste e dos
webhooks públicos da nova aplicação Dead Idle.
