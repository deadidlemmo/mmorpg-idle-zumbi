# Checklist de lancamento

## Configuracao obrigatoria

- `DATABASE_URL` aponta para PostgreSQL com TLS e credencial exclusiva.
- `JWT_SECRET` e `METRICS_TOKEN` sao segredos longos e distintos.
- `ALERT_WEBHOOK_URL` entrega alertas no canal operacional e, quando usado,
  `ALERT_WEBHOOK_TOKEN` autentica a chamada.
- `ALERT_MAX_REQUEST_DURATION_MS` representa a latencia maxima tolerada antes
  de disparar um alerta.
- `BACKUP_STATUS_PATH`, `BACKUP_MAX_AGE_HOURS` e
  `BACKUP_VERIFICATION_MAX_AGE_HOURS` refletem o agendamento real.
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
5. Publicar o frontend e executar `npm run test:browser:e2e` para validar token
   expirado, F5, reconnect e tutorial.
6. Consultar `GET /metrics` com `Authorization: Bearer <METRICS_TOKEN>`.
7. No painel administrativo, registrar a linha de base de pelo menos 15 minutos
   para p50/p95/p99 HTTP, ticks e locks do auto-combate, atraso dos eventos,
   fila do cliente e duracao visual. Comparar novas versoes contra essa base.

## Coleta limpa do auto-combate

1. Abra `Operacao do jogo > Auto-combate` e clique em
   `Iniciar coleta limpa`. O painel deve exibir um novo identificador e o tempo
   decorrido da captura.
2. Execute apenas um cenario por captura: `combat-page`, `other-page`,
   `tab-hidden` ou `reconnected`. Inicie outra coleta antes de trocar o cenario.
3. Para `tab-hidden`, deixe a aba oculta e volte para ela. Confirme a duracao
   oculta, a reconciliacao e as medidas visuais marcadas como pos-retorno.
4. Confira separadamente eventos duplicados, suprimidos, reconciliados,
   lacunas candidatas e lacunas reais. Lacuna candidata nao deve ser tratada
   como perda confirmada antes da reconciliacao.
5. A cobertura de atraso de emissao e de transito deve comparar amostras
   elegiveis e registradas desde o inicio da captura. Os percentis continuam
   usando uma janela movel de 15 minutos.
6. Se houver erro `5xx`, registre a rota normalizada, status, duracao e horario
   mostrados no painel.

O botao chama `POST /admin/operations/auto-combat/capture`. Ele cria uma nova
linha de base logica para o painel, mas nao zera os contadores monotonicamente
crescentes expostos em `GET /metrics`.

## Gates obrigatorios

- CI verde em lint, testes, builds, migrations, seed,
  `npm run launch:audit:t1-t5`, Playwright e restore drill.
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
