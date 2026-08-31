# Recompensa de voto no TopIdle

O Dead Idle concede 1 dia de Premium por voto válido, limitado a uma
recompensa por conta a cada 24 horas. O voto continua sendo validado pelo
TopIdle; o backend do jogo apenas identifica a conta e entrega o benefício.

## Fluxo do jogador

1. O jogador entra no Dead Idle e abre `Premium`.
2. O jogo solicita `GET /topidle/reward` com o JWT da conta.
3. O backend devolve um link do TopIdle com um código público aleatório.
4. O jogador autoriza o voto no TopIdle.
5. O TopIdle envia o evento assinado ao webhook oficial.
6. O backend registra o `eventId` e soma 24 horas em `users.premiumUntil`.

O jogador não precisa manter o jogo aberto depois de abrir o TopIdle. O login
no Dead Idle é necessário para obter o link correto da conta; o login Google ou
Discord usado no TopIdle não precisa ter o mesmo e-mail do jogo.

## Configuração

No painel do TopIdle, use:

- Webhook: `https://deadidle.pages.dev/webhooks/topidle`
- Identificador solicitado: `Código da conta Dead Idle`

A rota no Pages preserva o corpo e os cabeçalhos e encaminha a requisição para
`https://deadidle-api.botpokeidle.com.br/webhooks/topidle`.

Guarde as credenciais geradas somente em `backend/.env`. A chave fica reservada
para recuperação pela API; a assinatura do webhook usa o segredo:

```env
TOPIDLE_API_KEY="chave_gerada_no_topidle"
TOPIDLE_WEBHOOK_SECRET="segredo_gerado_no_topidle"
TOPIDLE_REWARDS_ENABLED="false"
```

No Windows, execute `ops/windows/Configure-TopIdleCredentials.ps1` para inserir
os dois valores em uma janela local com campos mascarados.

Não use variáveis `VITE_*` para essas credenciais.

## Homologação e ativação

1. Publique backend, migration e Pages Function com recompensas desativadas.
2. Informe o webhook e o nome do identificador no painel do TopIdle.
3. Gere as credenciais e salve o segredo no backend.
4. Reinicie o backend mantendo `TOPIDLE_REWARDS_ENABLED=false`.
5. Use `Enviar teste` no TopIdle e confirme um evento `DISABLED` no banco.
6. Defina `TOPIDLE_REWARDS_ENABLED=true` e reinicie o backend.
7. Faça um voto controlado com o código de uma conta de teste.
8. Repita o mesmo `eventId` e confirme que o Premium não é entregue novamente.

O botão de voto só aparece no jogo quando o segredo existe e
`TOPIDLE_REWARDS_ENABLED=true`.

## Proteções aplicadas

- HMAC SHA-256 calculado sobre timestamp, ponto e corpo bruto.
- Timestamp aceito por no máximo 5 minutos.
- Comparação de assinatura em tempo constante.
- `eventId`, `X-TopIdle-Vote-Id` e `Idempotency-Key` devem coincidir.
- `eventId` possui índice único no PostgreSQL.
- Conta bloqueada durante a extensão do Premium para evitar sobrescrita.
- Limite próprio de uma recompensa a cada 24 horas por conta.
- Identificador armazenado somente como hash no histórico.
