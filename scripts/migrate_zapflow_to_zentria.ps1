# ==============================================================================
# Zentria - Migração de instalações antigas (ZapFlow -> Zentria) [Windows/PowerShell]
# ==============================================================================
# O que este script faz (idempotente / best-effort):
# - Copia variáveis VITE_* do ".env" antigo (na raiz) para "frontend\.env" (novo layout)
# - (Opcional) Atualiza processos do PM2:
#   - Remove processos antigos: zapflow-front / zapflow-backend
#   - Remove processos novos (se existirem): zentria-front / zentria-backend
#   - Sobe novamente zentria-backend e zentria-front (somente se os artefatos existirem)
#
# Importante:
# - Este script NÃO faz build automaticamente por padrão.
# - O frontend agora compila para "frontend\dist" (não mais "dist\" na raiz).
# - O backend continua em "backend\".
# ==============================================================================

param(
  [switch]$RestartPm2
)

$ErrorActionPreference = "Stop"

function Info($msg) { Write-Host "ℹ️  $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "✅ $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Err($msg) { Write-Host "❌ $msg" -ForegroundColor Red }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
Set-Location $ProjectRoot

Info "Projeto: $ProjectRoot"

# ------------------------------------------------------------------------------
# 1) Migrar .env do frontend (Vite)
# ------------------------------------------------------------------------------
$rootEnv = Join-Path $ProjectRoot ".env"
$frontendDir = Join-Path $ProjectRoot "frontend"
$frontendEnv = Join-Path $frontendDir ".env"

if (Test-Path $frontendDir) {
  if ((Test-Path $rootEnv) -and !(Test-Path $frontendEnv)) {
    $viteLines = @()
    try {
      $viteLines = Get-Content $rootEnv | Where-Object { $_ -match '^VITE_' }
    } catch {
      $viteLines = @()
    }

    if ($viteLines.Count -gt 0) {
      Info "Copiando variáveis VITE_* de .env (raiz) -> frontend\.env"
      $viteLines | Out-File -FilePath $frontendEnv -Encoding utf8
      Ok "frontend\.env criado"
    } else {
      Warn "'.env' na raiz existe, mas não contém VITE_*; nada para copiar"
    }
  } else {
    Info "frontend\.env já existe (ou .env raiz não existe) — ok"
  }
} else {
  Warn "Pasta frontend\ não encontrada — este repositório parece incompleto ou antigo"
}

# ------------------------------------------------------------------------------
# 2) PM2 (opcional)
# ------------------------------------------------------------------------------
if ($RestartPm2) {
  $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
  if ($pm2) {
    Info "Atualizando processos PM2 (legado -> novo)..."

    # Remover processos antigos e novos (idempotente)
    pm2 delete zapflow-backend 2>$null | Out-Null
    pm2 delete zapflow-front 2>$null | Out-Null
    pm2 delete zentria-backend 2>$null | Out-Null
    pm2 delete zentria-front 2>$null | Out-Null

    # Backend
    $backendServer = Join-Path $ProjectRoot "backend\server.js"
    if (Test-Path $backendServer) {
      Push-Location (Join-Path $ProjectRoot "backend")
      try {
        pm2 start server.js --name zentria-backend --update-env | Out-Null
      } catch {
        Warn "Falha ao iniciar zentria-backend no PM2"
      } finally {
        Pop-Location
      }
    } else {
      Warn "backend\server.js não encontrado — pulando backend"
    }

    # Frontend (serve)
    $frontendDist = Join-Path $ProjectRoot "frontend\dist"
    if (Test-Path $frontendDist) {
      $serve = Get-Command serve -ErrorAction SilentlyContinue
      if ($serve) {
        Push-Location (Join-Path $ProjectRoot "frontend")
        try {
          pm2 start "serve -s dist -l 5173" --name zentria-front | Out-Null
        } catch {
          Warn "Falha ao iniciar zentria-front no PM2"
        } finally {
          Pop-Location
        }
      } else {
        Warn "'serve' não encontrado. Instale com: npm i -g serve"
        Warn "Depois rode novamente: .\scripts\migrate_zapflow_to_zentria.ps1 -RestartPm2"
      }
    } else {
      Warn "frontend\dist não encontrado. Rode o build antes:"
      Warn "  cd frontend; npm install; npm run build"
    }

    try { pm2 save | Out-Null } catch {}
    Ok "PM2 atualizado (quando aplicável)"
  } else {
    Warn "PM2 não encontrado — nada para reiniciar"
  }
}

Write-Host ""
Ok "Migração best-effort concluída."
Info "Lembrete: o frontend agora compila para frontend\dist"
Info "Se você usa Nginx apontando para dist\ na raiz, ajuste para frontend\dist"


