[CmdletBinding()]
param(
    [string]$StateRoot = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendRoot = Join-Path $repoRoot 'backend'
$composeFile = Join-Path $repoRoot 'infra\docker-compose.yml'
$mainFile = Join-Path $backendRoot 'dist\main.js'
if (-not $StateRoot) {
    $StateRoot = Join-Path $env:LOCALAPPDATA 'DeadIdle'
}
$logRoot = Join-Path $stateRoot 'logs'
$supervisorLog = Join-Path $logRoot 'backend-supervisor.log'
$stdoutLog = Join-Path $logRoot 'backend.stdout.log'
$stderrLog = Join-Path $logRoot 'backend.stderr.log'
$healthUrl = 'http://127.0.0.1:3000/health'
$dockerPath = @(
    (Get-Command docker.exe -ErrorAction SilentlyContinue).Source,
    (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
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

function Test-BackendHealth {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 5
        return [bool]$health.ready
    }
    catch {
        return $false
    }
}

function Test-DockerReady {
    if (-not $dockerPath) {
        return $false
    }

    try {
        & $dockerPath info *> $null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
}

function Wait-DockerReady {
    param([int]$TimeoutSeconds = 180)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-DockerReady) {
            return $true
        }

        Start-Sleep -Seconds 5
    }

    return $false
}

function Start-DockerDesktopIfNeeded {
    if (Test-DockerReady) {
        return $true
    }

    if ([System.Security.Principal.WindowsIdentity]::GetCurrent().IsSystem) {
        Start-Service -Name 'com.docker.service' -ErrorAction SilentlyContinue
        Write-SupervisorLog 'Aguardando o Docker Desktop Service no contexto SYSTEM.'
        return Wait-DockerReady -TimeoutSeconds 300
    }

    $dockerDesktopCandidates = @(
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
    )
    $dockerDesktop = $dockerDesktopCandidates |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1

    if (-not $dockerDesktop) {
        Write-SupervisorLog 'Docker Desktop nao foi encontrado.'
        return $false
    }

    Write-SupervisorLog 'Iniciando Docker Desktop.'
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden | Out-Null
    return Wait-DockerReady
}

function Ensure-Infrastructure {
    if (-not (Start-DockerDesktopIfNeeded)) {
        return $false
    }

    Write-SupervisorLog 'Garantindo PostgreSQL e Redis via Docker Compose.'
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $composeOutput = & $dockerPath compose -f $composeFile up -d 2>&1
        $composeExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $composeOutput | Add-Content -LiteralPath $supervisorLog
    if ($composeExitCode -ne 0) {
        Write-SupervisorLog "Docker Compose terminou com codigo $composeExitCode."
        return $false
    }

    Start-Sleep -Seconds 5
    return $true
}

function Ensure-BackendBuild {
    if (Test-Path -LiteralPath $mainFile) {
        return $true
    }

    Write-SupervisorLog 'Build do backend ausente; executando npm run build.'
    Push-Location $backendRoot
    try {
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $buildOutput = & npm.cmd run build 2>&1
            $buildExitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        $buildOutput | Add-Content -LiteralPath $supervisorLog
        if ($buildExitCode -ne 0) {
            Write-SupervisorLog "Build terminou com codigo $buildExitCode."
            return $false
        }
    }
    finally {
        Pop-Location
    }

    return Test-Path -LiteralPath $mainFile
}

Rotate-Log -Path $supervisorLog
Rotate-Log -Path $stdoutLog
Rotate-Log -Path $stderrLog
Write-SupervisorLog "Supervisor iniciado em $repoRoot."

while ($true) {
    if (Test-BackendHealth) {
        Start-Sleep -Seconds 10
        continue
    }

    Write-SupervisorLog 'Backend indisponivel; preparando reinicio.'
    if (-not (Ensure-Infrastructure)) {
        Start-Sleep -Seconds 15
        continue
    }

    if (-not (Ensure-BackendBuild)) {
        Start-Sleep -Seconds 15
        continue
    }

    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    Write-SupervisorLog 'Iniciando backend compilado.'
    $backendProcess = Start-Process `
        -FilePath $nodePath `
        -ArgumentList @('dist/main.js') `
        -WorkingDirectory $backendRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

    $consecutiveFailures = 0
    while (-not $backendProcess.HasExited) {
        Start-Sleep -Seconds 10
        $backendProcess.Refresh()

        if (Test-BackendHealth) {
            $consecutiveFailures = 0
            continue
        }

        $consecutiveFailures++
        if ($consecutiveFailures -lt 6) {
            continue
        }

        Write-SupervisorLog 'Backend supervisionado ficou sem responder por 60 segundos; reiniciando.'
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
        $null = $backendProcess.WaitForExit(5000)
        break
    }

    $backendProcess.Refresh()
    Write-SupervisorLog "Processo do backend encerrou. ExitCode=$($backendProcess.ExitCode)."
    Start-Sleep -Seconds 5
}
