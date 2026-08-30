[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendRoot = Join-Path $repoRoot 'backend'
$backupRoot = Join-Path $backendRoot 'backups'
$statusPath = Join-Path $backupRoot 'status.json'
$stateRoot = Join-Path $env:LOCALAPPDATA 'DeadIdle'
$logRoot = Join-Path $stateRoot 'logs'
$lockRoot = Join-Path $stateRoot 'locks'
$logPath = Join-Path $logRoot 'restore-drill.log'
$lockPath = Join-Path $lockRoot 'backup.lock'
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source

New-Item -ItemType Directory -Path $logRoot, $lockRoot -Force | Out-Null

function Write-DrillLog {
    param([Parameter(Mandatory)][string]$Message)

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "[$timestamp] $Message"
}

$lockStream = $null
try {
    $lockStream = [System.IO.File]::Open(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
    if (-not (Test-Path -LiteralPath $statusPath)) {
        throw 'status.json de backup nao encontrado.'
    }

    $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
    if ($status.backup.status -ne 'success' -or -not $status.backup.file) {
        throw 'Nao existe backup local confirmado para o restore drill.'
    }

    $backupPath = Join-Path $backupRoot ([System.IO.Path]::GetFileName($status.backup.file))
    if (-not (Test-Path -LiteralPath $backupPath)) {
        throw 'O dump apontado por status.json nao existe.'
    }

    Write-DrillLog "Iniciando restauracao isolada de $([System.IO.Path]::GetFileName($backupPath))."
    Push-Location $backendRoot
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $npmPath run backup:verify -- "--backup=$backupPath" 2>&1
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
        throw "Restore drill terminou com codigo $exitCode."
    }

    Write-DrillLog 'Restore drill concluido com sucesso.'
}
catch {
    Write-DrillLog "Restore drill falhou: $($_.Exception.Message)"
    throw
}
finally {
    if ($lockStream) {
        $lockStream.Dispose()
    }
}
