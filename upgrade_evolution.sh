#!/bin/bash

# ==============================================================================
# 🔄 SCRIPT DE UPGRADE - EVOLUTION API
# ==============================================================================
# Atualiza Evolution API de v2.2.3 (ou qualquer versão) para latest
# Mantém dados do banco de dados e configurações existentes
# ==============================================================================

set -e

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configurações
OLD_VERSION="v2.2.3"
NEW_VERSION="latest"
NEW_IMAGE="atendai/evolution-api:${NEW_VERSION}"

API_CONTAINER="evolution_api"
POSTGRES_CONTAINER="evolution_postgres"
REDIS_CONTAINER="evolution_redis"

POSTGRES_USER="user"
POSTGRES_PASSWORD="password"
POSTGRES_DB="evolution"

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ==============================================================================
# FUNÇÕES AUXILIARES
# ==============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker não está instalado!"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker não está rodando ou você não tem permissão!"
        exit 1
    fi
    
    print_success "Docker está instalado e rodando"
}

check_containers() {
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${API_CONTAINER}$"; then
        print_error "Container ${API_CONTAINER} não encontrado!"
        print_warning "Execute o script de instalação primeiro (setup_evolution.txt)"
        exit 1
    fi
    print_success "Containers encontrados"
}

detect_current_version() {
    if [ -f "docker-compose.yml" ]; then
        CURRENT_IMAGE=$(grep -E "image:.*evolution-api" docker-compose.yml | awk '{print $2}' | tr -d '"' || echo "")
        if [ ! -z "$CURRENT_IMAGE" ]; then
            CURRENT_VERSION=$(echo $CURRENT_IMAGE | cut -d':' -f2)
            print_success "Versão atual detectada: ${CURRENT_VERSION}"
            return 0
        fi
    fi
    
    # Tentar detectar pela imagem do container
    if docker inspect ${API_CONTAINER} &> /dev/null; then
        CURRENT_IMAGE=$(docker inspect ${API_CONTAINER} --format='{{.Config.Image}}' 2>/dev/null || echo "")
        if [ ! -z "$CURRENT_IMAGE" ]; then
            CURRENT_VERSION=$(echo $CURRENT_IMAGE | cut -d':' -f2)
            print_success "Versão atual detectada: ${CURRENT_VERSION}"
            return 0
        fi
    fi
    
    print_warning "Não foi possível detectar versão atual, assumindo ${OLD_VERSION}"
    CURRENT_VERSION="${OLD_VERSION}"
    return 1
}

# ==============================================================================
# BACKUP
# ==============================================================================

create_backup() {
    print_header "CRIANDO BACKUP"
    
    # Criar diretório de backup
    mkdir -p "${BACKUP_DIR}"
    
    # Backup do docker-compose.yml
    if [ -f "docker-compose.yml" ]; then
        cp docker-compose.yml "${BACKUP_DIR}/docker-compose.yml.${TIMESTAMP}"
        print_success "docker-compose.yml backup criado"
    fi
    
    # Backup do banco de dados PostgreSQL
    if docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
        print_header "Backup do Banco de Dados PostgreSQL"
        
        BACKUP_FILE="${BACKUP_DIR}/evolution_db_${TIMESTAMP}.sql"
        
        echo "Aguardando PostgreSQL estar pronto..."
        until docker exec ${POSTGRES_CONTAINER} pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB} > /dev/null 2>&1; do
            echo -n "."
            sleep 1
        done
        echo ""
        
        print_success "PostgreSQL está pronto"
        
        docker exec ${POSTGRES_CONTAINER} pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} > "${BACKUP_FILE}" 2>/dev/null
        
        if [ -f "${BACKUP_FILE}" ] && [ -s "${BACKUP_FILE}" ]; then
            print_success "Backup do banco criado: ${BACKUP_FILE}"
            BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
            echo "  Tamanho: ${BACKUP_SIZE}"
        else
            print_warning "Backup do banco pode estar vazio ou falhou"
        fi
    else
        print_warning "Container PostgreSQL não encontrado, pulando backup do banco"
    fi
    
    # Criar arquivo de informações do backup
    cat > "${BACKUP_DIR}/backup_info_${TIMESTAMP}.txt" <<EOF
Backup criado em: $(date)
Versão anterior: ${CURRENT_VERSION}
Nova versão: ${NEW_VERSION}
Arquivos:
- docker-compose.yml.${TIMESTAMP}
- evolution_db_${TIMESTAMP}.sql
EOF
    
    print_success "Backup completo salvo em: ${BACKUP_DIR}/"
}

# ==============================================================================
# ATUALIZAÇÃO
# ==============================================================================

update_docker_compose() {
    print_header "ATUALIZANDO DOCKER-COMPOSE.YML"
    
    if [ ! -f "docker-compose.yml" ]; then
        print_error "docker-compose.yml não encontrado!"
        print_warning "Criando novo docker-compose.yml baseado em setup_evolution.txt"
        
        # Detectar IP do servidor
        SERVER_IP=$(hostname -I | awk '{print $1}')
        if [ -z "$SERVER_IP" ]; then
            SERVER_IP="localhost"
        fi
        
        # Criar docker-compose.yml baseado no setup_evolution.txt
        cat > docker-compose.yml <<EOL
services:
  evolution_api:
    image: ${NEW_IMAGE}
    container_name: ${API_CONTAINER}
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
      - DATABASE_CONNECTION_URI=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_CONTAINER}:5432/${POSTGRES_DB}
      - DATABASE_CLIENT_NAME=evolution_exchange
      - RABBITMQ_ENABLED=false
      - CACHE_REDIS_ENABLED=true
      - CACHE_REDIS_URI=redis://${REDIS_CONTAINER}:6379/0
      - DEL_INSTANCE=false
      - CONFIG_SESSION_PHONE_CLIENT=ZapFlow
      - CONFIG_SESSION_PHONE_NAME=Chrome
      - CONFIG_SESSION_PHONE_OS=Windows
      - CONFIG_SESSION_PHONE_VERSION=2.3000.1029255529
      - CONFIG_SESSION_PHONE_SYNC_FULL_HISTORY=false
      - CONFIG_SESSION_PHONE_REJECT_CALL=true
      - CONFIG_SESSION_PHONE_MSG_CALL="Não aceitamos chamadas por aqui. Por favor, envie texto."
      - BROWSER_ARGS=["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-accelerated-2d-canvas","--no-first-run","--disable-gpu","--disable-software-rasterizer"]
      - CORS_ORIGIN=*
      - CORS_METHODS=POST,GET,PUT,DELETE,OPTIONS
      - CORS_CREDENTIALS=true
    depends_on:
      - ${POSTGRES_CONTAINER}
      - ${REDIS_CONTAINER}

  ${POSTGRES_CONTAINER}:
    image: postgres:15-alpine
    container_name: ${POSTGRES_CONTAINER}
    restart: always
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
    volumes:
      - evolution_postgres_data:/var/lib/postgresql/data

  ${REDIS_CONTAINER}:
    image: redis:alpine
    container_name: ${REDIS_CONTAINER}
    restart: always
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - evolution_redis_data:/data

volumes:
  evolution_postgres_data:
  evolution_redis_data:
EOL
        print_success "Novo docker-compose.yml criado"
        return
    fi
    
    # Atualizar imagem no docker-compose.yml existente
    if grep -q "image:.*evolution-api" docker-compose.yml; then
        # Backup antes de modificar
        cp docker-compose.yml docker-compose.yml.bak
        
        # Atualizar versão da imagem
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|image:.*evolution-api:.*|image: ${NEW_IMAGE}|g" docker-compose.yml
        else
            # Linux
            sed -i "s|image:.*evolution-api:.*|image: ${NEW_IMAGE}|g" docker-compose.yml
        fi
        
        print_success "docker-compose.yml atualizado para ${NEW_VERSION}"
    else
        print_warning "Não foi possível encontrar referência à imagem no docker-compose.yml"
        print_warning "Verifique manualmente se a imagem está correta"
    fi
}

pull_new_image() {
    print_header "BAIXANDO NOVA IMAGEM"
    
    print_warning "Baixando ${NEW_IMAGE} (isso pode levar alguns minutos)..."
    docker pull ${NEW_IMAGE}
    
    if [ $? -eq 0 ]; then
        print_success "Imagem ${NEW_VERSION} baixada com sucesso"
    else
        print_error "Falha ao baixar imagem ${NEW_IMAGE}"
        exit 1
    fi
}

stop_containers() {
    print_header "PARANDO CONTAINERS"
    
    # Parar apenas o container da API, manter Postgres e Redis rodando
    if docker ps --format '{{.Names}}' | grep -q "^${API_CONTAINER}$"; then
        docker stop ${API_CONTAINER}
        print_success "Container ${API_CONTAINER} parado"
    fi
    
    # Se estiver usando docker-compose
    if [ -f "docker-compose.yml" ] && command -v docker-compose &> /dev/null; then
        docker-compose stop ${API_CONTAINER} 2>/dev/null || true
    fi
}

start_containers() {
    print_header "INICIANDO CONTAINERS"
    
    if [ -f "docker-compose.yml" ]; then
        if command -v docker-compose &> /dev/null; then
            docker-compose up -d
        else
            docker compose up -d
        fi
        
        if [ $? -eq 0 ]; then
            print_success "Containers iniciados"
        else
            print_error "Falha ao iniciar containers"
            exit 1
        fi
    else
        print_error "docker-compose.yml não encontrado!"
        exit 1
    fi
}

wait_for_services() {
    print_header "AGUARDANDO SERVIÇOS FICAREM PRONTOS"
    
    # Aguardar PostgreSQL
    echo "Aguardando PostgreSQL..."
    until docker exec ${POSTGRES_CONTAINER} pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB} > /dev/null 2>&1; do
        echo -n "."
        sleep 2
    done
    echo ""
    print_success "PostgreSQL está pronto"
    
    # Aguardar Evolution API
    echo "Aguardando Evolution API..."
    MAX_WAIT=60
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if docker exec ${API_CONTAINER} curl -s http://localhost:8080/health > /dev/null 2>&1; then
            print_success "Evolution API está respondendo"
            return 0
        fi
        echo -n "."
        sleep 2
        WAIT_COUNT=$((WAIT_COUNT + 2))
    done
    echo ""
    print_warning "Evolution API pode ainda estar inicializando (verifique os logs)"
}

# ==============================================================================
# VERIFICAÇÃO
# ==============================================================================

verify_upgrade() {
    print_header "VERIFICANDO UPGRADE"
    
    # Verificar versão do container
    CONTAINER_IMAGE=$(docker inspect ${API_CONTAINER} --format='{{.Config.Image}}' 2>/dev/null || echo "")
    if [[ "$CONTAINER_IMAGE" == *"${NEW_VERSION}"* ]]; then
        print_success "Container está usando ${NEW_VERSION}"
    else
        print_warning "Container pode não estar usando a versão correta: ${CONTAINER_IMAGE}"
    fi
    
    # Verificar status dos containers
    echo ""
    echo "Status dos containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "evolution|NAMES"
    
    # Verificar logs recentes
    echo ""
    echo "Últimas linhas dos logs do Evolution API:"
    docker logs ${API_CONTAINER} --tail 10 2>&1 | tail -5
    
    # Testar endpoint da API
    echo ""
    echo "Testando endpoint da API..."
    if command -v curl &> /dev/null; then
        API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/instance/fetchInstances -H "apikey: B8349283-F143-429D-B6C2-9386E8016558" 2>/dev/null || echo "000")
        if [ "$API_RESPONSE" = "200" ] || [ "$API_RESPONSE" = "401" ]; then
            print_success "API está respondendo (HTTP ${API_RESPONSE})"
        else
            print_warning "API pode não estar respondendo corretamente (HTTP ${API_RESPONSE})"
        fi
    fi
}

# ==============================================================================
# MAIN
# ==============================================================================

main() {
    print_header "UPGRADE EVOLUTION API: ${OLD_VERSION} → ${NEW_VERSION}"
    
    # Verificações iniciais
    check_docker
    check_containers
    detect_current_version
    
    # Confirmar upgrade
    echo ""
    print_warning "Este script irá:"
    echo "  1. Criar backup do banco de dados e configurações"
    echo "  2. Parar o container Evolution API"
    echo "  3. Atualizar docker-compose.yml para ${NEW_VERSION}"
    echo "  4. Baixar nova imagem"
    echo "  5. Recriar e iniciar containers"
    echo ""
    read -p "Deseja continuar? (s/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        print_warning "Upgrade cancelado pelo usuário"
        exit 0
    fi
    
    # Executar upgrade
    create_backup
    stop_containers
    update_docker_compose
    pull_new_image
    start_containers
    wait_for_services
    verify_upgrade
    
    # Conclusão
    print_header "UPGRADE CONCLUÍDO"
    print_success "Evolution API atualizado para ${NEW_VERSION}"
    echo ""
    echo "Próximos passos:"
    echo "  1. Verifique os logs: docker logs ${API_CONTAINER} -f"
    echo "  2. Teste a API: curl http://localhost:8080/instance/fetchInstances -H 'apikey: B8349283-F143-429D-B6C2-9386E8016558'"
    echo "  3. Se houver problemas, restaure o backup em: ${BACKUP_DIR}/"
    echo ""
}

# Executar
main

