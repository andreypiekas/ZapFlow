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

# Verificar se está na raiz do projeto
if [ ! -d "backend" ]; then
    echo -e "${RED}❌ Erro: Diretório 'backend' não encontrado.${NC}"
    echo "Execute este script da raiz do projeto ZapFlow."
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
echo ""

# 3. Configurar banco de dados
echo -e "${YELLOW}[3/7] Configurando banco de dados...${NC}"

# Solicitar informações do banco
echo "Informe os dados do PostgreSQL:"
echo -n "Host [localhost]: "
read -r DB_HOST
DB_HOST=${DB_HOST:-localhost}

echo -n "Porta [5432]: "
read -r DB_PORT
DB_PORT=${DB_PORT:-5432}

echo -n "Nome do banco [zapflow]: "
read -r DB_NAME
DB_NAME=${DB_NAME:-zapflow}

echo -n "Usuário [postgres]: "
read -r DB_USER
DB_USER=${DB_USER:-postgres}

echo -n "Senha do PostgreSQL: "
read -s DB_PASSWORD
echo ""

# Tentar criar o banco de dados
echo "Criando banco de dados..."
PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Não foi possível conectar. Tentando criar banco...${NC}"
}

PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Banco de dados pode já existir. Continuando...${NC}"
}

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
    
    # Solicitar CORS origin
    echo -n "CORS Origin (URL do frontend) [http://localhost:5173]: "
    read -r CORS_ORIGIN
    CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:5173}
    
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
echo -e "   ${YELLOW}VITE_API_URL=http://localhost:${SERVER_PORT:-3001}${NC}"
echo ""
echo "3. Credenciais padrão do admin:"
echo -e "   ${YELLOW}Username: admin${NC}"
echo -e "   ${YELLOW}Password: admin123${NC}"
echo -e "   ${RED}⚠️  ALTERE A SENHA EM PRODUÇÃO!${NC}"
echo ""
echo "4. Teste a API:"
echo -e "   ${YELLOW}curl http://localhost:${SERVER_PORT:-3001}/api/health${NC}"
echo ""

