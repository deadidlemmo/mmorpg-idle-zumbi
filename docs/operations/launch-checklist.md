# Checklist de lancamento

## Configuracao obrigatoria

- `DATABASE_URL` aponta para PostgreSQL com TLS e credencial exclusiva.
- `JWT_SECRET` e `METRICS_TOKEN` sao segredos longos e distintos.
- `FRONTEND_URL` e `CORS_ALLOWED_ORIGINS` contem apenas origens oficiais.
- `TRUST_PROXY_HOPS` corresponde exatamente ao numero de proxies reversos.
- SMTP esta configurado e o link de recuperacao chega ao ambiente oficial.
- `REDIS_COORDINATION_ENABLED`, `SOCKET_REDIS_ADAPTER_ENABLED` e
  `REDIS_REQUIRED` estao como `true` quando houver mais de uma instancia.
- `WORLD_BOSS_TEST_UNLOCK_ENABLED` e `PASSWORD_RESET_EXPOSE_TOKEN` estao como
  `false`.

## Ordem de publicacao

1. Criar e verificar um backup antes da migration.
2. Executar `npx prisma migrate deploy`.
3. Executar `npm run prisma:seed` para atualizar dados canonicos.
4. Publicar o backend e aguardar `GET /health/ready` retornar HTTP 200.
5. Publicar o frontend e testar login, recuperacao, atividades e reconnect.
6. Consultar `GET /metrics` com `Authorization: Bearer <METRICS_TOKEN>`.

## Gates obrigatorios

- CI verde em lint, testes, builds, migrations, seed, economia, imagens e restore.
- Nenhuma vulnerabilidade alta nas dependencias de producao.
- Alertas de 5xx, latencia, memoria, disponibilidade e falha de backup entregues
  ao canal operacional escolhido.
- Restauracao testada com a mesma versao principal do PostgreSQL da producao.
- Termos e Politica de Privacidade revisados por responsavel juridico antes da
  abertura publica.
- Premium comercial permanece indisponivel ate haver provedor, webhook
  autenticado, idempotencia, reembolso e conciliacao definidos.
- Conteudo T6-T10 permanece fora do cap jogavel ate receitas, artes, economia e
  progressao serem aprovadas como um pacote completo.
