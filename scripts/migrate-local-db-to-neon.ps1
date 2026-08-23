$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Dead Idle - Migracao PostgreSQL para Neon v3'

$projectRoot = Split-Path -Parent $PSScriptRoot
$containerName = 'zumbi_postgres'
$containerDumpPath = '/tmp/dead-idle-neon-migration.dump'
$containerVerifyPath = '/tmp/dead-idle-neon-verify.sql'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Dead Idle Backups'
$backupPath = Join-Path $backupRoot "dead-idle-before-neon-$timestamp.dump"
$manifestPath = "$backupPath.sha256.json"
$statusPath = Join-Path $backupRoot "dead-idle-neon-migration-$timestamp.status.json"
$verifyPath = Join-Path $env:TEMP "dead-idle-neon-verify-$timestamp.sql"
$migrationSucceeded = $false

function Assert-LastExitCode([string]$Operation) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation falhou com codigo $LASTEXITCODE."
    }
}

function Read-SecretText([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Normalize-Output([object[]]$Lines) {
    return (($Lines | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ }) -join "`n").Trim()
}

function Get-Sha256Hex([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha256 = [Security.Cryptography.SHA256]::Create()

    try {
        $hashBytes = $sha256.ComputeHash($stream)
        return ([BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

Clear-Host
Write-Host 'MIGRACAO SEGURA DO POSTGRESQL LOCAL PARA O NEON' -ForegroundColor Green
Write-Host ''
Write-Host 'O processo cria um backup antes de alterar o Neon.'
Write-Host 'A URL digitada nao sera exibida, gravada no repositorio ou enviada ao chat.'
Write-Host ''

$databaseUrl = Read-SecretText 'Cole novamente a URL DIRETA do Neon e pressione Enter'

if ($databaseUrl -notmatch '^postgres(?:ql)?://') {
    throw 'A URL deve comecar com postgresql://.'
}

if ($databaseUrl -match '-pooler\.') {
    throw 'Use a URL direta do Neon, sem -pooler no host.'
}

$databaseUri = [Uri]$databaseUrl
if ($databaseUri.Host -notlike '*.neon.tech') {
    throw 'O host informado nao pertence ao Neon.'
}

$databaseName = $databaseUri.AbsolutePath.Trim('/')
Write-Host "Destino confirmado: $($databaseUri.Host)/$databaseName" -ForegroundColor Cyan
$confirmation = Read-Host 'Digite MIGRAR para criar o backup e substituir o conteudo desse banco Neon'
if ($confirmation -cne 'MIGRAR') {
    throw 'Migracao cancelada pelo usuario.'
}

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$verifySql = @'
SELECT 'tables=' || count(*) FROM information_schema.tables WHERE table_schema = 'public';
SELECT 'users=' || count(*) FROM users;
SELECT 'characters=' || count(*) FROM characters;
SELECT 'items=' || count(*) FROM items;
SELECT 'inventory_items=' || count(*) FROM inventory_items;
SELECT 'migrations=' || count(*) FROM _prisma_migrations;
'@
[IO.File]::WriteAllText($verifyPath, $verifySql, [Text.UTF8Encoding]::new($false))

try {
    Write-Host ''
    Write-Host '1/5 Criando snapshot consistente do banco local...'
    & docker exec $containerName pg_dump `
        --username=zumbi `
        --dbname=mmorpg_zumbi `
        --format=custom `
        --compress=9 `
        --no-owner `
        --no-acl `
        --file=$containerDumpPath
    Assert-LastExitCode 'pg_dump local'

    & docker cp "${containerName}:$containerDumpPath" $backupPath
    Assert-LastExitCode 'Copia do backup'

    $backupFile = Get-Item -LiteralPath $backupPath
    $backupHash = Get-Sha256Hex $backupPath
    $manifest = [ordered]@{
        status = 'success'
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        source = 'local-docker/mmorpg_zumbi'
        file = $backupFile.Name
        sizeBytes = $backupFile.Length
        sha256 = $backupHash
    }
    [IO.File]::WriteAllText(
        $manifestPath,
        ($manifest | ConvertTo-Json) + "`n",
        [Text.UTF8Encoding]::new($false)
    )
    Write-Host "Backup salvo em: $backupPath" -ForegroundColor Green

    Write-Host '2/5 Validando conexao segura com o Neon...'
    $env:NEON_DATABASE_URL = $databaseUrl
    $connectionCommand = 'psql "$NEON_DATABASE_URL" --set=ON_ERROR_STOP=1 --tuples-only --command="SELECT current_database();"'
    & docker exec -e NEON_DATABASE_URL $containerName sh -lc $connectionCommand | Out-Null
    Assert-LastExitCode 'Conexao com Neon'

    Write-Host '3/5 Restaurando schema e dados no Neon...'
    $restoreCommand = 'pg_restore --dbname="$NEON_DATABASE_URL" --clean --if-exists --no-owner --no-acl --exit-on-error "' + $containerDumpPath + '"'
    & docker exec -e NEON_DATABASE_URL $containerName sh -lc $restoreCommand
    Assert-LastExitCode 'Restauracao no Neon'

    Write-Host '4/5 Comparando dados essenciais...'
    & docker cp $verifyPath "${containerName}:$containerVerifyPath"
    Assert-LastExitCode 'Copia do verificador'

    $sourceOutput = & docker exec $containerName psql `
        --username=zumbi `
        --dbname=mmorpg_zumbi `
        --set=ON_ERROR_STOP=1 `
        --tuples-only `
        --no-align `
        --file=$containerVerifyPath
    Assert-LastExitCode 'Verificacao do banco local'

    $targetCommand = 'psql "$NEON_DATABASE_URL" --set=ON_ERROR_STOP=1 --tuples-only --no-align --file="' + $containerVerifyPath + '"'
    $targetOutput = & docker exec -e NEON_DATABASE_URL $containerName sh -lc $targetCommand
    Assert-LastExitCode 'Verificacao do Neon'

    $sourceSummary = Normalize-Output $sourceOutput
    $targetSummary = Normalize-Output $targetOutput
    Write-Host 'Banco local:'
    Write-Host $sourceSummary
    Write-Host 'Neon:'
    Write-Host $targetSummary

    if ($sourceSummary -ne $targetSummary) {
        throw 'As contagens do Neon nao correspondem ao banco local.'
    }

    Write-Host '5/5 Migracao concluida e verificada.' -ForegroundColor Green
    Write-Host "SHA-256 do backup: $backupHash"
    $migrationSucceeded = $true
    $successStatus = [ordered]@{
        status = 'success'
        completedAt = (Get-Date).ToUniversalTime().ToString('o')
        destinationHost = $databaseUri.Host
        destinationDatabase = $databaseName
        backup = $backupPath
        backupSha256 = $backupHash
        verifiedCounts = $targetSummary -split "`n"
    }
    [IO.File]::WriteAllText(
        $statusPath,
        ($successStatus | ConvertTo-Json) + "`n",
        [Text.UTF8Encoding]::new($false)
    )
}
catch {
    $errorMessage = $_.Exception.Message
    if ($databaseUrl) {
        $errorMessage = $errorMessage.Replace($databaseUrl, '[REDACTED]')
    }

    $failedStatus = [ordered]@{
        status = 'failed'
        failedAt = (Get-Date).ToUniversalTime().ToString('o')
        destinationHost = $databaseUri.Host
        destinationDatabase = $databaseName
        backup = if (Test-Path -LiteralPath $backupPath) { $backupPath } else { $null }
        error = $errorMessage
    }
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    [IO.File]::WriteAllText(
        $statusPath,
        ($failedStatus | ConvertTo-Json) + "`n",
        [Text.UTF8Encoding]::new($false)
    )

    Write-Host ''
    Write-Host 'A migracao NAO foi concluida.' -ForegroundColor Red
    Write-Host $errorMessage -ForegroundColor Yellow
    Write-Host "Diagnostico salvo em: $statusPath"
}
finally {
    Remove-Item Env:NEON_DATABASE_URL -ErrorAction SilentlyContinue
    $databaseUrl = $null
    $databaseUri = $null
    Remove-Item -LiteralPath $verifyPath -Force -ErrorAction SilentlyContinue
    & docker exec $containerName rm -f $containerDumpPath $containerVerifyPath 2>$null
}

Write-Host ''
Read-Host 'Pressione Enter para fechar esta janela'

if (-not $migrationSucceeded) {
    exit 1
}
