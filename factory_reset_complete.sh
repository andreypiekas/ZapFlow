#!/bin/bash

# ==============================================================================
# 🗑️  FACTORY RESET COMPLETO - ZAPFLOW & EVOLUTION API
# ==============================================================================
# Remove TUDO: containers, volumes, imagens, arquivos de configuração
# Para uma instalação 100% limpa do zero
# ==============================================================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# ==============================================================================
# AVISOS E CONFIRMAÇÕES
# ==============================================================================

print_header "⚠️  AVISO: LIMPEZA COMPLETA"

echo -e "${RED}Este script irá REMOVER COMPLETAMENTE:${NC}"
echo "  • Todos os containers Evolution API, PostgreSQL e Redis"
echo "  • Todos os volumes (incluindo dados do banco de dados)"
echo "  • Todas as imagens Docker relacionadas"
echo "  • Arquivos docker-compose.yml"
echo "  • Cache do Docker"
echo ""
echo -e "${RED}⚠️  ATENÇÃO: Esta ação é IRREVERSÍVEL!${NC}"
echo -e "${YELLOW}Todos os dados serão PERDIDOS permanentemente!${NC}"
echo ""

read -p "Deseja fazer BACKUP antes de continuar? (s/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Ss]$ ]]; then
    print_header "CRIANDO BACKUP"
    
    BACKUP_DIR="./backup_before_reset_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "${BACKUP_DIR}"
    
    # Backup do banco de dados
    if docker ps --format '{{.Names}}' | grep -q "^evolution_postgres$"; then
        echo "Fazendo backup do banco de dados..."
        docker exec evolution_postgres pg_dump -U user evolution > "${BACKUP_DIR}/evolution_db.sql" 2>/dev/null || true
        print_success "Backup do banco salvo em: ${BACKUP_DIR}/evolution_db.sql"
    fi
    
    # Backup do docker-compose.yml
    if [ -f "docker-compose.yml" ]; then
        cp docker-compose.yml "${BACKUP_DIR}/" 2>/dev/null || true
        print_success "Backup do docker-compose.yml salvo"
    fi
    
    # Backup de arquivos de configuração
    cp -r *.txt *.sh *.md "${BACKUP_DIR}/" 2>/dev/null || true
    
    print_success "Backup completo salvo em: ${BACKUP_DIR}/"
    echo ""
fi

echo -e "${RED}Você tem CERTEZA que deseja continuar?${NC}"
echo -e "${RED}Digite 'SIM' (em maiúsculas) para confirmar:${NC}"
read -r CONFIRM

if [ "$CONFIRM" != "SIM" ]; then
    print_warning "Operação cancelada pelo usuário"
    exit 0
fi

# ==============================================================================
# 1. PARAR E REMOVER CONTAINERS
# ==============================================================================

print_header "1. PARANDO E REMOVENDO CONTAINERS"

# Parar containers via docker-compose se existir
if [ -f "docker-compose.yml" ]; then
    echo "Parando containers via docker-compose..."
    docker-compose down --remove-orphans 2>/dev/null || docker compose down --remove-orphans 2>/dev/null || true
fi

# Parar containers individuais
CONTAINERS=("evolution_api" "evolution_postgres" "evolution_redis")

for container in "${CONTAINERS[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "Parando e removendo container: ${container}"
        docker stop "${container}" 2>/dev/null || true
        docker rm -f "${container}" 2>/dev/null || true
        print_success "Container ${container} removido"
    fi
done

# ==============================================================================
# 2. REMOVER VOLUMES
# ==============================================================================

print_header "2. REMOVENDO VOLUMES"

# Remover volumes via docker-compose
if [ -f "docker-compose.yml" ]; then
    echo "Removendo volumes via docker-compose..."
    docker-compose down -v 2>/dev/null || docker compose down -v 2>/dev/null || true
fi

# Remover volumes específicos
VOLUMES=("evolution_postgres_data" "evolution_redis_data")

for volume in "${VOLUMES[@]}"; do
    if docker volume ls --format '{{.Name}}' | grep -q "^${volume}$"; then
        echo "Removendo volume: ${volume}"
        docker volume rm -f "${volume}" 2>/dev/null || true
        print_success "Volume ${volume} removido"
    fi
done

# Remover todos os volumes órfãos (opcional, mais agressivo)
read -p "Remover TODOS os volumes órfãos do Docker? (s/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "Removendo volumes órfãos..."
    docker volume prune -f
    print_success "Volumes órfãos removidos"
fi

# ==============================================================================
# 3. REMOVER IMAGENS DOCKER
# ==============================================================================

print_header "3. REMOVENDO IMAGENS DOCKER"

# Remover imagens específicas
IMAGES=("evoapicloud/evolution-api" "atendai/evolution-api" "postgres:15-alpine" "redis:alpine")

for image in "${IMAGES[@]}"; do
    if docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${image}"; then
        echo "Removendo imagem: ${image}"
        docker rmi -f $(docker images "${image}" -q) 2>/dev/null || true
        print_success "Imagem ${image} removida"
    fi
done

# Remover imagens não utilizadas
read -p "Remover TODAS as imagens não utilizadas? (s/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "Removendo imagens não utilizadas..."
    docker image prune -a -f
    print_success "Imagens não utilizadas removidas"
fi

# ==============================================================================
# 4. LIMPAR CACHE DO DOCKER
# ==============================================================================

print_header "4. LIMPANDO CACHE DO DOCKER"

read -p "Limpar cache do Docker (build cache)? (s/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "Limpando cache..."
    docker builder prune -a -f
    print_success "Cache do Docker limpo"
fi

# ==============================================================================
# 5. REMOVER ARQUIVOS DE CONFIGURAÇÃO
# ==============================================================================

print_header "5. REMOVENDO ARQUIVOS DE CONFIGURAÇÃO"

FILES_TO_REMOVE=("docker-compose.yml" ".env" "docker-compose.override.yml")

for file in "${FILES_TO_REMOVE[@]}"; do
    if [ -f "${file}" ]; then
        echo "Removendo arquivo: ${file}"
        rm -f "${file}"
        print_success "Arquivo ${file} removido"
    fi
done

# ==============================================================================
# 6. REMOVER REDES DOCKER (OPCIONAL)
# ==============================================================================

print_header "6. LIMPANDO REDES DOCKER"

read -p "Remover redes Docker não utilizadas? (s/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "Removendo redes não utilizadas..."
    docker network prune -f
    print_success "Redes não utilizadas removidas"
fi

# ==============================================================================
# 7. LIMPEZA COMPLETA DO DOCKER (OPCIONAL - MUITO AGRESSIVO)
# ==============================================================================

print_header "7. LIMPEZA COMPLETA DO DOCKER (OPCIONAL)"

echo -e "${RED}⚠️  ATENÇÃO: Isso removerá TUDO do Docker!${NC}"
echo "  • Todas as imagens"
echo "  • Todos os containers"
echo "  • Todos os volumes"
echo "  • Todas as redes"
echo "  • Todo o cache"
echo ""
read -p "Deseja fazer limpeza COMPLETA do Docker? (s/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo -e "${RED}Última confirmação: Digite 'CONFIRMAR' (em maiúsculas):${NC}"
    read -r FINAL_CONFIRM
    
    if [ "$FINAL_CONFIRM" = "CONFIRMAR" ]; then
        echo "Executando limpeza completa do Docker..."
        docker system prune -a --volumes -f
        print_success "Limpeza completa do Docker executada"
    else
        print_warning "Limpeza completa cancelada"
    fi
fi

# ==============================================================================
# RESUMO FINAL
# ==============================================================================

print_header "✅ LIMPEZA CONCLUÍDA"

echo "Resumo do que foi removido:"
echo "  ✓ Containers Evolution API, PostgreSQL e Redis"
echo "  ✓ Volumes de dados"
echo "  ✓ Imagens Docker relacionadas"
echo "  ✓ Arquivos de configuração"
echo ""

echo "Para reinstalar do zero, execute:"
echo "  ./setup_evolution.txt"
echo "  ou"
echo "  ./autoinstall.txt"
echo ""

print_success "Sistema pronto para instalação limpa!"

