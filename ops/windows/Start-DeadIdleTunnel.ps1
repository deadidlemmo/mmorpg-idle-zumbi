[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$frontendRoot = Join-Path $repoRoot 'frontend'
$stateRoot = Join-Path $env:LOCALAPPDATA 'DeadIdle'
$logRoot = Join-Path $stateRoot 'logs'
$supervisorLog = Join-Path $logRoot 'tunnel-supervisor.log'
$stdoutLog = Join-Path $logRoot 'tunnel.stdout.log'
$stderrLog = Join-Path $logRoot 'tunnel.stderr.log'
$healthUrl = 'https://deadidle-api.botpokeidle.com.br/health'
$tunnelName = 'deadidle-local-api'

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
    $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
    Write-SupervisorLog 'Iniciando o tunel nomeado pelo Wrangler.'

    Push-Location $frontendRoot
    try {
        & $npmPath exec --yes wrangler -- tunnel run $tunnelName --log-level info >> $stdoutLog 2>> $stderrLog
        $exitCode = $LASTEXITCODE
    }
    catch {
        $exitCode = -1
        Write-SupervisorLog "Falha ao iniciar o tunel: $($_.Exception.Message)"
    }
    finally {
        Pop-Location
    }

    Write-SupervisorLog "Processo do tunel encerrou. ExitCode=$exitCode."
    Start-Sleep -Seconds 10
}
