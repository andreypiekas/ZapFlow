<#
  ==============================================================================
  🔒 ZENTRIA - HTTPS POR IP (AUTOCONFIG - WINDOWS)
  ==============================================================================
  Este script é um helper para WINDOWS para confiar no certificado self-signed
  gerado no servidor Linux pelo `install/https_autoconfig.sh`.

  Uso (PowerShell como Administrador):
    1) Copie o certificado para o seu PC (ex.: zentria-ip.crt)
    2) Execute:
       .\install\https_autoconfig.ps1 -CertPath .\zentria-ip.crt

  O script importa o certificado em:
    Cert:\LocalMachine\Root (Autoridades de Certificação Raiz Confiáveis)

  Observação:
    - Isso remove o aviso de certificado no navegador ao acessar https://<IP>.
    - Se você preferir importar manualmente, use o "certmgr.msc".
  ==============================================================================
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$CertPath = "$PSScriptRoot\..\certs\zentria-ip.crt",

  [Parameter(Mandatory = $false)]
  [ValidateSet("LocalMachineRoot", "CurrentUserRoot")]
  [string]$TargetStore = "LocalMachineRoot"
)

function Test-IsAdmin {
  try {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

$resolvedPath = Resolve-Path -Path $CertPath -ErrorAction SilentlyContinue
if (-not $resolvedPath) {
  Write-Error "Certificado não encontrado em: $CertPath"
  exit 1
}

if ($TargetStore -eq "LocalMachineRoot" -and -not (Test-IsAdmin)) {
  Write-Error "Execute este script como Administrador para importar no LocalMachine\Root."
  exit 1
}

$store = if ($TargetStore -eq "LocalMachineRoot") { "Cert:\LocalMachine\Root" } else { "Cert:\CurrentUser\Root" }

Write-Host "========================================"
Write-Host "  Zentria - Importar Certificado (HTTPS por IP)"
Write-Host "========================================"
Write-Host ""
Write-Host "Cert:  $($resolvedPath.Path)"
Write-Host "Store: $store"
Write-Host ""

try {
  $result = Import-Certificate -FilePath $resolvedPath.Path -CertStoreLocation $store
  if ($result -and $result.Certificate) {
    Write-Host "✅ Certificado importado com sucesso!" -ForegroundColor Green
    Write-Host "   Subject: $($result.Certificate.Subject)"
    Write-Host "   Thumbprint: $($result.Certificate.Thumbprint)"
    Write-Host ""
    Write-Host "Agora reabra o navegador e acesse https://<IP>."
    exit 0
  }

  Write-Error "Falha ao importar certificado (resultado vazio)."
  exit 1
} catch {
  Write-Error "Erro ao importar certificado: $($_.Exception.Message)"
  exit 1
}


