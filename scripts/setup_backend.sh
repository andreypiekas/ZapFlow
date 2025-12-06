#!/bin/bash

# Script de instalação e configuração do backend ZapFlow
# Autor: ZapFlow Team
# Versão: 1.0.0

set -e  # Para em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Instalação do Backend ZapFlow${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Detectar IP do servidor automaticamente
detect_server_ip() {
    # Tenta vários métodos para detectar o IP
    if command -v hostname &> /dev/null; then
        SERVER_IP=$(hostname -I | awk '{print $1}' 2>/dev/null)
    fi
    
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP=$(ip addr show | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}' | cut -d'/' -f1 2>/dev/null)
    fi
    
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}' 2>/dev/null)
    fi
    
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP="localhost"
        echo -e "${YELLOW}⚠️  Não foi possível detectar o IP do servidor automaticamente.${NC}"
        echo -e "${YELLOW}   Usando 'localhost'. Configure manualmente se necessário.${NC}"
    else
        echo -e "${GREEN}✅ IP do servidor detectado: ${SERVER_IP}${NC}"
    fi
}

detect_server_ip
echo ""

# Detectar e navegar para a raiz do projeto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_DIR="$(pwd)"

# Se o script está em scripts/, a raiz do projeto é o diretório pai
if [ "$(basename "$SCRIPT_DIR")" = "scripts" ]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}✅ Navegando para a raiz do projeto: $(pwd)${NC}"
    echo ""
else
    # Se não está em scripts/, assume que já está na raiz
    PROJECT_ROOT="$(pwd)"
fi

# Verificar se está na raiz do projeto
if [ ! -d "backend" ]; then
    echo -e "${RED}❌ Erro: Diretório 'backend' não encontrado.${NC}"
    echo "Execute este script da raiz do projeto ZapFlow ou da pasta scripts/."
    echo "Diretório atual: $(pwd)"
    exit 1
fi

cd backend

# 1. Verificar Node.js
echo -e "${YELLOW}[1/7] Verificando Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado. Instale Node.js 18+ primeiro.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js versão 18+ é necessário. Versão atual: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v) encontrado${NC}"
echo ""

# 2. Verificar PostgreSQL
echo -e "${YELLOW}[2/7] Verificando PostgreSQL...${NC}"

# Verificar se PostgreSQL nativo está instalado e rodando
PG_NATIVE_INSTALLED=false
PG_NATIVE_RUNNING=false

# Verificar se o serviço PostgreSQL existe
if command -v systemctl &> /dev/null; then
    if systemctl list-unit-files | grep -q "postgresql"; then
        PG_NATIVE_INSTALLED=true
        if systemctl is-active --quiet postgresql 2>/dev/null; then
            PG_NATIVE_RUNNING=true
        fi
    fi
fi

# Verificar se psql está disponível (pode ser do Docker)
if command -v psql &> /dev/null; then
    # Tentar conectar ao PostgreSQL nativo (não Docker)
    if pg_isready -h localhost -p 54321 > /dev/null 2>&1 || pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        PG_NATIVE_RUNNING=true
    fi
fi

# Verificar se há processo PostgreSQL nativo rodando
if pgrep -f "postgres.*main" > /dev/null 2>&1 && ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "postgres"; then
    PG_NATIVE_RUNNING=true
    PG_NATIVE_INSTALLED=true
fi

if [ "$PG_NATIVE_INSTALLED" = false ] || [ "$PG_NATIVE_RUNNING" = false ]; then
    if [ "$PG_NATIVE_INSTALLED" = false ]; then
        echo -e "${YELLOW}⚠️  PostgreSQL nativo não está instalado.${NC}"
        echo -e "${YELLOW}   Detectado PostgreSQL em Docker (Evolution API), mas precisamos do PostgreSQL nativo.${NC}"
    else
        echo -e "${YELLOW}⚠️  PostgreSQL nativo está instalado mas não está rodando.${NC}"
    fi
    
    echo ""
    echo "O ZapFlow precisa do PostgreSQL nativo (não Docker) para o backend."
    echo "Deseja instalar/iniciar o PostgreSQL nativo? (s/n)"
    read -r INSTALL_PG
    
    if [ "$INSTALL_PG" = "s" ] || [ "$INSTALL_PG" = "S" ]; then
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            if [ "$PG_NATIVE_INSTALLED" = false ]; then
                echo "Instalando PostgreSQL nativo..."
                sudo apt update
                sudo apt install -y postgresql postgresql-contrib
            fi
            
            # Tentar iniciar PostgreSQL
            echo "Iniciando PostgreSQL..."
            if sudo systemctl start postgresql 2>/dev/null; then
                echo -e "${GREEN}✅ PostgreSQL iniciado${NC}"
                sudo systemctl enable postgresql
                sleep 3
            else
                # Tentar iniciar via service
                if sudo service postgresql start 2>/dev/null; then
                    echo -e "${GREEN}✅ PostgreSQL iniciado via service${NC}"
                    sleep 3
                else
                    echo -e "${YELLOW}⚠️  Não foi possível iniciar automaticamente.${NC}"
                    echo "Tente manualmente: sudo systemctl start postgresql"
                fi
            fi
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            echo "Instalando PostgreSQL via Homebrew..."
            if ! command -v brew &> /dev/null; then
                echo -e "${RED}❌ Homebrew não encontrado. Instale o Homebrew primeiro.${NC}"
                exit 1
            fi
            if [ "$PG_NATIVE_INSTALLED" = false ]; then
                brew install postgresql@14
            fi
            brew services start postgresql@14
        else
            echo -e "${RED}❌ Sistema operacional não suportado para instalação automática.${NC}"
            echo "Instale o PostgreSQL manualmente: https://www.postgresql.org/download/"
            exit 1
        fi
    else
        echo -e "${RED}❌ PostgreSQL nativo é necessário para o backend.${NC}"
        echo "Instale manualmente e execute o script novamente."
        exit 1
    fi
fi

# Verificar novamente se está rodando
if ! pg_isready -h localhost -p 54321 > /dev/null 2>&1 && ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    if ! systemctl is-active --quiet postgresql 2>/dev/null; then
        echo -e "${YELLOW}⚠️  PostgreSQL ainda não está rodando.${NC}"
        echo "Tente iniciar manualmente: sudo systemctl start postgresql"
        echo "Ou verifique o status: sudo systemctl status postgresql"
    fi
fi

echo -e "${GREEN}✅ PostgreSQL encontrado${NC}"

# Inicializar variáveis
EXISTING_INSTALL=false
EXISTING_PORT=""
EXISTING_DB=""
EXISTING_USER=""
EXISTING_PASSWORD=""

# Verificar se já existe instalação do ZapFlow
check_existing_zapflow_install() {
    echo "Verificando instalações existentes do ZapFlow..."
    
    # Verificar se existe banco zapflow na porta 54321 (instalação do autoinstall)
    if PGPASSWORD="" psql -h localhost -p 54321 -U postgres -d zapflow -c "SELECT 1;" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Instalação existente do ZapFlow detectada!${NC}"
        echo -e "${GREEN}   Banco: zapflow na porta 54321${NC}"
        
        # Verificar se usuário zapflow_user existe
        USER_EXISTS=$(PGPASSWORD="" psql -h localhost -p 54321 -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='zapflow_user';" 2>/dev/null)
        if [ "$USER_EXISTS" = "1" ]; then
            echo -e "${GREEN}   Usuário: zapflow_user encontrado${NC}"
            EXISTING_INSTALL=true
            EXISTING_PORT="54321"
            EXISTING_DB="zapflow"
            EXISTING_USER="zapflow_user"
            EXISTING_PASSWORD="zapflow_secure_password_2024"
            return 0
        fi
    fi
    
    # Verificar se existe banco zapflow na porta 5432
    if PGPASSWORD="" psql -h localhost -p 5432 -U postgres -d zapflow -c "SELECT 1;" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Instalação existente do ZapFlow detectada!${NC}"
        echo -e "${GREEN}   Banco: zapflow na porta 5432${NC}"
        EXISTING_INSTALL=true
        EXISTING_PORT="5432"
        EXISTING_DB="zapflow"
        EXISTING_USER="zapflow_user"
        EXISTING_PASSWORD="zapflow_secure_password_2024"
        return 0
    fi
    
    EXISTING_INSTALL=false
    return 1
}

# Variáveis globais para Docker
DOCKER_PG_DETECTED=false
DOCKER_PG_PORT_EXPOSED=false

# Verificar se há PostgreSQL em Docker (Evolution API)
check_docker_postgres() {
    local detected=false
    local port_exposed=false
    
    if command -v docker &> /dev/null; then
        # Verificar container evolution_postgres especificamente
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "evolution_postgres"; then
            detected=true
            echo -e "${GREEN}✅ PostgreSQL em Docker detectado (Evolution API)${NC}"
            
            # Verificar se a porta está exposta para o host
            DOCKER_PORTS=$(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep "evolution_postgres" | awk '{print $2}')
            if echo "$DOCKER_PORTS" | grep -q "5432"; then
                port_exposed=true
                EXPOSED_PORT=$(echo "$DOCKER_PORTS" | grep -oP '0\.0\.0\.0:\K\d+(?=->5432)' | head -1)
                if [ -n "$EXPOSED_PORT" ]; then
                    echo -e "${YELLOW}⚠️  ATENÇÃO: PostgreSQL Docker está expondo porta $EXPOSED_PORT->5432 para o host${NC}"
                    echo -e "${YELLOW}   Isso pode causar conflito! Use porta diferente para PostgreSQL nativo.${NC}"
                fi
            else
                echo -e "${GREEN}   Porta 5432 não está exposta para o host (apenas interna do Docker)${NC}"
                echo -e "${GREEN}   Não há conflito - o ZapFlow usará PostgreSQL nativo na porta 54321${NC}"
            fi
            
            # Verificar configurações do Docker
            DOCKER_PG_USER=$(docker exec evolution_postgres psql -U postgres -tAc "SELECT current_user;" 2>/dev/null || echo "user")
            DOCKER_PG_DB=$(docker exec evolution_postgres psql -U postgres -tAc "SELECT datname FROM pg_database WHERE datname='evolution';" 2>/dev/null || echo "evolution")
            
            echo -e "${BLUE}   Configuração Docker:${NC}"
            echo -e "${BLUE}     Container: evolution_postgres${NC}"
            echo -e "${BLUE}     Usuário: ${DOCKER_PG_USER}${NC}"
            echo -e "${BLUE}     Banco: ${DOCKER_PG_DB}${NC}"
            echo ""
            echo -e "${GREEN}   O ZapFlow usará PostgreSQL NATIVO separado:${NC}"
            echo -e "${GREEN}     Porta: 54321 (para evitar conflitos)${NC}"
            echo -e "${GREEN}     Banco: zapflow${NC}"
            echo -e "${GREEN}     Usuário: zapflow_user${NC}"
        fi
    fi
    
    # Atualizar variáveis globais
    DOCKER_PG_DETECTED=$detected
    DOCKER_PG_PORT_EXPOSED=$port_exposed
}

# Detectar instalações existentes e portas em uso
detect_postgresql() {
    echo "Detectando instalações do PostgreSQL..."
    
    # Verificar instalação existente do ZapFlow primeiro
    if check_existing_zapflow_install; then
        SUGGESTED_HOST="localhost"
        SUGGESTED_PORT="$EXISTING_PORT"
        SUGGESTED_DB="$EXISTING_DB"
        SUGGESTED_USER="$EXISTING_USER"
        SUGGESTED_PASSWORD="$EXISTING_PASSWORD"
        echo -e "${GREEN}✅ Usando configuração existente do ZapFlow${NC}"
        return 0
    fi
    
    # Verificar PostgreSQL em Docker
    check_docker_postgres
    
    # Verificar se o PostgreSQL está rodando
    PG_RUNNING=false
    
    # Tentar verificar via systemctl
    if command -v systemctl &> /dev/null; then
        if systemctl is-active --quiet postgresql 2>/dev/null; then
            PG_RUNNING=true
        fi
    fi
    
    # Tentar verificar via pg_isready
    if [ "$PG_RUNNING" = false ] && command -v pg_isready &> /dev/null; then
        if pg_isready > /dev/null 2>&1; then
            PG_RUNNING=true
        fi
    fi
    
    # Tentar verificar via processo
    if [ "$PG_RUNNING" = false ]; then
        if pgrep -x postgres > /dev/null 2>&1 || pgrep -f "postgres:" > /dev/null 2>&1; then
            PG_RUNNING=true
        fi
    fi
    
    if [ "$PG_RUNNING" = true ]; then
        echo -e "${GREEN}✅ PostgreSQL está rodando${NC}"
        
        # Tentar detectar a porta em uso (excluindo Docker)
        # Primeiro, obter PIDs do Docker
        DOCKER_PIDS=""
        if command -v docker &> /dev/null; then
            DOCKER_PIDS=$(docker ps --format '{{.ID}}' 2>/dev/null | xargs -I {} docker inspect --format '{{.State.Pid}}' {} 2>/dev/null | tr '\n' '|' | sed 's/|$//')
        fi
        
        # Detectar porta via netstat, excluindo processos do Docker
        DETECTED_PORT=""
        if command -v netstat &> /dev/null; then
            while IFS= read -r line; do
                PORT=$(echo "$line" | awk '{print $4}' | cut -d':' -f2)
                PID=$(echo "$line" | awk '{print $7}' | cut -d'/' -f1)
                # Verificar se o PID não é do Docker
                if [ -n "$PID" ] && [ -n "$DOCKER_PIDS" ]; then
                    if echo "$DOCKER_PIDS" | grep -q "\b$PID\b"; then
                        continue
                    fi
                fi
                # Verificar se é realmente PostgreSQL nativo
                if [ -n "$PID" ]; then
                    CMD=$(ps -p "$PID" -o cmd= 2>/dev/null | grep -i postgres | grep -v docker)
                    if [ -n "$CMD" ]; then
                        DETECTED_PORT="$PORT"
                        break
                    fi
                fi
            done < <(sudo netstat -tlnp 2>/dev/null | grep postgres | grep LISTEN || true)
        fi
        
        # Se não encontrou, tentar via ss
        if [ -z "$DETECTED_PORT" ] && command -v ss &> /dev/null; then
            while IFS= read -r line; do
                PORT=$(echo "$line" | awk '{print $4}' | cut -d':' -f2)
                PID=$(echo "$line" | awk '{print $6}' | cut -d',' -f2 | cut -d'=' -f2)
                if [ -n "$PID" ] && [ -n "$DOCKER_PIDS" ]; then
                    if echo "$DOCKER_PIDS" | grep -q "\b$PID\b"; then
                        continue
                    fi
                fi
                if [ -n "$PID" ]; then
                    CMD=$(ps -p "$PID" -o cmd= 2>/dev/null | grep -i postgres | grep -v docker)
                    if [ -n "$CMD" ]; then
                        DETECTED_PORT="$PORT"
                        break
                    fi
                fi
            done < <(sudo ss -tlnp 2>/dev/null | grep postgres | grep LISTEN || true)
        fi
        
        # Se ainda não encontrou, tentar via pg_isready
        if [ -z "$DETECTED_PORT" ]; then
            for PORT in 54321 5432; do
                if pg_isready -h localhost -p "$PORT" > /dev/null 2>&1; then
                    # Verificar se não é Docker (verificar se porta está mapeada do Docker)
                    IS_DOCKER_PORT=false
                    if command -v docker &> /dev/null; then
                        # Verificar se algum container está mapeando essa porta
                        DOCKER_PORT_MAP=$(docker ps --format '{{.Ports}}' 2>/dev/null | grep -oP "0\.0\.0\.0:\K\d+(?=->$PORT)" || true)
                        if [ -n "$DOCKER_PORT_MAP" ]; then
                            IS_DOCKER_PORT=true
                        fi
                        # Verificar se é container evolution_postgres
                        if docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep "evolution_postgres" | grep -q ":$PORT"; then
                            IS_DOCKER_PORT=true
                        fi
                    fi
                    
                    if [ "$IS_DOCKER_PORT" = false ]; then
                        DETECTED_PORT="$PORT"
                        break
                    fi
                fi
            done
        fi
        
        if [ -n "$DETECTED_PORT" ]; then
            echo -e "${GREEN}✅ PostgreSQL nativo detectado na porta: $DETECTED_PORT${NC}"
            
            # Verificar se está escutando em localhost ou IP
            LISTEN_ADDR=$(sudo netstat -tlnp 2>/dev/null | grep postgres | grep ":$DETECTED_PORT" | head -1 | awk '{print $4}' | cut -d':' -f1)
            if [ -z "$LISTEN_ADDR" ]; then
                LISTEN_ADDR=$(sudo ss -tlnp 2>/dev/null | grep postgres | grep ":$DETECTED_PORT" | head -1 | awk '{print $4}' | cut -d':' -f1)
            fi
            
            if [ "$LISTEN_ADDR" = "127.0.0.1" ] || [ "$LISTEN_ADDR" = "::1" ] || [ "$LISTEN_ADDR" = "*" ] || [ -z "$LISTEN_ADDR" ]; then
                echo -e "${YELLOW}⚠️  PostgreSQL está escutando apenas em localhost (não no IP da rede)${NC}"
                SUGGESTED_HOST="localhost"
            else
                echo -e "${GREEN}✅ PostgreSQL está escutando em: $LISTEN_ADDR${NC}"
                SUGGESTED_HOST="$LISTEN_ADDR"
            fi
            
            # Se a porta detectada é 5432, configurar para usar 54321
            if [ "$DETECTED_PORT" = "5432" ]; then
                echo -e "${YELLOW}⚠️  PostgreSQL está usando a porta padrão 5432${NC}"
                
                # Se Docker está rodando, configurar PostgreSQL nativo para porta 54321
                if [ "$DOCKER_PG_DETECTED" = true ]; then
                    echo -e "${YELLOW}   Configurando PostgreSQL nativo para usar porta 54321 (evitar conflito com Docker)...${NC}"
                    
                    # Encontrar arquivo de configuração
                    PG_CONF=$(sudo find /etc/postgresql -name postgresql.conf 2>/dev/null | head -1)
                    if [ -n "$PG_CONF" ]; then
                        # Fazer backup
                        if [ ! -f "${PG_CONF}.backup" ]; then
                            sudo cp "$PG_CONF" "${PG_CONF}.backup"
                            echo -e "${GREEN}   Backup criado: ${PG_CONF}.backup${NC}"
                        fi
                        
                        # Alterar porta para 54321
                        if sudo sed -i "s/^#*port = .*/port = 54321/" "$PG_CONF" 2>/dev/null || sudo sed -i "s/^port = .*/port = 54321/" "$PG_CONF" 2>/dev/null; then
                            # Se não encontrou a linha, adicionar
                            if ! grep -q "^port = 54321" "$PG_CONF"; then
                                echo "port = 54321" | sudo tee -a "$PG_CONF" > /dev/null
                            fi
                            
                            echo -e "${GREEN}   Porta alterada para 54321 no arquivo de configuração${NC}"
                            
                            # Reiniciar PostgreSQL
                            echo "Reiniciando PostgreSQL..."
                            if sudo systemctl restart postgresql 2>/dev/null; then
                                sleep 3
                                echo -e "${GREEN}   PostgreSQL reiniciado${NC}"
                                
                                # Verificar se está rodando na nova porta (aguardar até 15 segundos)
                                PORT_CHANGED=false
                                for i in {1..15}; do
                                    if pg_isready -h localhost -p 54321 > /dev/null 2>&1; then
                                        echo -e "${GREEN}✅ PostgreSQL agora está rodando na porta 54321${NC}"
                                        DETECTED_PORT="54321"
                                        SUGGESTED_PORT="54321"
                                        PORT_CHANGED=true
                                        break
                                    fi
                                    echo -n "."
                                    sleep 1
                                done
                                echo ""
                                
                                if [ "$PORT_CHANGED" = false ]; then
                                    echo -e "${YELLOW}⚠️  PostgreSQL não responde na porta 54321 após reiniciar${NC}"
                                    echo -e "${YELLOW}   Verificando se ainda está na porta 5432...${NC}"
                                    
                                    # Verificar se ainda está na 5432
                                    if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
                                        echo -e "${YELLOW}   PostgreSQL ainda está na porta 5432${NC}"
                                        echo -e "${YELLOW}   A configuração pode não ter sido aplicada corretamente.${NC}"
                                        echo ""
                                        echo "Opções:"
                                        echo "  1. Usar porta 5432 temporariamente (pode conflitar com Docker)"
                                        echo "  2. Configurar manualmente e executar o script novamente"
                                        echo ""
                                        read -p "Deseja usar porta 5432 temporariamente? (s/n): " USE_5432
                                        if [ "$USE_5432" = "s" ] || [ "$USE_5432" = "S" ]; then
                                            SUGGESTED_PORT="5432"
                                            echo -e "${YELLOW}⚠️  Usando porta 5432. Configure para 54321 manualmente depois.${NC}"
                                        else
                                            SUGGESTED_PORT="54321"
                                            echo -e "${YELLOW}   Configure manualmente: sudo nano /etc/postgresql/*/main/postgresql.conf${NC}"
                                            echo -e "${YELLOW}   Altere 'port = 5432' para 'port = 54321'${NC}"
                                            echo -e "${YELLOW}   Depois: sudo systemctl restart postgresql${NC}"
                                        fi
                                    else
                                        echo -e "${RED}❌ PostgreSQL não está respondendo em nenhuma porta${NC}"
                                        echo "Verifique: sudo systemctl status postgresql"
                                        SUGGESTED_PORT="54321"
                                    fi
                                fi
                            else
                                echo -e "${YELLOW}⚠️  Não foi possível reiniciar PostgreSQL automaticamente${NC}"
                                echo "Execute manualmente: sudo systemctl restart postgresql"
                                SUGGESTED_PORT="54321"
                            fi
                        else
                            echo -e "${YELLOW}⚠️  Não foi possível alterar a configuração${NC}"
                            SUGGESTED_PORT="54321"
                        fi
                    else
                        echo -e "${YELLOW}⚠️  Arquivo de configuração não encontrado${NC}"
                        echo "Configure manualmente: sudo nano /etc/postgresql/*/main/postgresql.conf"
                        echo "Altere 'port = 5432' para 'port = 54321'"
                        SUGGESTED_PORT="54321"
                    fi
                else
                    echo -e "${YELLOW}   Para evitar conflitos, vamos usar a porta 54321${NC}"
                    SUGGESTED_PORT="54321"
                fi
            else
                SUGGESTED_PORT="$DETECTED_PORT"
            fi
        else
            echo -e "${YELLOW}⚠️  Não foi possível detectar a porta do PostgreSQL${NC}"
            SUGGESTED_HOST="localhost"
            SUGGESTED_PORT="54321"
        fi
    else
        echo -e "${YELLOW}⚠️  PostgreSQL não está rodando${NC}"
        echo "Tentando iniciar PostgreSQL..."
        
        # Tentar iniciar via systemctl
        if command -v systemctl &> /dev/null; then
            if sudo systemctl start postgresql 2>/dev/null; then
                echo -e "${GREEN}✅ PostgreSQL iniciado via systemctl${NC}"
                sleep 3
                # Verificar se realmente iniciou
                if systemctl is-active --quiet postgresql 2>/dev/null; then
                    PG_RUNNING=true
                fi
            fi
        fi
        
        # Se systemctl não funcionou, tentar service
        if [ "$PG_RUNNING" = false ] && command -v service &> /dev/null; then
            if sudo service postgresql start 2>/dev/null; then
                echo -e "${GREEN}✅ PostgreSQL iniciado via service${NC}"
                sleep 3
                if pg_isready > /dev/null 2>&1 || pgrep -x postgres > /dev/null 2>&1; then
                    PG_RUNNING=true
                fi
            fi
        fi
        
        # Se ainda não está rodando, tentar iniciar manualmente
        if [ "$PG_RUNNING" = false ]; then
            echo -e "${YELLOW}⚠️  Não foi possível iniciar o PostgreSQL automaticamente${NC}"
            echo ""
            echo "Tente iniciar manualmente:"
            echo "  sudo systemctl start postgresql"
            echo "  ou"
            echo "  sudo service postgresql start"
            echo "  ou"
            echo "  sudo -u postgres /usr/lib/postgresql/*/bin/pg_ctl start -D /var/lib/postgresql/*/main"
            echo ""
            read -p "Pressione Enter após iniciar o PostgreSQL, ou 's' para continuar mesmo assim: " CONTINUE
            if [ "$CONTINUE" != "s" ] && [ "$CONTINUE" != "S" ]; then
                # Verificar novamente após esperar
                sleep 2
                if pg_isready > /dev/null 2>&1 || systemctl is-active --quiet postgresql 2>/dev/null; then
                    PG_RUNNING=true
                    echo -e "${GREEN}✅ PostgreSQL agora está rodando${NC}"
                fi
            fi
        fi
        
        SUGGESTED_HOST="localhost"
        # Se Docker está rodando, sempre usar porta 54321 para evitar conflitos
        if [ "$DOCKER_PG_DETECTED" = true ]; then
            SUGGESTED_PORT="54321"
            echo -e "${GREEN}   Usando porta 54321 para evitar conflito com Docker${NC}"
        else
            SUGGESTED_PORT="54321"
        fi
    fi
}

detect_postgresql
echo ""

# 3. Configurar banco de dados
echo -e "${YELLOW}[3/7] Configurando banco de dados...${NC}"

# Se já existe instalação do ZapFlow, usar automaticamente
if [ "$EXISTING_INSTALL" = true ]; then
    echo -e "${GREEN}✅ Usando instalação existente do ZapFlow${NC}"
    DB_HOST="${SUGGESTED_HOST:-localhost}"
    DB_PORT="${SUGGESTED_PORT:-54321}"
    DB_NAME="${SUGGESTED_DB:-zapflow}"
    DB_USER="${SUGGESTED_USER:-zapflow_user}"
    DB_PASSWORD="${SUGGESTED_PASSWORD:-zapflow_secure_password_2024}"
    echo "  Host: $DB_HOST"
    echo "  Porta: $DB_PORT"
    echo "  Banco: $DB_NAME"
    echo "  Usuário: $DB_USER"
    echo ""
    read -p "Deseja usar essas configurações? (s/n) [s]: " USE_EXISTING
    USE_EXISTING=${USE_EXISTING:-s}
    
    if [ "$USE_EXISTING" != "s" ] && [ "$USE_EXISTING" != "S" ]; then
        EXISTING_INSTALL=false
    fi
fi

# Se não usar instalação existente, solicitar informações
if [ "$EXISTING_INSTALL" != true ]; then
    echo "Informe os dados do PostgreSQL:"
    echo -n "Host [${SUGGESTED_HOST:-localhost}]: "
    read -r DB_HOST
    DB_HOST=${DB_HOST:-${SUGGESTED_HOST:-localhost}}

    echo -n "Porta [${SUGGESTED_PORT:-54321}] (porta alta para evitar conflitos): "
    read -r DB_PORT
    DB_PORT=${DB_PORT:-${SUGGESTED_PORT:-54321}}

    echo -n "Nome do banco [zapflow]: "
    read -r DB_NAME
    DB_NAME=${DB_NAME:-zapflow}

    echo -n "Usuário [postgres]: "
    read -r DB_USER
    DB_USER=${DB_USER:-postgres}

    echo -n "Senha do PostgreSQL: "
    read -s DB_PASSWORD
    echo ""
    
    # Verificar se está tentando usar configurações do Docker
    if [ "$DB_NAME" = "evolution" ] || [ "$DB_USER" = "user" ]; then
        echo -e "${RED}⚠️  ATENÇÃO: Você está tentando usar configurações do Docker (Evolution API)!${NC}"
        echo -e "${RED}   Banco 'evolution' e usuário 'user' são do container Docker.${NC}"
        echo -e "${YELLOW}   O ZapFlow precisa de um PostgreSQL NATIVO separado.${NC}"
        echo ""
        echo "Recomendado para ZapFlow:"
        echo "  - Banco: zapflow"
        echo "  - Usuário: zapflow_user ou postgres"
        echo "  - Porta: 54321 (para evitar conflitos)"
        echo ""
        read -p "Deseja continuar mesmo assim? (s/n): " CONTINUE_DOCKER
        if [ "$CONTINUE_DOCKER" != "s" ] && [ "$CONTINUE_DOCKER" != "S" ]; then
            echo "Por favor, use configurações diferentes do Docker."
            exit 1
        fi
    fi
fi

# Testar conexão com PostgreSQL
echo "Testando conexão com PostgreSQL em $DB_HOST:$DB_PORT..."

# Se tentou configurar para 54321, verificar se realmente está nessa porta
if [ "$DB_PORT" = "54321" ] && [ -n "$DETECTED_PORT" ] && [ "$DETECTED_PORT" = "5432" ]; then
    echo "Verificando se PostgreSQL está realmente na porta 54321..."
    if ! pg_isready -h localhost -p 54321 > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  PostgreSQL ainda não está na porta 54321${NC}"
        echo -e "${YELLOW}   Tentando conectar na porta 5432 (onde está rodando)...${NC}"
        # Tentar conectar na porta original primeiro
        if PGPASSWORD=$DB_PASSWORD psql -h localhost -p 5432 -U "$DB_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Conexão estabelecida em localhost:5432${NC}"
            echo -e "${YELLOW}⚠️  Usando porta 5432 (configuração para 54321 não foi aplicada ainda)${NC}"
            DB_HOST="localhost"
            DB_PORT="5432"
            CONNECTION_SUCCESS=true
        fi
    fi
fi

CONNECTION_SUCCESS=${CONNECTION_SUCCESS:-false}

# Tentar conectar com o host/porta informados
if [ "$CONNECTION_SUCCESS" = false ]; then
    if PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Conexão com PostgreSQL estabelecida em $DB_HOST:$DB_PORT${NC}"
        CONNECTION_SUCCESS=true
    else
        # Se falhou e o host não é localhost, tentar localhost
        if [ "$DB_HOST" != "localhost" ] && [ "$DB_HOST" != "127.0.0.1" ]; then
            echo -e "${YELLOW}⚠️  Falha ao conectar em $DB_HOST. Tentando localhost...${NC}"
            if PGPASSWORD=$DB_PASSWORD psql -h localhost -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Conexão estabelecida em localhost:$DB_PORT${NC}"
                echo -e "${YELLOW}⚠️  PostgreSQL está escutando apenas em localhost, não no IP da rede${NC}"
                DB_HOST="localhost"
                CONNECTION_SUCCESS=true
            fi
        fi
        
        # Se ainda falhou, tentar porta 54321 (padrão do autoinstall)
        if [ "$CONNECTION_SUCCESS" = false ] && [ "$DB_PORT" != "54321" ]; then
            echo -e "${YELLOW}⚠️  Tentando porta 54321 (padrão do autoinstall)...${NC}"
            if PGPASSWORD=$DB_PASSWORD psql -h localhost -p 54321 -U "$DB_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Conexão estabelecida em localhost:54321${NC}"
                DB_HOST="localhost"
                DB_PORT="54321"
                CONNECTION_SUCCESS=true
            fi
        fi
        
        # Se ainda falhou, tentar porta padrão 5432
        if [ "$CONNECTION_SUCCESS" = false ] && [ "$DB_PORT" != "5432" ]; then
            echo -e "${YELLOW}⚠️  Tentando porta padrão 5432...${NC}"
            if PGPASSWORD=$DB_PASSWORD psql -h localhost -p 5432 -U "$DB_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Conexão estabelecida em localhost:5432${NC}"
                DB_HOST="localhost"
                DB_PORT="5432"
                CONNECTION_SUCCESS=true
            fi
        fi
    fi
fi

if [ "$CONNECTION_SUCCESS" = true ]; then
    # Informar valores finais usados
    echo -e "${GREEN}✅ Configuração final: Host=$DB_HOST, Porta=$DB_PORT${NC}"
    echo ""
    
    # Se não é instalação existente, criar usuário e banco se necessário
    if [ "$EXISTING_INSTALL" != true ]; then
        # Verificar se usuário existe, se não, criar
        USER_EXISTS=$(PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER';" 2>/dev/null || echo "0")
        if [ "$USER_EXISTS" != "1" ] && [ "$DB_USER" != "postgres" ]; then
            echo "Criando usuário '$DB_USER'..."
            # Conectar como postgres para criar usuário
            if sudo -u postgres PGPORT=$DB_PORT psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null; then
                echo -e "${GREEN}✅ Usuário '$DB_USER' criado com sucesso${NC}"
                sudo -u postgres PGPORT=$DB_PORT psql -c "ALTER USER $DB_USER CREATEDB;" 2>/dev/null || true
            else
                echo -e "${YELLOW}⚠️  Não foi possível criar o usuário. Continuando...${NC}"
            fi
        fi
        
        # Criar banco de dados
        echo "Criando banco de dados '$DB_NAME'..."
        if PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Banco de dados '$DB_NAME' criado com sucesso${NC}"
        else
            # Verificar se o banco já existe
            if PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
                echo -e "${YELLOW}⚠️  Banco de dados '$DB_NAME' já existe. Continuando...${NC}"
            else
                echo -e "${YELLOW}⚠️  Não foi possível criar o banco. Verifique as permissões.${NC}"
            fi
        fi
    else
        echo -e "${GREEN}✅ Usando instalação existente - banco e usuário já configurados${NC}"
    fi
else
    echo -e "${RED}❌ Erro: Não foi possível conectar ao PostgreSQL${NC}"
    echo ""
    echo "Tentativas realizadas:"
    echo "  - $DB_HOST:$DB_PORT"
    if [ "$DB_HOST" != "localhost" ]; then
        echo "  - localhost:$DB_PORT"
    fi
    if [ "$DB_PORT" != "54321" ]; then
        echo "  - localhost:54321 (padrão do autoinstall)"
    fi
    if [ "$DB_PORT" != "5432" ]; then
        echo "  - localhost:5432 (porta padrão)"
    fi
    echo ""
    echo "Verifique:"
    echo "  1. O PostgreSQL está rodando?"
    echo "     sudo systemctl status postgresql"
    echo "     sudo systemctl start postgresql"
    echo ""
    echo "  2. A porta está correta?"
    echo "     sudo netstat -tlnp | grep postgres"
    echo "     ou"
    echo "     sudo ss -tlnp | grep postgres"
    echo ""
    echo "  3. O PostgreSQL está escutando no IP correto?"
    echo "     sudo nano /etc/postgresql/*/main/postgresql.conf"
    echo "     # Procure por 'listen_addresses' e altere para '*' ou o IP específico"
    echo "     sudo nano /etc/postgresql/*/main/pg_hba.conf"
    echo "     # Adicione linha: host all all 0.0.0.0/0 md5"
    echo "     sudo systemctl restart postgresql"
    echo ""
    echo "  4. As credenciais estão corretas?"
    echo "     sudo -u postgres psql -c \"\\du\""
    echo ""
    read -p "Deseja continuar mesmo assim? (s/n): " CONTINUE
    if [ "$CONTINUE" != "s" ] && [ "$CONTINUE" != "S" ]; then
        exit 1
    fi
fi

echo -e "${GREEN}✅ Banco de dados configurado${NC}"
echo ""

# 4. Instalar dependências do backend
echo -e "${YELLOW}[4/7] Instalando dependências do backend...${NC}"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo -e "${YELLOW}⚠️  node_modules já existe. Pulando instalação...${NC}"
    echo "Para reinstalar, delete a pasta node_modules e execute novamente."
fi
echo -e "${GREEN}✅ Dependências instaladas${NC}"
echo ""

# 5. Configurar .env
echo -e "${YELLOW}[5/7] Configurando arquivo .env...${NC}"

if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env já existe.${NC}"
    echo "Deseja sobrescrever? (s/n)"
    read -r OVERWRITE_ENV
    
    if [ "$OVERWRITE_ENV" != "s" ] && [ "$OVERWRITE_ENV" != "S" ]; then
        echo "Mantendo .env existente."
    else
        rm .env
    fi
fi

if [ ! -f ".env" ]; then
    # Gerar JWT secret aleatório
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -d '\n')
    
    # Solicitar porta do servidor
    echo -n "Porta do servidor backend [3001]: "
    read -r SERVER_PORT
    SERVER_PORT=${SERVER_PORT:-3001}
    
    # Configurar CORS origin automaticamente com IP detectado
    DEFAULT_CORS_ORIGIN="http://${SERVER_IP}:5173,http://localhost:5173"
    echo -e "CORS Origin detectado automaticamente: ${DEFAULT_CORS_ORIGIN}"
    echo -n "Deseja alterar? (Enter para usar o padrão ou digite uma URL customizada): "
    read -r CORS_ORIGIN
    CORS_ORIGIN=${CORS_ORIGIN:-$DEFAULT_CORS_ORIGIN}
    
    # Criar arquivo .env
    cat > .env << EOF
# Configuração do PostgreSQL
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}

# JWT Secret para autenticação
JWT_SECRET=${JWT_SECRET}

# Porta do servidor
PORT=${SERVER_PORT}

# IP do servidor (para CORS e logs)
SERVER_IP=${SERVER_IP}

# CORS - URLs permitidas
CORS_ORIGIN=${CORS_ORIGIN}
EOF
    
    echo -e "${GREEN}✅ Arquivo .env criado${NC}"
else
    echo -e "${GREEN}✅ Arquivo .env mantido${NC}"
fi
echo ""

# 6. Executar migração
echo -e "${YELLOW}[6/7] Executando migração do banco de dados...${NC}"
npm run migrate || {
    echo -e "${RED}❌ Erro na migração. Verifique as credenciais do banco.${NC}"
    exit 1
}
echo -e "${GREEN}✅ Migração concluída${NC}"
echo ""

# 7. Verificar instalação e iniciar servidor
echo -e "${YELLOW}[7/7] Verificando instalação e iniciando servidor...${NC}"

# Testar conexão
if npm run migrate > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Conexão com banco de dados OK${NC}"
else
    echo -e "${YELLOW}⚠️  Não foi possível verificar a conexão${NC}"
fi

# Verificar se PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    echo "Instalando PM2 globalmente..."
    sudo npm install -g pm2
    echo -e "${GREEN}✅ PM2 instalado${NC}"
fi

# Parar instância anterior se existir
pm2 delete zapflow-backend 2>/dev/null || true

# Iniciar servidor com PM2
echo "Iniciando servidor backend com PM2..."
cd "$PROJECT_ROOT/backend"
pm2 start server.js --name zapflow-backend --cwd "$(pwd)"
pm2 save

# Configurar PM2 para iniciar no boot
if pm2 startup | grep -q "sudo"; then
    echo "Configurando PM2 para iniciar no boot..."
    pm2 startup | grep "sudo" | bash || echo -e "${YELLOW}⚠️  Não foi possível configurar startup automático${NC}"
fi

# Voltar para a raiz
cd "$PROJECT_ROOT"

# Aguardar servidor iniciar
sleep 3

# Verificar se servidor está rodando
if pm2 list | grep -q "zapflow-backend.*online"; then
    echo -e "${GREEN}✅ Servidor backend iniciado com PM2${NC}"
    echo -e "${GREEN}   Status: $(pm2 jlist | grep -o '"zapflow-backend"[^}]*"status":"[^"]*' | grep -o '"status":"[^"]*' | cut -d'"' -f4)${NC}"
else
    echo -e "${YELLOW}⚠️  Servidor pode não ter iniciado corretamente${NC}"
    echo "Verifique: pm2 logs zapflow-backend"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Instalação concluída com sucesso!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Servidor Backend:${NC}"
echo -e "   ${GREEN}✅ Rodando em segundo plano com PM2${NC}"
echo -e "   ${GREEN}✅ URL: http://${SERVER_IP}:${SERVER_PORT:-3001}${NC}"
echo -e "   ${GREEN}✅ Health: http://${SERVER_IP}:${SERVER_PORT:-3001}/api/health${NC}"
echo ""
echo -e "${BLUE}Comandos úteis:${NC}"
echo -e "   ${YELLOW}pm2 status${NC}                    - Ver status do servidor"
echo -e "   ${YELLOW}pm2 logs zapflow-backend${NC}     - Ver logs do servidor"
echo -e "   ${YELLOW}pm2 restart zapflow-backend${NC}  - Reiniciar servidor"
echo -e "   ${YELLOW}pm2 stop zapflow-backend${NC}     - Parar servidor"
# Configurar .env do frontend
echo ""
echo -e "${YELLOW}Configurando .env do frontend...${NC}"
cd "$PROJECT_ROOT"

if [ ! -f ".env" ]; then
    echo "VITE_API_URL=http://${SERVER_IP}:${SERVER_PORT:-3001}" > .env
    echo -e "${GREEN}✅ Arquivo .env do frontend criado com URL do backend${NC}"
else
    # Adicionar ou atualizar VITE_API_URL no .env existente
    if grep -q "VITE_API_URL" .env; then
        sed -i "s|VITE_API_URL=.*|VITE_API_URL=http://${SERVER_IP}:${SERVER_PORT:-3001}|" .env
    else
        echo "VITE_API_URL=http://${SERVER_IP}:${SERVER_PORT:-3001}" >> .env
    fi
    echo -e "${GREEN}✅ Variável VITE_API_URL configurada no .env${NC}"
fi
echo "   📝 VITE_API_URL=http://${SERVER_IP}:${SERVER_PORT:-3001}"
echo ""

echo ""
echo -e "${BLUE}Próximos passos:${NC}"
echo ""
echo "1. Frontend configurado:"
echo -e "   ${GREEN}✅ Arquivo .env do frontend configurado automaticamente${NC}"
echo -e "   ${YELLOW}VITE_API_URL=http://${SERVER_IP}:${SERVER_PORT:-3001}${NC}"
echo ""
echo "2. Credenciais padrão do admin:"
echo -e "   ${YELLOW}Username: admin${NC}"
echo -e "   ${YELLOW}Password: admin123${NC}"
echo -e "   ${RED}⚠️  ALTERE A SENHA EM PRODUÇÃO!${NC}"
echo ""
echo "3. Teste a API:"
echo -e "   ${YELLOW}curl http://${SERVER_IP}:${SERVER_PORT:-3001}/api/health${NC}"
echo -e "   ${YELLOW}curl http://${SERVER_IP}:${SERVER_PORT:-3001}/${NC}"
echo ""

# Voltar para a raiz do projeto
cd "$PROJECT_ROOT"

