#!/bin/bash

# Script para gerar docker-compose.yml com IP correto do servidor
# Uso: ./scripts/generate-docker-compose.sh [IP_DO_SERVIDOR]

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
        echo -e "${YELLOW}   ./scripts/generate-docker-compose.sh 192.168.101.234${NC}"
        exit 1
    fi
else
    SERVER_IP="$1"
fi

echo -e "${YELLOW}📝 Gerando docker-compose.yml com IP: ${SERVER_IP}${NC}"

cat > docker-compose.yml <<EOL
services:
  evolution_api:
    image: evoapicloud/evolution-api:latest
    container_name: evolution_api
    restart: always
    shm_size: '2gb'
    dns:
      - 8.8.8.8
      - 8.8.4.4
    ports:
      - "8080:8080"
    environment:
      - SERVER_PORT=8080
      - SERVER_URL=http://${SERVER_IP}:8080
      - AUTHENTICATION_API_KEY=B8349283-F143-429D-B6C2-9386E8016558
      - WEBSOCKET_ENABLED=true
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://user:password@evolution_postgres:5432/evolution
      - DATABASE_CLIENT_NAME=evolution_exchange
      - RABBITMQ_ENABLED=false
      - CACHE_REDIS_ENABLED=true
      - CACHE_REDIS_URI=redis://evolution_redis:6379/0
      - DEL_INSTANCE=false
      - STORE_MESSAGES=true
      - STORE_MESSAGE_UP=true
      - STORE_CONTACTS=true
      - STORE_CHATS=true
      - CONFIG_SESSION_PHONE_CLIENT=Zentria
      - CONFIG_SESSION_PHONE_NAME=Chrome
      - CONFIG_SESSION_PHONE_OS=Windows
      - CONFIG_SESSION_PHONE_SYNC_FULL_HISTORY=false
      - BROWSER_ARGS=["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-accelerated-2d-canvas","--no-first-run","--disable-gpu","--disable-software-rasterizer"]
      - CORS_ORIGIN=*
      - CORS_METHODS=POST,GET,PUT,DELETE,OPTIONS
      - CORS_CREDENTIALS=true
    depends_on:
      evolution_postgres:
        condition: service_healthy
      evolution_redis:
        condition: service_started

  evolution_postgres:
    image: postgres:15-alpine
    container_name: evolution_postgres
    restart: always
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=evolution
    volumes:
      - evolution_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d evolution || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  evolution_redis:
    image: redis:alpine
    container_name: evolution_redis
    restart: always
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - evolution_redis_data:/data

volumes:
  evolution_postgres_data:
  evolution_redis_data:
EOL

echo -e "${GREEN}✅ Arquivo docker-compose.yml criado com sucesso!${NC}"
echo -e "${GREEN}   SERVER_URL=http://${SERVER_IP}:8080${NC}"

