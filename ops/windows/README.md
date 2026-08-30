# Operacao local do DeadIdle no Windows

Estes scripts supervisionam o backend local, o tunel publico, os backups e o
processo de release do DeadIdle.

Endpoint publico estavel:

```text
https://deadidle-api.botpokeidle.com.br
```

## Instalacao

Abra o PowerShell como administrador e execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\windows\Install-DeadIdleStartupTasks.ps1
```

No modo administrativo, backend e tunel rodam como `SYSTEM`, com gatilhos no
boot e no login. O instalador tambem torna o Docker Desktop Service automatico,
instala uma copia privada do `cloudflared` e protege o token do tunel em
`%ProgramData%\DeadIdle\secrets`.

Se a elevacao administrativa ainda nao puder ser autorizada, use a contingencia:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\windows\Install-DeadIdleStartupTasks.ps1 -AllowLogonFallback
```

Essa contingencia so inicia backend e tunel depois do login do usuario.

Tarefas registradas:

- `DeadIdle-Backend`: garante Docker Compose e reinicia o backend quando ele cai.
- `DeadIdle-Tunnel`: monitora o endpoint publico e reinicia o tunel nomeado.
- `DeadIdle-Backup`: executa a cada duas horas.
- `DeadIdle-Restore-Drill`: restaura o ultimo dump em banco isolado aos domingos.

## Backups

Cada ciclo cria um dump custom do PostgreSQL, calcula SHA-256, envia copias para
o bucket privado `deadidle-backups` e baixa o snapshot horario para comparar o
checksum. O R2 usa TLS em transito e criptografia gerenciada em repouso.

Retencao configurada no R2:

- snapshots de duas horas: 7 dias;
- snapshots diarios: 45 dias;
- snapshots semanais: 365 dias.

Os dumps automaticos locais ficam por 72 horas. Dumps manuais com outros nomes
nao sao removidos pela rotina de retencao.

Execucao manual:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\windows\Invoke-DeadIdleBackup.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\windows\Invoke-DeadIdleRestoreDrill.ps1
```

O endpoint `/health` abre e recalcula tamanho e SHA-256 do arquivo real apontado
pelo manifesto. `status.json` sozinho nao basta para declarar o backup saudavel.

## Release

O release exige working tree limpo e executa backup local/externo, migrations,
auditorias, lint, testes, builds, reinicio, health checks local/publico e deploy
do frontend no Cloudflare Pages:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\windows\Release-DeadIdle.ps1
```

Use `-SkipTests` ou `-SkipPagesDeploy` somente em contingencias conscientes. O
script nunca restaura automaticamente o banco apos uma migration; uma reversao
desse tipo deve ser decidida com base no dump criado no inicio do release.

## Diagnostico

```powershell
Get-ScheduledTask -TaskName DeadIdle-Backend, DeadIdle-Tunnel, DeadIdle-Backup, DeadIdle-Restore-Drill
Get-ScheduledTaskInfo -TaskName DeadIdle-Backup
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod https://deadidle-api.botpokeidle.com.br/health
```

Logs ficam em `%ProgramData%\DeadIdle\logs` no modo `SYSTEM` e em
`%LOCALAPPDATA%\DeadIdle\logs` no modo de contingencia.

Esse arranjo ainda depende do computador ligado, da internet e do Docker
Desktop. Ele reduz quedas locais, mas nao substitui um servidor dedicado.
