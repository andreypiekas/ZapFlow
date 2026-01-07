#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Zentria - Migração de instalações antigas (ZapFlow -> Zentria)
# ==============================================================================
# O que este script faz (idempotente / best-effort):
# - Copia variáveis VITE_* do ".env" antigo (na raiz) para "frontend/.env" (novo layout)
# - (Opcional) Atualiza processos do PM2:
#   - Remove processos antigos: zapflow-front / zapflow-backend
#   - Remove processos novos (se existirem): zentria-front / zentria-backend
#   - Sobe novamente zentria-backend e zentria-front (somente se os artefatos existirem)
#
# Importante:
# - Este script NÃO faz build automaticamente por padrão.
# - O frontend agora compila para "frontend/dist" (não mais "dist/" na raiz).
# - O backend continua em "backend/".
# ==============================================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
ok() { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
err() { echo -e "${RED}❌ $*${NC}" >&2; }

usage() {
  cat <<'EOF'
Uso:
  ./scripts/migrate_zapflow_to_zentria.sh [--restart-pm2]

Opções:
  --restart-pm2   Atualiza/reinicia processos PM2 (zapflow-* -> zentria-*)
  -h, --help      Mostra esta ajuda

Próximos passos típicos (manual):
  cd frontend && npm install && npm run build
  # depois:
  ./scripts/migrate_zapflow_to_zentria.sh --restart-pm2
EOF
}

RESTART_PM2="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --restart-pm2) RESTART_PM2="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Argumento desconhecido: $1"; usage; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

info "Projeto: $PROJECT_ROOT"

# ------------------------------------------------------------------------------
# 1) Migrar .env do frontend (Vite)
# ------------------------------------------------------------------------------
if [[ -d "$PROJECT_ROOT/frontend" ]]; then
  if [[ -f "$PROJECT_ROOT/.env" && ! -f "$PROJECT_ROOT/frontend/.env" ]]; then
    if grep -q '^VITE_' "$PROJECT_ROOT/.env" 2>/dev/null; then
      info "Copiando variáveis VITE_* de .env (raiz) -> frontend/.env"
      grep '^VITE_' "$PROJECT_ROOT/.env" > "$PROJECT_ROOT/frontend/.env" || true
      ok "frontend/.env criado"
    else
      warn "'.env' na raiz existe, mas não contém VITE_*; nada para copiar"
    fi
  else
    info "frontend/.env já existe (ou .env raiz não existe) — ok"
  fi
else
  warn "Pasta frontend/ não encontrada — este repositório parece incompleto ou antigo"
fi

# ------------------------------------------------------------------------------
# 2) PM2 (opcional)
# ------------------------------------------------------------------------------
if [[ "$RESTART_PM2" == "true" ]]; then
  if command -v pm2 >/dev/null 2>&1; then
    info "Atualizando processos PM2 (legado -> novo)..."

    # Remover processos antigos e novos (idempotente)
    pm2 delete zapflow-backend 2>/dev/null || true
    pm2 delete zapflow-front 2>/dev/null || true
    pm2 delete zentria-backend 2>/dev/null || true
    pm2 delete zentria-front 2>/dev/null || true

    # Backend
    if [[ -f "$PROJECT_ROOT/backend/server.js" ]]; then
      (cd "$PROJECT_ROOT/backend" && pm2 start server.js --name zentria-backend --update-env) || warn "Falha ao iniciar zentria-backend no PM2"
    else
      warn "backend/server.js não encontrado — pulando backend"
    fi

    # Frontend (serve)
    if [[ -d "$PROJECT_ROOT/frontend/dist" ]]; then
      if command -v serve >/dev/null 2>&1; then
        (cd "$PROJECT_ROOT/frontend" && pm2 start "serve -s dist -l 5173" --name zentria-front) || warn "Falha ao iniciar zentria-front no PM2"
      else
        warn "'serve' não encontrado. Instale com: npm i -g serve"
        warn "Depois rode novamente com --restart-pm2"
      fi
    else
      warn "frontend/dist não encontrado. Rode o build antes:"
      warn "  cd frontend && npm install && npm run build"
    fi

    pm2 save 2>/dev/null || true
    ok "PM2 atualizado (quando aplicável)"
  else
    warn "PM2 não encontrado — nada para reiniciar"
  fi
fi

echo ""
ok "Migração best-effort concluída."
info "Lembrete: o frontend agora compila para frontend/dist"
info "Se você usa Nginx apontando para dist/ na raiz, ajuste para frontend/dist"


