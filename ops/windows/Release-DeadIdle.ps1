[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$SkipPagesDeploy,
    [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendRoot = Join-Path $repoRoot 'backend'
$frontendRoot = Join-Path $repoRoot 'frontend'
$backupScript = Join-Path $PSScriptRoot 'Invoke-DeadIdleBackup.ps1'
$backendSupervisor = Join-Path $PSScriptRoot 'Start-DeadIdleBackend.ps1'
$stateRoot = Join-Path $env:LOCALAPPDATA 'DeadIdle'
$logRoot = Join-Path $stateRoot 'logs'
$lockRoot = Join-Path $stateRoot 'locks'
$logPath = Join-Path $logRoot 'release.log'
$lockPath = Join-Path $lockRoot 'release.lock'
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
$powerShellPath = (Get-Command powershell.exe -ErrorAction Stop).Source

New-Item -ItemType Directory -Path $logRoot, $lockRoot -Force | Out-Null

function Write-ReleaseLog {
    param([Parameter(Mandatory)][string]$Message)

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "[$timestamp] $Message"
    Write-Host $Message
}

function Invoke-ReleaseStep {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$WorkingDirectory
    )

    Write-ReleaseLog "Iniciando: $Name"
    Push-Location $WorkingDirectory
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $FilePath @Arguments 2>&1 | Tee-Object -FilePath $logPath -Append
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        Pop-Location
    }

    if ($exitCode -ne 0) {
        throw "$Name terminou com codigo $exitCode."
    }
    Write-ReleaseLog "Concluido: $Name"
}

function Wait-Health {
    param(
        [Parameter(Mandatory)][string]$Url,
        [int]$TimeoutSeconds = 180
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $health = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 10
            if ($health.ready) {
                return $health
            }
        }
        catch {
            Start-Sleep -Seconds 3
        }
    } while ((Get-Date) -lt $deadline)

    throw "Health check nao ficou pronto: $Url"
}

function Stop-BackendForMaintenance {
    $task = Get-ScheduledTask -TaskName 'DeadIdle-Backend' -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName 'DeadIdle-Backend' -ErrorAction SilentlyContinue
    }

    $listeners = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -eq 'node') {
            Stop-Process -Id $process.Id -Force
        }
    }
}

function Start-BackendAfterMaintenance {
    $task = Get-ScheduledTask -TaskName 'DeadIdle-Backend' -ErrorAction SilentlyContinue
    if ($task) {
        Start-ScheduledTask -TaskName 'DeadIdle-Backend'
    }
    else {
        Start-Process `
            -FilePath $powerShellPath `
            -ArgumentList @(
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-WindowStyle',
                'Hidden',
                '-File',
                $backendSupervisor
            ) `
            -WorkingDirectory $repoRoot `
            -WindowStyle Hidden | Out-Null
    }
}

$lockStream = $null
$backendMaintenanceStarted = $false
$backendHealthyAfterMaintenance = $false
try {
    $lockStream = [System.IO.File]::Open(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
    $dirty = & git -C $repoRoot status --porcelain
    if ($LASTEXITCODE -ne 0) {
        throw 'Nao foi possivel consultar o Git.'
    }
    if ($dirty -and -not $AllowDirty) {
        throw 'O release exige working tree limpo. Revise e commite as mudancas ou use -AllowDirty conscientemente.'
    }

    Write-ReleaseLog 'Release iniciado.'
    Invoke-ReleaseStep `
        -Name 'Backup local e externo' `
        -FilePath $powerShellPath `
        -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $backupScript) `
        -WorkingDirectory $repoRoot

    if (-not $SkipTests) {
        Invoke-ReleaseStep `
            -Name 'Auditoria de lancamento T1-T5' `
            -FilePath $npmPath `
            -Arguments @('run', 'launch:audit:t1-t5') `
            -WorkingDirectory $backendRoot
        Invoke-ReleaseStep `
            -Name 'Lint backend' `
            -FilePath $npmPath `
            -Arguments @('run', 'lint') `
            -WorkingDirectory $backendRoot
        Invoke-ReleaseStep `
            -Name 'Testes backend' `
            -FilePath $npmPath `
            -Arguments @('test', '--', '--runInBand') `
            -WorkingDirectory $backendRoot
        Invoke-ReleaseStep `
            -Name 'Lint frontend' `
            -FilePath $npmPath `
            -Arguments @('run', 'lint') `
            -WorkingDirectory $frontendRoot
        Invoke-ReleaseStep `
            -Name 'Testes frontend' `
            -FilePath $npmPath `
            -Arguments @('test') `
            -WorkingDirectory $frontendRoot
    }

    Invoke-ReleaseStep `
        -Name 'Build frontend' `
        -FilePath $npmPath `
        -Arguments @('run', 'build') `
        -WorkingDirectory $frontendRoot

    Write-ReleaseLog 'Parando backend para geracao Prisma, migration e build.'
    $backendMaintenanceStarted = $true
    Stop-BackendForMaintenance

    Invoke-ReleaseStep `
        -Name 'Prisma generate' `
        -FilePath $npmPath `
        -Arguments @('run', 'prisma:generate') `
        -WorkingDirectory $backendRoot
    Invoke-ReleaseStep `
        -Name 'Prisma migrate deploy' `
        -FilePath $npmPath `
        -Arguments @('exec', 'prisma', '--', 'migrate', 'deploy') `
        -WorkingDirectory $backendRoot
    Invoke-ReleaseStep `
        -Name 'Build backend' `
        -FilePath $npmPath `
        -Arguments @('run', 'build') `
        -WorkingDirectory $backendRoot

    Write-ReleaseLog 'Reiniciando backend supervisionado.'
    Start-BackendAfterMaintenance
    $localHealth = Wait-Health -Url 'http://127.0.0.1:3000/health/ready'
    $backendHealthyAfterMaintenance = $true
    if ($localHealth.backup.integrity -ne 'valid') {
        throw 'O backend reiniciou, mas o health nao validou o checksum do backup.'
    }
    [void](Wait-Health -Url 'https://deadidle-api.botpokeidle.com.br/health/ready')

    if (-not $SkipPagesDeploy) {
        $commitHash = (& git -C $repoRoot rev-parse HEAD).Trim()
        $commitMessage = (& git -C $repoRoot log -1 --pretty=%s).Trim()
        Invoke-ReleaseStep `
            -Name 'Publicacao Cloudflare Pages' `
            -FilePath $npmPath `
            -Arguments @(
                'exec',
                'wrangler',
                '--',
                'pages',
                'deploy',
                'dist',
                '--project-name=deadidle',
                '--branch=main',
                "--commit-hash=$commitHash",
                "--commit-message=$commitMessage",
                "--commit-dirty=$([bool]$dirty)"
            ) `
            -WorkingDirectory $frontendRoot
        $response = Invoke-WebRequest `
            -Uri 'https://deadidle.pages.dev' `
            -Method Get `
            -TimeoutSec 30 `
            -UseBasicParsing
        if ($response.StatusCode -ne 200) {
            throw "Pages respondeu com HTTP $($response.StatusCode)."
        }
    }

    Write-ReleaseLog 'Release concluido com sucesso.'
}
catch {
    Write-ReleaseLog "Release falhou: $($_.Exception.Message)"
    throw
}
finally {
    if ($backendMaintenanceStarted -and -not $backendHealthyAfterMaintenance) {
        try {
            Write-ReleaseLog 'Restaurando backend apos falha durante a janela de manutencao.'
            Start-BackendAfterMaintenance
            [void](Wait-Health -Url 'http://127.0.0.1:3000/health/ready' -TimeoutSeconds 90)
            Write-ReleaseLog 'Backend restaurado apos falha do release.'
        }
        catch {
            Write-ReleaseLog "Nao foi possivel restaurar o backend automaticamente: $($_.Exception.Message)"
        }
    }

    if ($lockStream) {
        $lockStream.Dispose()
    }
}
