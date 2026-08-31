[CmdletBinding()]
param(
    [switch]$AllowLogonFallback
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$frontendRoot = Join-Path $repoRoot 'frontend'
$dockerScript = Join-Path $PSScriptRoot 'Start-DeadIdleDocker.ps1'
$backendScript = Join-Path $PSScriptRoot 'Start-DeadIdleBackend.ps1'
$tunnelScript = Join-Path $PSScriptRoot 'Start-DeadIdleTunnel.ps1'
$backupScript = Join-Path $PSScriptRoot 'Invoke-DeadIdleBackup.ps1'
$restoreDrillScript = Join-Path $PSScriptRoot 'Invoke-DeadIdleRestoreDrill.ps1'
$powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
$currentUser = $identity.Name
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
$isAdministrator = $principal.IsInRole(
    [System.Security.Principal.WindowsBuiltInRole]::Administrator
)

$missingFiles = @(
    $dockerScript,
    $backendScript,
    $tunnelScript,
    $backupScript,
    $restoreDrillScript,
    $powerShellExe
) | Where-Object { -not (Test-Path -LiteralPath $_) }
if ($missingFiles.Count -gt 0) {
    throw "Arquivos obrigatorios ausentes: $($missingFiles -join ', ')"
}
if (-not $isAdministrator -and -not $AllowLogonFallback) {
    throw 'Execute este instalador como administrador para registrar tarefas no boot. Use -AllowLogonFallback apenas como contingencia apos login.'
}

$serviceStateRoot = if ($isAdministrator) {
    Join-Path $env:ProgramData 'DeadIdle'
}
else {
    Join-Path $env:LOCALAPPDATA 'DeadIdle'
}
$serviceBinRoot = Join-Path $serviceStateRoot 'bin'
$serviceScriptRoot = Join-Path $serviceStateRoot 'scripts'
$secretRoot = Join-Path $serviceStateRoot 'secrets'
$tokenFile = Join-Path $secretRoot 'cloudflared-token.txt'
$taskDockerScript = $dockerScript
$taskBackendScript = $backendScript
$taskTunnelScript = $tunnelScript

New-Item -ItemType Directory -Path $serviceStateRoot -Force | Out-Null

function Protect-SecretFile {
    param([Parameter(Mandatory)][string]$Path)

    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) {
        [void]$acl.RemoveAccessRuleAll($rule)
    }

    $accounts = @(
        $identity.User.Translate([System.Security.Principal.NTAccount]),
        ([System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')).Translate([System.Security.Principal.NTAccount]),
        ([System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')).Translate([System.Security.Principal.NTAccount])
    )
    foreach ($account in $accounts) {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $account,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        $acl.AddAccessRule($rule)
    }

    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Protect-ServiceScriptDirectory {
    param([Parameter(Mandatory)][string]$Path)

    $systemAccount = ([System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')).Translate([System.Security.Principal.NTAccount])
    $administratorsAccount = ([System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')).Translate([System.Security.Principal.NTAccount])
    $userAccount = $identity.User.Translate([System.Security.Principal.NTAccount])
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($systemAccount)

    foreach ($account in @($systemAccount, $administratorsAccount)) {
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
            $account,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
            [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow
        ))
    }
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
        $userAccount,
        [System.Security.AccessControl.FileSystemRights]::ReadAndExecute,
        [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
        [System.Security.AccessControl.PropagationFlags]::None,
        [System.Security.AccessControl.AccessControlType]::Allow
    ))

    Set-Acl -LiteralPath $Path -AclObject $acl
}

if ($isAdministrator) {
    New-Item -ItemType Directory -Path $serviceBinRoot, $serviceScriptRoot, $secretRoot -Force | Out-Null
    $cloudflaredServicePath = Join-Path $serviceBinRoot 'cloudflared.exe'
    $cloudflaredSource = (Get-Command cloudflared.exe -ErrorAction SilentlyContinue).Source
    if ($cloudflaredSource) {
        $shouldCopyCloudflared = -not (Test-Path -LiteralPath $cloudflaredServicePath)
        if (-not $shouldCopyCloudflared) {
            $sourceHash = (Get-FileHash -LiteralPath $cloudflaredSource -Algorithm SHA256).Hash
            $serviceHash = (Get-FileHash -LiteralPath $cloudflaredServicePath -Algorithm SHA256).Hash
            $shouldCopyCloudflared = $sourceHash -ne $serviceHash
        }

        if ($shouldCopyCloudflared) {
            Stop-ScheduledTask -TaskName 'DeadIdle-Tunnel' -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Copy-Item -LiteralPath $cloudflaredSource -Destination $cloudflaredServicePath -Force
        }
    }
    if (-not (Test-Path -LiteralPath $cloudflaredServicePath)) {
        throw 'cloudflared.exe nao foi encontrado para instalar o servico.'
    }

    if (-not (Test-Path -LiteralPath $tokenFile)) {
        Push-Location $frontendRoot
        try {
            $auth = ((& $npmPath exec wrangler -- auth token --json 2>$null | Out-String).Trim() | ConvertFrom-Json)
            $who = ((& $npmPath exec wrangler -- whoami --json 2>$null | Out-String).Trim() | ConvertFrom-Json)
        }
        finally {
            Pop-Location
        }
        $accountId = @($who.accounts)[0].id
        if (-not $accountId -or -not $auth.token) {
            throw 'A autenticacao do Wrangler nao retornou conta e token.'
        }
        $tunnelId = '4d17aea4-3285-426c-ab76-9efe7aca7a7a'
        $headers = @{ Authorization = "Bearer $($auth.token)" }
        $response = Invoke-RestMethod `
            -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/cfd_tunnel/$tunnelId/token" `
            -Headers $headers `
            -Method Get
        $token = [string]$response.result
        if ($token.Length -lt 100) {
            throw 'O token retornado pelo cloudflared e invalido.'
        }

        [System.IO.File]::WriteAllText(
            $tokenFile,
            $token,
            [System.Text.UTF8Encoding]::new($false)
        )
    }
    Protect-SecretFile -Path $tokenFile
    $taskDockerScript = Join-Path $serviceScriptRoot 'Start-DeadIdleDocker.ps1'
    $taskBackendScript = Join-Path $serviceScriptRoot 'Start-DeadIdleBackend.ps1'
    $taskTunnelScript = Join-Path $serviceScriptRoot 'Start-DeadIdleTunnel.ps1'
    Copy-Item -LiteralPath $dockerScript -Destination $taskDockerScript -Force
    Copy-Item -LiteralPath $backendScript -Destination $taskBackendScript -Force
    Copy-Item -LiteralPath $tunnelScript -Destination $taskTunnelScript -Force
    Protect-ServiceScriptDirectory -Path $serviceScriptRoot
    Set-Service -Name 'com.docker.service' -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name 'com.docker.service' -ErrorAction Stop
}

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

$dockerPrincipal = if ($isAdministrator) {
    New-ScheduledTaskPrincipal `
        -UserId $currentUser `
        -LogonType S4U `
        -RunLevel Limited
}
else {
    New-ScheduledTaskPrincipal `
        -UserId $currentUser `
        -LogonType Interactive `
        -RunLevel Limited
}
$dockerTriggers = if ($isAdministrator) {
    @(
        (New-ScheduledTaskTrigger -AtStartup),
        (New-ScheduledTaskTrigger -AtLogOn -User $currentUser)
    )
}
else {
    @((New-ScheduledTaskTrigger -AtLogOn -User $currentUser))
}
$dockerArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$taskDockerScript`" -StateRoot `"$serviceStateRoot`""
$dockerAction = New-ScheduledTaskAction `
    -Execute $powerShellExe `
    -Argument $dockerArguments `
    -WorkingDirectory $repoRoot
Stop-ScheduledTask -TaskName 'DeadIdle-Docker' -ErrorAction SilentlyContinue
Register-ScheduledTask `
    -TaskName 'DeadIdle-Docker' `
    -Action $dockerAction `
    -Trigger $dockerTriggers `
    -Principal $dockerPrincipal `
    -Settings $settings `
    -Description 'Mantem o motor WSL2 do Docker Desktop disponivel desde o boot, sem exigir login interativo.' `
    -Force | Out-Null

if ($isAdministrator) {
    $servicePrincipal = New-ScheduledTaskPrincipal `
        -UserId 'SYSTEM' `
        -LogonType ServiceAccount `
        -RunLevel Highest
    $serviceTriggers = @(
        (New-ScheduledTaskTrigger -AtStartup),
        (New-ScheduledTaskTrigger -AtLogOn -User $currentUser)
    )
}
else {
    $servicePrincipal = New-ScheduledTaskPrincipal `
        -UserId $currentUser `
        -LogonType Interactive `
        -RunLevel Limited
    $serviceTriggers = @(
        (New-ScheduledTaskTrigger -AtLogOn -User $currentUser)
    )
}

$serviceTasks = @(
    @{
        Name = 'DeadIdle-Backend'
        Script = $taskBackendScript
        ExtraArguments = "-StateRoot `"$serviceStateRoot`" -RepoRoot `"$repoRoot`""
        Description = 'Mantem PostgreSQL, Redis e o backend local do DeadIdle disponiveis desde o boot.'
    },
    @{
        Name = 'DeadIdle-Tunnel'
        Script = $taskTunnelScript
        ExtraArguments = "-StateRoot `"$serviceStateRoot`" -TokenFile `"$tokenFile`" -RepoRoot `"$repoRoot`""
        Description = 'Mantem o tunel publico nomeado do DeadIdle disponivel desde o boot.'
    }
)

# Uma tarefa em execucao preserva o principal antigo mesmo apos Register-ScheduledTask
# com -Force. Pare os supervisores antes de trocar Interactive por SYSTEM.
foreach ($task in $serviceTasks) {
    Stop-ScheduledTask -TaskName $task.Name -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

foreach ($task in $serviceTasks) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$($task.Script)`" $($task.ExtraArguments)"
    $action = New-ScheduledTaskAction `
        -Execute $powerShellExe `
        -Argument $arguments `
        -WorkingDirectory $repoRoot

    Register-ScheduledTask `
        -TaskName $task.Name `
        -Action $action `
        -Trigger $serviceTriggers `
        -Principal $servicePrincipal `
        -Settings $settings `
        -Description $task.Description `
        -Force | Out-Null
}

$automationPrincipal = if ($isAdministrator) {
    New-ScheduledTaskPrincipal `
        -UserId $currentUser `
        -LogonType S4U `
        -RunLevel Limited
}
else {
    New-ScheduledTaskPrincipal `
        -UserId $currentUser `
        -LogonType Interactive `
        -RunLevel Limited
}
$backupTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At ((Get-Date).AddMinutes(5)) `
    -RepetitionInterval (New-TimeSpan -Hours 2) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$restoreTrigger = New-ScheduledTaskTrigger `
    -Weekly `
    -DaysOfWeek Sunday `
    -At '04:00'
$automationTasks = @(
    @{
        Name = 'DeadIdle-Backup'
        Script = $backupScript
        Trigger = $backupTrigger
        Description = 'Cria backup a cada duas horas, envia ao R2 e valida o checksum por download.'
    },
    @{
        Name = 'DeadIdle-Restore-Drill'
        Script = $restoreDrillScript
        Trigger = $restoreTrigger
        Description = 'Restaura o backup mais recente em banco temporario todos os domingos.'
    }
)

foreach ($task in $automationTasks) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$($task.Script)`""
    $action = New-ScheduledTaskAction `
        -Execute $powerShellExe `
        -Argument $arguments `
        -WorkingDirectory $repoRoot

    Register-ScheduledTask `
        -TaskName $task.Name `
        -Action $action `
        -Trigger $task.Trigger `
        -Principal $automationPrincipal `
        -Settings $settings `
        -Description $task.Description `
        -Force | Out-Null
}

Start-ScheduledTask -TaskName 'DeadIdle-Docker'
Start-ScheduledTask -TaskName 'DeadIdle-Backend'
Start-ScheduledTask -TaskName 'DeadIdle-Tunnel'

Start-Sleep -Seconds 2
Get-ScheduledTask -TaskName @(
    'DeadIdle-Docker',
    'DeadIdle-Backend',
    'DeadIdle-Tunnel',
    'DeadIdle-Backup',
    'DeadIdle-Restore-Drill'
) | Select-Object TaskName, State
