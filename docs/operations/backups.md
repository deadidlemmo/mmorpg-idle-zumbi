# Backups do banco

O backup oficial usa o formato custom do PostgreSQL, checksum SHA-256 e um teste de restauracao em banco temporario.

## Criar

Com `DATABASE_URL` configurada e os binarios do PostgreSQL no `PATH`:

```bash
cd backend
npm run backup:database -- --output=backups/dead-idle.dump
```

O comando cria o `.dump` e o manifesto `.sha256.json`. Armazene ambos fora da maquina da aplicacao, com criptografia, controle de acesso e politica de retencao.

## Verificar restauracao

O usuario da URL precisa poder criar e remover um banco temporario:

```bash
cd backend
npm run backup:verify -- --backup=backups/dead-idle.dump
```

A verificacao confere o checksum, restaura em um banco isolado, consulta
`_prisma_migrations`, valida as tabelas da aplicacao e confirma que os itens
canonicos foram restaurados. Ao final, remove o banco temporario. A CI executa
esse fluxo sobre PostgreSQL descartavel e previamente semeado.

## Restaurar em um destino

O restore exige URL de destino explícita e confirmação. Por padrão, o nome do
banco deve começar com `dead_idle_restore_`:

```bash
cd backend
npm run backup:restore -- --backup=backups/dead-idle.dump --target-url=postgresql://usuario:senha@host:5432/dead_idle_restore_20260821 --confirm=RESTORE
```

Se o destino já existir, acrescente `--recreate`. O comando recusa o banco de
`DATABASE_URL`, verifica manifesto, tamanho e SHA-256 antes de criar o destino,
e valida migrations e itens canônicos depois do `pg_restore`. Um destino com
outro nome exige também `--allow-non-isolated-target`; use essa opção somente
no procedimento de recuperação aprovado.

Os comandos gravam `backups/status.json` (ou `BACKUP_STATUS_PATH`). O painel
administrativo, `/health` e `/metrics` usam esse registro para detectar falha e
expiração do backup ou do teste de restauração.

## Operacao

- Produzir backup diario e antes de migrations.
- Manter copias em regioes e credenciais distintas da aplicacao.
- Alertar quando o job, upload ou teste de restauracao falhar.
- Executar um teste agendado de restauracao com os mesmos binarios da producao.
- Nunca validar restauracao sobre o banco principal.
