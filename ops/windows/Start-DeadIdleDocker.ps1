[CmdletBinding()]
param(
    [string]$StateRoot = ''
)

$ErrorActionPreference = 'Stop'

if (-not $StateRoot) {
    $StateRoot = Join-Path $env:ProgramData 'DeadIdle'
}
$logRoot = Join-Path $StateRoot 'logs'
$supervisorLog = Join-Path $logRoot 'docker-supervisor.log'
$stdoutLog = Join-Path $logRoot 'docker.stdout.log'
$stderrLog = Join-Path $logRoot 'docker.stderr.log'
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

function Test-DockerReady {
    if (-not $dockerPath) {
        return $false
    }

    $nativeErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $dockerPath info *> $null
        return $LASTEXITCODE -eq 0
    }
    finally {
        $ErrorActionPreference = $nativeErrorActionPreference
    }
}

function Start-DockerEngine {
    $nativeErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $dockerPath desktop start --detach --timeout 300 >> $stdoutLog 2>> $stderrLog
        return $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $nativeErrorActionPreference
    }
}

foreach ($logPath in @($supervisorLog, $stdoutLog, $stderrLog)) {
    Rotate-Log -Path $logPath
}
Write-SupervisorLog 'Supervisor do Docker Desktop iniciado.'

if (-not $dockerPath) {
    throw 'docker.exe nao foi encontrado.'
}

while ($true) {
    if (Test-DockerReady) {
        Start-Sleep -Seconds 15
        continue
    }

    Write-SupervisorLog 'Docker indisponivel; solicitando inicializacao.'
    try {
        $exitCode = Start-DockerEngine
        Write-SupervisorLog "Comando de inicializacao encerrou. ExitCode=$exitCode."
    }
    catch {
        Write-SupervisorLog "Falha ao iniciar o Docker Desktop: $($_.Exception.Message)"
    }

    $deadline = (Get-Date).AddMinutes(5)
    while ((Get-Date) -lt $deadline -and -not (Test-DockerReady)) {
        Start-Sleep -Seconds 5
    }

    if (Test-DockerReady) {
        Write-SupervisorLog 'Docker Desktop disponivel.'
    }
    else {
        Write-SupervisorLog 'Docker Desktop nao ficou disponivel dentro de 5 minutos.'
        Start-Sleep -Seconds 30
    }
}
