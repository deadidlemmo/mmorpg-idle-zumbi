[CmdletBinding()]
param(
    [switch]$SkipOffsite,
    [ValidateRange(24, 720)]
    [int]$LocalRetentionHours = 72
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendRoot = Join-Path $repoRoot 'backend'
$composeFile = Join-Path $repoRoot 'infra\docker-compose.yml'
$backupRoot = Join-Path $backendRoot 'backups'
$statusPath = Join-Path $backupRoot 'status.json'
$stateRoot = Join-Path $env:LOCALAPPDATA 'DeadIdle'
$logRoot = Join-Path $stateRoot 'logs'
$lockRoot = Join-Path $stateRoot 'locks'
$logPath = Join-Path $logRoot 'backup.log'
$lockPath = Join-Path $lockRoot 'backup.lock'
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source

New-Item -ItemType Directory -Path $logRoot, $lockRoot -Force | Out-Null

function Write-BackupLog {
    param([Parameter(Mandatory)][string]$Message)

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "[$timestamp] $Message"
}

function Invoke-NativeStep {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$WorkingDirectory
    )

    Write-BackupLog "Iniciando: $Name"
    Push-Location $WorkingDirectory
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $FilePath @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        Pop-Location
    }

    if ($output) {
        $output | Add-Content -LiteralPath $logPath
    }
    if ($exitCode -ne 0) {
        throw "$Name terminou com codigo $exitCode."
    }

    Write-BackupLog "Concluido: $Name"
}

function Wait-DockerReady {
    param([int]$TimeoutSeconds = 300)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        & docker info *> $null
        if ($LASTEXITCODE -eq 0) {
            return
        }

        Start-Sleep -Seconds 5
    }

    throw 'Docker nao ficou pronto dentro do prazo.'
}

$lockStream = $null
try {
    $lockStream = [System.IO.File]::Open(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
    Write-BackupLog 'Ciclo de backup iniciado.'
    Wait-DockerReady
    Invoke-NativeStep `
        -Name 'Docker Compose' `
        -FilePath 'docker' `
        -Arguments @('compose', '-f', $composeFile, 'up', '-d') `
        -WorkingDirectory $repoRoot
    Invoke-NativeStep `
        -Name 'Backup PostgreSQL local' `
        -FilePath $npmPath `
        -Arguments @('run', 'backup:database') `
        -WorkingDirectory $backendRoot

    if (-not (Test-Path -LiteralPath $statusPath)) {
        throw 'O backup nao produziu status.json.'
    }

    $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
    if ($status.backup.status -ne 'success' -or -not $status.backup.file) {
        throw 'O status do backup local nao confirmou sucesso.'
    }

    $backupPath = [System.IO.Path]::GetFullPath(
        (Join-Path $backupRoot ([System.IO.Path]::GetFileName($status.backup.file)))
    )
    $resolvedBackupRoot = [System.IO.Path]::GetFullPath($backupRoot)
    if (-not $backupPath.StartsWith("$resolvedBackupRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'O arquivo de backup saiu do diretorio permitido.'
    }

    if (-not $SkipOffsite) {
        Invoke-NativeStep `
            -Name 'Copia privada no Cloudflare R2' `
            -FilePath $npmPath `
            -Arguments @('run', 'backup:offsite', '--', "--backup=$backupPath") `
            -WorkingDirectory $backendRoot
    }

    Invoke-NativeStep `
        -Name 'Retencao local' `
        -FilePath $npmPath `
        -Arguments @('run', 'backup:prune', '--', "--retain-hours=$LocalRetentionHours") `
        -WorkingDirectory $backendRoot
    Write-BackupLog 'Ciclo de backup concluido com sucesso.'
}
catch {
    Write-BackupLog "Ciclo de backup falhou: $($_.Exception.Message)"
    throw
}
finally {
    if ($lockStream) {
        $lockStream.Dispose()
    }
}
