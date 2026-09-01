[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('MercadoPago', 'Stripe')]
    [string]$Provider,

    [switch]$SelfTest,

    [ValidateSet('Any', 'Test', 'Live')]
    [string]$RequiredMode = 'Any',

    [ValidateSet('Enable', 'Disable')]
    [string]$CheckoutState
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$repositoryRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\..')
)
$backendDirectory = Join-Path $repositoryRoot 'backend'
$envPath = Join-Path $backendDirectory '.env'
$envExamplePath = Join-Path $backendDirectory '.env.example'

function Set-EnvValue {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [AllowEmptyString()]
        [System.Collections.Generic.List[string]]$Lines,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $newLine = "$Name=$Value"
    for ($index = 0; $index -lt $Lines.Count; $index += 1) {
        if ($Lines[$index].StartsWith("$Name=", [System.StringComparison]::Ordinal)) {
            $Lines[$index] = $newLine
            return
        }
    }

    $Lines.Add($newLine)
}

function Get-EnvValue {
    param(
        [string]$Path,
        [string]$Name
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if ($line.StartsWith("$Name=", [System.StringComparison]::Ordinal)) {
            return $line.Substring($Name.Length + 1).Trim().Trim('"')
        }
    }

    return $null
}

function Test-CredentialCharacters {
    param([string]$Value)

    return $Value.Length -ge 12 -and $Value -match '^[A-Za-z0-9._~+/=-]+$'
}

function Get-CredentialMode {
    param(
        [string]$ProviderName,
        [string]$SecretKey
    )

    if ($ProviderName -eq 'MercadoPago') {
        if ($SecretKey.StartsWith('TEST-', [System.StringComparison]::OrdinalIgnoreCase)) {
            return 'TEST'
        }
        if ($SecretKey.StartsWith('APP_USR-', [System.StringComparison]::OrdinalIgnoreCase)) {
            return 'LIVE'
        }
        return 'UNKNOWN'
    }

    if ($SecretKey.StartsWith('sk_test_', [System.StringComparison]::OrdinalIgnoreCase)) {
        return 'TEST'
    }
    if ($SecretKey.StartsWith('sk_live_', [System.StringComparison]::OrdinalIgnoreCase)) {
        return 'LIVE'
    }
    return 'UNKNOWN'
}

function Get-ProviderDefinition {
    param([string]$ProviderName)

    if ($ProviderName -eq 'MercadoPago') {
        return @{
            DisplayName = 'Mercado Pago'
            KeyName = 'MERCADO_PAGO_ACCESS_TOKEN'
            KeyLabel = 'Access Token (TEST-... ou APP_USR-...)'
            SecretName = 'MERCADO_PAGO_WEBHOOK_SECRET'
            SecretLabel = 'Assinatura secreta do webhook'
            EnabledName = 'MERCADO_PAGO_CHECKOUT_ENABLED'
            OtherProvider = 'Stripe'
            OtherKeyName = 'STRIPE_SECRET_KEY'
            OtherEnabledName = 'STRIPE_CHECKOUT_ENABLED'
            WebhookUrl = 'https://deadidle-api.botpokeidle.com.br/storefront/webhooks/mercado-pago'
        }
    }

    return @{
        DisplayName = 'Stripe'
        KeyName = 'STRIPE_SECRET_KEY'
        KeyLabel = 'Secret Key (sk_test_... ou sk_live_...)'
        SecretName = 'STRIPE_WEBHOOK_SECRET'
        SecretLabel = 'Signing secret do endpoint (whsec_...)'
        EnabledName = 'STRIPE_CHECKOUT_ENABLED'
        OtherProvider = 'MercadoPago'
        OtherKeyName = 'MERCADO_PAGO_ACCESS_TOKEN'
        OtherEnabledName = 'MERCADO_PAGO_CHECKOUT_ENABLED'
        WebhookUrl = 'https://deadidle-api.botpokeidle.com.br/storefront/webhooks/stripe'
    }
}

function Test-ProviderCredentials {
    param(
        [string]$ProviderName,
        [string]$SecretKey,
        [string]$WebhookSecret
    )

    if (-not (Test-CredentialCharacters -Value $SecretKey) -or
        -not (Test-CredentialCharacters -Value $WebhookSecret)) {
        return $false
    }

    if ($ProviderName -eq 'Stripe') {
        return ($SecretKey -match '^sk_(test|live)_' -and
            $WebhookSecret.StartsWith('whsec_', [System.StringComparison]::Ordinal))
    }

    return $true
}

function Test-StripeSecretKeyOnline {
    param([string]$SecretKey)

    try {
        $response = Invoke-WebRequest `
            -Uri 'https://api.stripe.com/v1/account' `
            -Method Get `
            -Headers @{ Authorization = "Bearer $SecretKey" } `
            -TimeoutSec 20 `
            -UseBasicParsing
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Save-PaymentCredentials {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$TemplatePath,

        [Parameter(Mandatory = $true)]
        [string]$KeyName,

        [Parameter(Mandatory = $true)]
        [string]$SecretKey,

        [Parameter(Mandatory = $true)]
        [string]$SecretName,

        [Parameter(Mandatory = $true)]
        [string]$WebhookSecret,

        [Parameter(Mandatory = $true)]
        [string]$EnabledName,

        [bool]$CheckoutEnabled = $false
    )

    if (Test-Path -LiteralPath $Path) {
        $existingLines = [System.IO.File]::ReadAllLines($Path)
    }
    elseif (Test-Path -LiteralPath $TemplatePath) {
        $existingLines = [System.IO.File]::ReadAllLines($TemplatePath)
    }
    else {
        $existingLines = @()
    }

    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.AddRange([string[]]$existingLines)
    Set-EnvValue -Lines $lines -Name $KeyName -Value $SecretKey
    Set-EnvValue -Lines $lines -Name $SecretName -Value $WebhookSecret
    Set-EnvValue `
        -Lines $lines `
        -Name $EnabledName `
        -Value $CheckoutEnabled.ToString().ToLowerInvariant()

    $temporaryPath = "$Path.payments.$([System.Guid]::NewGuid().ToString('N')).tmp"
    $backupPath = "$Path.payments.$([System.Guid]::NewGuid().ToString('N')).bak"
    try {
        $encoding = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllLines($temporaryPath, $lines, $encoding)
        if ([System.IO.File]::Exists($Path)) {
            [System.IO.File]::Replace($temporaryPath, $Path, $backupPath)
        }
        else {
            [System.IO.File]::Move($temporaryPath, $Path)
        }
    }
    finally {
        if ([System.IO.File]::Exists($temporaryPath)) {
            [System.IO.File]::Delete($temporaryPath)
        }
        if ([System.IO.File]::Exists($backupPath)) {
            [System.IO.File]::Delete($backupPath)
        }
    }
}

if ($SelfTest) {
    $testPath = Join-Path (
        [System.IO.Path]::GetTempPath()
    ) "deadidle-payments-$([System.Guid]::NewGuid().ToString('N')).env"

    try {
        [System.IO.File]::WriteAllLines(
            $testPath,
            [string[]]@('APP_PORT=3000', ''),
            [System.Text.UTF8Encoding]::new($false)
        )
        Save-PaymentCredentials `
            -Path $testPath `
            -TemplatePath $envExamplePath `
            -KeyName 'MERCADO_PAGO_ACCESS_TOKEN' `
            -SecretKey 'TEST-deadidle-access-token' `
            -SecretName 'MERCADO_PAGO_WEBHOOK_SECRET' `
            -WebhookSecret 'deadidle-webhook-secret' `
            -EnabledName 'MERCADO_PAGO_CHECKOUT_ENABLED'
        Save-PaymentCredentials `
            -Path $testPath `
            -TemplatePath $envExamplePath `
            -KeyName 'STRIPE_SECRET_KEY' `
            -SecretKey 'sk_test_deadidle-secret-key' `
            -SecretName 'STRIPE_WEBHOOK_SECRET' `
            -WebhookSecret 'whsec_deadidle-webhook-secret' `
            -EnabledName 'STRIPE_CHECKOUT_ENABLED'

        $expectedValues = @{
            MERCADO_PAGO_ACCESS_TOKEN = 'TEST-deadidle-access-token'
            MERCADO_PAGO_WEBHOOK_SECRET = 'deadidle-webhook-secret'
            STRIPE_SECRET_KEY = 'sk_test_deadidle-secret-key'
            STRIPE_WEBHOOK_SECRET = 'whsec_deadidle-webhook-secret'
            MERCADO_PAGO_CHECKOUT_ENABLED = 'false'
            STRIPE_CHECKOUT_ENABLED = 'false'
        }
        foreach ($entry in $expectedValues.GetEnumerator()) {
            $savedValue = Get-EnvValue -Path $testPath -Name $entry.Key
            if ($savedValue -ne $entry.Value) {
                throw "Valor ausente no autoteste: $($entry.Key)"
            }
        }
    }
    finally {
        if ([System.IO.File]::Exists($testPath)) {
            [System.IO.File]::Delete($testPath)
        }
    }

    Write-Output 'Autoteste do configurador de pagamentos concluido.'
    exit 0
}

$definition = Get-ProviderDefinition -ProviderName $Provider

if ($CheckoutState) {
    $secretKey = Get-EnvValue -Path $envPath -Name $definition.KeyName
    $webhookSecret = Get-EnvValue -Path $envPath -Name $definition.SecretName
    if (-not $secretKey -or -not $webhookSecret) {
        throw "Configure as credenciais de $($definition.DisplayName) antes de alterar o estado do checkout."
    }

    if ($CheckoutState -eq 'Enable') {
        $mode = Get-CredentialMode -ProviderName $Provider -SecretKey $secretKey
        $otherKey = Get-EnvValue -Path $envPath -Name $definition.OtherKeyName
        $otherEnabled = Get-EnvValue `
            -Path $envPath `
            -Name $definition.OtherEnabledName
        if ($otherKey -and $otherEnabled -eq 'true') {
            $otherMode = Get-CredentialMode `
                -ProviderName $definition.OtherProvider `
                -SecretKey $otherKey
            if ($mode -ne 'UNKNOWN' -and
                $otherMode -ne 'UNKNOWN' -and
                $mode -ne $otherMode) {
                throw 'Nao e seguro ativar provedores de teste e producao ao mesmo tempo.'
            }
        }
    }

    Save-PaymentCredentials `
        -Path $envPath `
        -TemplatePath $envExamplePath `
        -KeyName $definition.KeyName `
        -SecretKey $secretKey `
        -SecretName $definition.SecretName `
        -WebhookSecret $webhookSecret `
        -EnabledName $definition.EnabledName `
        -CheckoutEnabled ($CheckoutState -eq 'Enable')

    Write-Output "$($definition.DisplayName): checkout $($CheckoutState.ToLowerInvariant())."
    exit 0
}

function New-Label {
    param(
        [string]$Text,
        [int]$Top
    )

    $label = [System.Windows.Forms.Label]::new()
    $label.AutoSize = $true
    $label.Left = 24
    $label.Top = $Top
    $label.Text = $Text
    return $label
}

$form = [System.Windows.Forms.Form]::new()
$form.Text = "Configurar $($definition.DisplayName) no Dead Idle"
$form.ClientSize = [System.Drawing.Size]::new(590, 326)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.TopMost = $true

$description = New-Label `
    -Text 'Os valores ficam mascarados e serão salvos somente em backend/.env.' `
    -Top 18
$form.Controls.Add($description)

$recommendationText = if ($RequiredMode -eq 'Live') {
    'Use a Secret key LIVE completa de Developers > API keys e o segredo do endpoint LIVE.'
}
elseif ($RequiredMode -eq 'Test') {
    'Use as credenciais de TESTE deste endpoint. Nenhuma cobrança será criada por este assistente.'
}
else {
    'Use primeiro credenciais de teste. Nenhuma cobrança será criada por este assistente.'
}
$recommendation = New-Label `
    -Text $recommendationText `
    -Top 42
$recommendation.ForeColor = [System.Drawing.Color]::FromArgb(82, 82, 82)
$form.Controls.Add($recommendation)

$keyLabel = New-Label -Text $definition.KeyLabel -Top 76
$form.Controls.Add($keyLabel)

$keyTextBox = [System.Windows.Forms.TextBox]::new()
$keyTextBox.Left = 24
$keyTextBox.Top = 98
$keyTextBox.Width = 542
$keyTextBox.UseSystemPasswordChar = $true
$form.Controls.Add($keyTextBox)

$secretLabel = New-Label -Text $definition.SecretLabel -Top 134
$form.Controls.Add($secretLabel)

$secretTextBox = [System.Windows.Forms.TextBox]::new()
$secretTextBox.Left = 24
$secretTextBox.Top = 156
$secretTextBox.Width = 542
$secretTextBox.UseSystemPasswordChar = $true
$form.Controls.Add($secretTextBox)

$webhookLabel = New-Label -Text 'Webhook HTTPS cadastrado no provedor' -Top 194
$form.Controls.Add($webhookLabel)

$webhookTextBox = [System.Windows.Forms.TextBox]::new()
$webhookTextBox.Left = 24
$webhookTextBox.Top = 216
$webhookTextBox.Width = 542
$webhookTextBox.ReadOnly = $true
$webhookTextBox.Text = $definition.WebhookUrl
$form.Controls.Add($webhookTextBox)

$cancelButton = [System.Windows.Forms.Button]::new()
$cancelButton.Text = 'Cancelar'
$cancelButton.Left = 382
$cancelButton.Top = 270
$cancelButton.Width = 88
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelButton)

$saveButton = [System.Windows.Forms.Button]::new()
$saveButton.Text = 'Salvar'
$saveButton.Left = 478
$saveButton.Top = 270
$saveButton.Width = 88
$form.Controls.Add($saveButton)

$form.AcceptButton = $saveButton
$form.CancelButton = $cancelButton

$saveButton.Add_Click({
    $secretKey = $keyTextBox.Text.Trim()
    $webhookSecret = $secretTextBox.Text.Trim()

    if (-not (Test-ProviderCredentials `
        -ProviderName $Provider `
        -SecretKey $secretKey `
        -WebhookSecret $webhookSecret)) {
        [System.Windows.Forms.MessageBox]::Show(
            'Revise os dois valores. A Stripe exige sk_test_/sk_live_ e whsec_; no Mercado Pago, copie o Access Token e a assinatura secreta completos.',
            'Credenciais invalidas',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    $mode = Get-CredentialMode -ProviderName $Provider -SecretKey $secretKey
    if ($RequiredMode -ne 'Any' -and $mode -ne $RequiredMode.ToUpperInvariant()) {
        [System.Windows.Forms.MessageBox]::Show(
            "Esta etapa exige credenciais $($RequiredMode.ToUpperInvariant()). Revise a chave informada.",
            'Modo incorreto',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }
    if ($Provider -eq 'Stripe' -and
        -not (Test-StripeSecretKeyOnline -SecretKey $secretKey)) {
        [System.Windows.Forms.MessageBox]::Show(
            'A Stripe recusou esta Secret Key. Copie a chave secreta completa em Developers > API keys. Nao use Publishable key, Restricted key nem valor oculto.',
            'Secret Key recusada pela Stripe',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }
    if ($mode -eq 'LIVE') {
        $confirmation = [System.Windows.Forms.MessageBox]::Show(
            'Esta chave parece ser de producao. Depois que o backend reiniciar, compras reais poderao ser abertas. Deseja salvar?',
            'Confirmar credencial de producao',
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        )
        if ($confirmation -ne [System.Windows.Forms.DialogResult]::Yes) {
            return
        }
    }

    try {
        Save-PaymentCredentials `
            -Path $envPath `
            -TemplatePath $envExamplePath `
            -KeyName $definition.KeyName `
            -SecretKey $secretKey `
            -SecretName $definition.SecretName `
            -WebhookSecret $webhookSecret `
            -EnabledName $definition.EnabledName
    }
    catch {
        [System.Windows.Forms.MessageBox]::Show(
            'Nao foi possivel salvar as credenciais. O arquivo anterior foi preservado.',
            'Falha ao salvar',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
        return
    }

    $keyTextBox.Clear()
    $secretTextBox.Clear()
    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
})

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    exit 2
}

[System.Windows.Forms.MessageBox]::Show(
    "Credenciais de $($definition.DisplayName) salvas em backend/.env.`nO backend precisa ser validado e reiniciado para ativar o provedor.",
    "$($definition.DisplayName) configurado",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
) | Out-Null
