# Backend local permanente no Windows

Estes scripts mantem o backend local e o tunel publico do DeadIdle ativos apos o login no Windows.

Endpoint publico estavel:

```text
https://deadidle-api.botpokeidle.com.br
```

Instalacao ou atualizacao das tarefas:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\windows\Install-DeadIdleStartupTasks.ps1
```

Tarefas criadas:

- `DeadIdle-Backend`: inicia Docker Desktop quando necessario, garante PostgreSQL e Redis e reinicia o backend compilado se ele cair.
- `DeadIdle-Tunnel`: monitora o endpoint publico e reinicia o tunel nomeado `deadidle-local-api` se o conector cair.

Os logs ficam em `%LOCALAPPDATA%\DeadIdle\logs` e nao sao versionados. Para consultar o estado:

```powershell
Get-ScheduledTask -TaskName DeadIdle-Backend, DeadIdle-Tunnel
Get-ScheduledTaskInfo -TaskName DeadIdle-Backend
Get-ScheduledTaskInfo -TaskName DeadIdle-Tunnel
```

Esse arranjo nao substitui uma hospedagem de backend. O jogo fica acessivel enquanto o computador estiver ligado, o usuario estiver logado, a internet estiver disponivel e o Windows nao estiver suspenso.
