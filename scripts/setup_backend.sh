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
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  PostgreSQL não encontrado.${NC}"
    echo "Deseja instalar o PostgreSQL? (s/n)"
    read -r INSTALL_PG
    
    if [ "$INSTALL_PG" = "s" ] || [ "$INSTALL_PG" = "S" ]; then
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo "Instalando PostgreSQL..."
            sudo apt update
            sudo apt install -y postgresql postgresql-contrib
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            echo "Instalando PostgreSQL via Homebrew..."
            if ! command -v brew &> /dev/null; then
                echo -e "${RED}❌ Homebrew não encontrado. Instale o Homebrew primeiro.${NC}"
                exit 1
            fi
            brew install postgresql@14
            brew services start postgresql@14
        else
            echo -e "${RED}❌ Sistema operacional não suportado para instalação automática.${NC}"
            echo "Instale o PostgreSQL manualmente: https://www.postgresql.org/download/"
            exit 1
        fi
    else
        echo -e "${RED}❌ PostgreSQL é necessário. Instale manualmente e execute o script novamente.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ PostgreSQL encontrado${NC}"

# Detectar instalações existentes e portas em uso
detect_postgresql() {
    echo "Detectando instalações do PostgreSQL..."
    
    # Verificar se o PostgreSQL está rodando
    if systemctl is-active --quiet postgresql 2>/dev/null || pg_isready > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL está rodando${NC}"
        
        # Tentar detectar a porta em uso
        DETECTED_PORT=$(sudo netstat -tlnp 2>/dev/null | grep postgres | grep LISTEN | head -1 | awk '{print $4}' | cut -d':' -f2)
        if [ -z "$DETECTED_PORT" ]; then
            DETECTED_PORT=$(sudo ss -tlnp 2>/dev/null | grep postgres | grep LISTEN | head -1 | awk '{print $4}' | cut -d':' -f2)
        fi
        
        if [ -n "$DETECTED_PORT" ]; then
            echo -e "${GREEN}✅ PostgreSQL detectado na porta: $DETECTED_PORT${NC}"
            
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
            
            # Se a porta detectada é 5432, sugerir porta alternativa
            if [ "$DETECTED_PORT" = "5432" ]; then
                echo -e "${YELLOW}⚠️  PostgreSQL está usando a porta padrão 5432${NC}"
                echo -e "${YELLOW}   Para evitar conflitos, vamos usar a porta 54321${NC}"
                SUGGESTED_PORT="54321"
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
        echo "Iniciando PostgreSQL..."
        sudo systemctl start postgresql 2>/dev/null || sudo service postgresql start 2>/dev/null
        sleep 2
        SUGGESTED_HOST="localhost"
        SUGGESTED_PORT="54321"
    fi
}

detect_postgresql
echo ""

# 3. Configurar banco de dados
echo -e "${YELLOW}[3/7] Configurando banco de dados...${NC}"

# Solicitar informações do banco com sugestões baseadas na detecção
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

# Testar conexão com PostgreSQL
echo "Testando conexão com PostgreSQL em $DB_HOST:$DB_PORT..."
CONNECTION_SUCCESS=false

# Tentar conectar com o host fornecido
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

if [ "$CONNECTION_SUCCESS" = true ]; then
    # Informar valores finais usados
    echo -e "${GREEN}✅ Configuração final: Host=$DB_HOST, Porta=$DB_PORT${NC}"
    echo ""
    
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
    echo -e "${RED}❌ Erro: Não foi possível conectar ao PostgreSQL${NC}"
    echo ""
    echo "Tentativas realizadas:"
    echo "  - $DB_HOST:$DB_PORT"
    if [ "$DB_HOST" != "localhost" ]; then
        echo "  - localhost:$DB_PORT"
    fi
    if [ "$DB_PORT" != "5432" ]; then
        echo "  - localhost:5432"
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

# 7. Verificar instalação
echo -e "${YELLOW}[7/7] Verificando instalação...${NC}"

# Testar conexão
if npm run migrate > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Conexão com banco de dados OK${NC}"
else
    echo -e "${YELLOW}⚠️  Não foi possível verificar a conexão${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Instalação concluída com sucesso!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Próximos passos:${NC}"
echo ""
echo "1. Inicie o servidor backend:"
echo -e "   ${YELLOW}cd backend${NC}"
echo -e "   ${YELLOW}npm run dev${NC}"
echo ""
echo "2. Configure o frontend (opcional):"
echo "   Adicione no .env do frontend:"
echo -e "   ${YELLOW}VITE_API_URL=http://${SERVER_IP}:${SERVER_PORT:-3001}/api${NC}"
echo ""
echo "3. Credenciais padrão do admin:"
echo -e "   ${YELLOW}Username: admin${NC}"
echo -e "   ${YELLOW}Password: admin123${NC}"
echo -e "   ${RED}⚠️  ALTERE A SENHA EM PRODUÇÃO!${NC}"
echo ""
echo "4. Teste a API:"
echo -e "   ${YELLOW}curl http://${SERVER_IP}:${SERVER_PORT:-3001}/api/health${NC}"
echo ""

# Voltar para a raiz do projeto
cd "$PROJECT_ROOT"

