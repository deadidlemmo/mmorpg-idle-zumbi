$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Dead Idle - Segredos do Render'

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

function New-HexSecret([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $random.GetBytes($bytes)
    }
    finally {
        $random.Dispose()
    }

    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

Clear-Host
Write-Host 'CONFIGURACAO SEGURA DO RENDER - DEAD IDLE' -ForegroundColor Green
Write-Host ''
Write-Host 'Nada digitado aqui sera exibido ou enviado ao chat.'
Write-Host 'No Neon, desligue Connection pooling e copie a URL direta.'
Write-Host 'No Upstash, copie a URL Redis TLS que comeca com rediss://.'
Write-Host ''

do {
    $databaseUrl = Read-SecretText 'Cole a URL DIRETA do Neon e pressione Enter'

    if ($databaseUrl -notmatch '^postgres(?:ql)?://') {
        Write-Host 'URL invalida: ela deve comecar com postgresql://' -ForegroundColor Yellow
    }
    elseif ($databaseUrl -match '-pooler\.') {
        Write-Host 'Essa e a URL pooled. Desligue Connection pooling no Neon e copie a URL direta.' -ForegroundColor Yellow
    }
} while ($databaseUrl -notmatch '^postgres(?:ql)?://' -or $databaseUrl -match '-pooler\.')

do {
    $redisUrl = Read-SecretText 'Cole a URL TLS do Upstash (rediss://) e pressione Enter'

    if ($redisUrl -notmatch '^rediss://') {
        Write-Host 'URL invalida: use a URL do cliente Redis que comeca com rediss://' -ForegroundColor Yellow
    }
} while ($redisUrl -notmatch '^rediss://')

$jwtSecret = New-HexSecret 64
$metricsToken = New-HexSecret 32
$environmentBlock = @"
DATABASE_URL=$databaseUrl
JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://dead-idle-zumbi.pages.dev
CORS_ALLOWED_ORIGINS=https://dead-idle-zumbi.pages.dev
TRUST_PROXY_HOPS=1
PASSWORD_RESET_EXPOSE_TOKEN=false
E2E_RATE_LIMIT_DISABLED=false
METRICS_TOKEN=$metricsToken
REDIS_URL=$redisUrl
REDIS_COORDINATION_ENABLED=true
SOCKET_REDIS_ADAPTER_ENABLED=false
REDIS_REQUIRED=false
WORLD_BOSS_TEST_UNLOCK_ENABLED=false
"@

Set-Clipboard -Value $environmentBlock
$databaseUrl = $null
$redisUrl = $null
$jwtSecret = $null
$metricsToken = $null
$environmentBlock = $null

Write-Host ''
Write-Host 'Variaveis copiadas para a area de transferencia.' -ForegroundColor Green
Write-Host 'No Render, clique em Add from .env, cole com Ctrl+V e confirme.'
Write-Host 'NAO clique em Deploy Web Service ainda.' -ForegroundColor Yellow
Write-Host ''
Read-Host 'Depois de colar no Render, volte aqui e pressione Enter para limpar a area de transferencia'
Set-Clipboard -Value ''
Write-Host 'Area de transferencia limpa. Esta janela pode ser fechada.' -ForegroundColor Green
Start-Sleep -Seconds 3
