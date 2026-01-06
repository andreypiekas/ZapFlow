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

# Criar arquivo .env
echo -e "${YELLOW}📝 Criando arquivo .env...${NC}"
echo "VITE_API_URL=http://${SERVER_IP}:${SERVER_PORT}" > .env

echo -e "${GREEN}✅ Arquivo .env criado com sucesso!${NC}"
echo -e "${GREEN}   VITE_API_URL=http://${SERVER_IP}:${SERVER_PORT}${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE: Execute 'npm run build' para aplicar as mudanças!${NC}"

