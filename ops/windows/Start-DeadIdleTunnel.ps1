[CmdletBinding()]
param(
    [string]$StateRoot = '',
    [string]$TokenFile = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$frontendRoot = Join-Path $repoRoot 'frontend'
if (-not $StateRoot) {
    $StateRoot = Join-Path $env:LOCALAPPDATA 'DeadIdle'
}
if (-not $TokenFile) {
    $TokenFile = Join-Path $env:ProgramData 'DeadIdle\secrets\cloudflared-token.txt'
}
$logRoot = Join-Path $stateRoot 'logs'
$supervisorLog = Join-Path $logRoot 'tunnel-supervisor.log'
$stdoutLog = Join-Path $logRoot 'tunnel.stdout.log'
$stderrLog = Join-Path $logRoot 'tunnel.stderr.log'
$healthUrl = 'https://deadidle-api.botpokeidle.com.br/health'
$tunnelName = 'deadidle-local-api'
$cloudflaredPath = @(
    (Join-Path $env:ProgramData 'DeadIdle\bin\cloudflared.exe'),
    (Get-Command cloudflared.exe -ErrorAction SilentlyContinue).Source
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

function Rotate-Log {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    $file = Get-Item -LiteralPath $Path
    if ($file.Length -lt 10MB) {
        return
    }

    $backupPath = "$Path.1"
    Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $Path -Destination $backupPath -Force
}

function Write-SupervisorLog {
    param([Parameter(Mandatory)][string]$Message)

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $supervisorLog -Value "[$timestamp] $Message"
}

function Test-PublicHealth {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 8
        return [bool]$health.ready
    }
    catch {
        return $false
    }
}

function Test-NamedConnectorRunning {
    try {
        $connectors = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'"
        return [bool]($connectors | Where-Object {
            $_.CommandLine -match '\btunnel\b' -and
            $_.CommandLine -match '\brun\b' -and
            $_.CommandLine -notmatch '--url'
        } | Select-Object -First 1)
    }
    catch {
        return $false
    }
}

Rotate-Log -Path $supervisorLog
Rotate-Log -Path $stdoutLog
Rotate-Log -Path $stderrLog
Write-SupervisorLog "Supervisor iniciado para $tunnelName."

$consecutiveFailures = 0
while ($true) {
    if (Test-PublicHealth) {
        $consecutiveFailures = 0
        Start-Sleep -Seconds 15
        continue
    }

    $consecutiveFailures++
    if ($consecutiveFailures -lt 3) {
        Start-Sleep -Seconds 10
        continue
    }

    if (Test-NamedConnectorRunning) {
        Write-SupervisorLog 'Conector nomeado ativo; aguardando a reconexao ou o backend.'
        Start-Sleep -Seconds 15
        continue
    }

    $consecutiveFailures = 0
    try {
        if ($cloudflaredPath -and (Test-Path -LiteralPath $TokenFile)) {
            Write-SupervisorLog 'Iniciando o tunel nomeado com token de servico.'
            & $cloudflaredPath tunnel run --token-file $TokenFile --loglevel info --metrics 127.0.0.1:20241 >> $stdoutLog 2>> $stderrLog
            $exitCode = $LASTEXITCODE
        }
        else {
            $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
            Write-SupervisorLog 'Token de servico ausente; iniciando o tunel pelo Wrangler.'
            Push-Location $frontendRoot
            try {
                & $npmPath exec --yes wrangler -- tunnel run $tunnelName --log-level info >> $stdoutLog 2>> $stderrLog
                $exitCode = $LASTEXITCODE
            }
            finally {
                Pop-Location
            }
        }
    }
    catch {
        $exitCode = -1
        Write-SupervisorLog "Falha ao iniciar o tunel: $($_.Exception.Message)"
    }

    Write-SupervisorLog "Processo do tunel encerrou. ExitCode=$exitCode."
    Start-Sleep -Seconds 10
}
