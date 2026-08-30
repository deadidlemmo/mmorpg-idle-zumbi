[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendScript = Join-Path $PSScriptRoot 'Start-DeadIdleBackend.ps1'
$tunnelScript = Join-Path $PSScriptRoot 'Start-DeadIdleTunnel.ps1'
$powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$missingFiles = @($backendScript, $tunnelScript, $powerShellExe) |
    Where-Object { -not (Test-Path -LiteralPath $_) }
if ($missingFiles.Count -gt 0) {
    throw "Arquivos obrigatorios ausentes: $($missingFiles -join ', ')"
}

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal `
    -UserId $currentUser `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

$tasks = @(
    @{
        Name = 'DeadIdle-Backend'
        Script = $backendScript
        Description = 'Mantem PostgreSQL, Redis e o backend local do DeadIdle disponiveis.'
    },
    @{
        Name = 'DeadIdle-Tunnel'
        Script = $tunnelScript
        Description = 'Mantem o tunel publico nomeado do backend local do DeadIdle disponivel.'
    }
)

foreach ($task in $tasks) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$($task.Script)`""
    $action = New-ScheduledTaskAction `
        -Execute $powerShellExe `
        -Argument $arguments `
        -WorkingDirectory $repoRoot

    Register-ScheduledTask `
        -TaskName $task.Name `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Description $task.Description `
        -Force | Out-Null

    Start-ScheduledTask -TaskName $task.Name
}

Start-Sleep -Seconds 2
Get-ScheduledTask -TaskName 'DeadIdle-Backend', 'DeadIdle-Tunnel' |
    Select-Object TaskName, State
