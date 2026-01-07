#!/bin/bash

# Script para restaurar o arquivo .env do frontend
# Uso: ./scripts/restore-env.sh [IP_DO_SERVIDOR]

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Obter IP do servidor
if [ -z "$1" ]; then
    # Tentar descobrir o IP automaticamente
    SERVER_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || ip addr show | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}' | cut -d/ -f1)
    
    if [ -z "$SERVER_IP" ]; then
        echo -e "${RED}❌ Não foi possível detectar o IP do servidor automaticamente.${NC}"
        echo -e "${YELLOW}Por favor, forneça o IP manualmente:${NC}"
        echo -e "${YELLOW}   ./scripts/restore-env.sh SEU_IP_SERVIDOR${NC}"
        exit 1
    fi
else
    SERVER_IP="$1"
fi

# Porta padrão
SERVER_PORT="${SERVER_PORT:-3001}"

# Resolver raiz do projeto e destino do .env do frontend (Vite)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Em layout novo (monorepo), o Vite lê variáveis em frontend/.env.
# Em layout antigo, mantemos compat com .env na raiz.
ENV_TARGET="$PROJECT_ROOT/.env"
if [ -d "$PROJECT_ROOT/frontend" ] && [ -f "$PROJECT_ROOT/frontend/package.json" ]; then
    ENV_TARGET="$PROJECT_ROOT/frontend/.env"
fi

# Criar arquivo .env
echo -e "${YELLOW}📝 Criando arquivo .env em: ${ENV_TARGET}${NC}"
echo "VITE_API_URL=http://${SERVER_IP}:${SERVER_PORT}" > "$ENV_TARGET"

echo -e "${GREEN}✅ Arquivo .env criado com sucesso!${NC}"
echo -e "${GREEN}   VITE_API_URL=http://${SERVER_IP}:${SERVER_PORT}${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE: Execute 'npm run build' para aplicar as mudanças!${NC}"

