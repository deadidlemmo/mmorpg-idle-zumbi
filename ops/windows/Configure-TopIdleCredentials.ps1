[CmdletBinding()]
param(
    [switch]$SelfTest
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

function Test-CredentialValue {
    param([string]$Value)

    return $Value -match '^[A-Za-z0-9._~+/=-]+$'
}

function Save-TopIdleCredentials {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$TemplatePath,

        [Parameter(Mandatory = $true)]
        [string]$ApiKey,

        [Parameter(Mandatory = $true)]
        [string]$WebhookSecret
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
    Set-EnvValue -Lines $lines -Name 'TOPIDLE_API_KEY' -Value $ApiKey
    Set-EnvValue -Lines $lines -Name 'TOPIDLE_WEBHOOK_SECRET' -Value $WebhookSecret
    Set-EnvValue -Lines $lines -Name 'TOPIDLE_REWARDS_ENABLED' -Value 'false'

    $temporaryPath = "$Path.topidle.tmp"
    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllLines($temporaryPath, $lines, $encoding)
    [System.IO.File]::Move($temporaryPath, $Path, $true)
}

if ($SelfTest) {
    $testPath = Join-Path (
        [System.IO.Path]::GetTempPath()
    ) "deadidle-topidle-$([System.Guid]::NewGuid().ToString('N')).env"

    try {
        [System.IO.File]::WriteAllLines(
            $testPath,
            [string[]]@('APP_PORT=3000', ''),
            [System.Text.UTF8Encoding]::new($false)
        )
        Save-TopIdleCredentials `
            -Path $testPath `
            -TemplatePath $envExamplePath `
            -ApiKey 'test-api-key' `
            -WebhookSecret 'test-webhook-secret'

        $savedLines = [System.IO.File]::ReadAllLines($testPath)
        $expectedLines = @(
            'TOPIDLE_API_KEY=test-api-key',
            'TOPIDLE_WEBHOOK_SECRET=test-webhook-secret',
            'TOPIDLE_REWARDS_ENABLED=false'
        )
        foreach ($expectedLine in $expectedLines) {
            if ($savedLines -notcontains $expectedLine) {
                throw "Linha ausente no autoteste: $expectedLine"
            }
        }
    }
    finally {
        if ([System.IO.File]::Exists($testPath)) {
            [System.IO.File]::Delete($testPath)
        }
    }

    Write-Output 'Autoteste das credenciais TopIdle concluído.'
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
$form.Text = 'Configurar credenciais do TopIdle'
$form.ClientSize = [System.Drawing.Size]::new(520, 250)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.TopMost = $true

$description = New-Label -Text 'Os valores serão salvos somente em backend/.env e não serão exibidos.' -Top 18
$form.Controls.Add($description)

$apiKeyLabel = New-Label -Text 'Chave da API TopIdle' -Top 54
$form.Controls.Add($apiKeyLabel)

$apiKeyTextBox = [System.Windows.Forms.TextBox]::new()
$apiKeyTextBox.Left = 24
$apiKeyTextBox.Top = 76
$apiKeyTextBox.Width = 472
$apiKeyTextBox.UseSystemPasswordChar = $true
$form.Controls.Add($apiKeyTextBox)

$webhookSecretLabel = New-Label -Text 'Segredo do webhook TopIdle' -Top 112
$form.Controls.Add($webhookSecretLabel)

$webhookSecretTextBox = [System.Windows.Forms.TextBox]::new()
$webhookSecretTextBox.Left = 24
$webhookSecretTextBox.Top = 134
$webhookSecretTextBox.Width = 472
$webhookSecretTextBox.UseSystemPasswordChar = $true
$form.Controls.Add($webhookSecretTextBox)

$statusLabel = New-Label -Text 'A recompensa permanecerá desativada até o teste do webhook.' -Top 174
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(92, 92, 92)
$form.Controls.Add($statusLabel)

$cancelButton = [System.Windows.Forms.Button]::new()
$cancelButton.Text = 'Cancelar'
$cancelButton.Left = 312
$cancelButton.Top = 206
$cancelButton.Width = 88
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelButton)

$saveButton = [System.Windows.Forms.Button]::new()
$saveButton.Text = 'Salvar'
$saveButton.Left = 408
$saveButton.Top = 206
$saveButton.Width = 88
$form.Controls.Add($saveButton)

$form.AcceptButton = $saveButton
$form.CancelButton = $cancelButton

$saveButton.Add_Click({
    $apiKey = $apiKeyTextBox.Text.Trim()
    $webhookSecret = $webhookSecretTextBox.Text.Trim()

    if (-not (Test-CredentialValue -Value $apiKey) -or
        -not (Test-CredentialValue -Value $webhookSecret)) {
        [System.Windows.Forms.MessageBox]::Show(
            'Preencha os dois campos com os valores exatos gerados pelo TopIdle.',
            'Credenciais inválidas',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    try {
        Save-TopIdleCredentials `
            -Path $envPath `
            -TemplatePath $envExamplePath `
            -ApiKey $apiKey `
            -WebhookSecret $webhookSecret
    }
    catch {
        [System.Windows.Forms.MessageBox]::Show(
            'Não foi possível salvar as credenciais. O arquivo não foi alterado.',
            'Falha ao salvar',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
        return
    }

    $apiKeyTextBox.Clear()
    $webhookSecretTextBox.Clear()
    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
})

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    exit 2
}

[System.Windows.Forms.MessageBox]::Show(
    "Credenciais salvas em backend/.env.`nAs recompensas continuam desativadas para homologação.",
    'TopIdle configurado',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
) | Out-Null
