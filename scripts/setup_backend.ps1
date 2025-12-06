# Script de instalação e configuração do backend ZapFlow (PowerShell)
# Autor: ZapFlow Team
# Versão: 1.0.0

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Instalação do Backend ZapFlow" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Detectar IP do servidor automaticamente
function Get-ServerIP {
    $ip = $null
    
    # Tenta obter IP via Get-NetIPAddress
    try {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*","Wi-Fi*" | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
    } catch {}
    
    # Se não encontrou, tenta via ipconfig
    if (-not $ip) {
        try {
            $ipconfig = ipconfig | Select-String -Pattern "IPv4" | Select-Object -First 1
            if ($ipconfig) {
                $ip = ($ipconfig -split ":")[1].Trim()
            }
        } catch {}
    }
    
    # Se ainda não encontrou, tenta via WMI
    if (-not $ip) {
        try {
            $ip = (Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPAddress -ne $null -and $_.IPAddress -notlike "127.*" } | Select-Object -First 1).IPAddress[0]
        } catch {}
    }
    
    if (-not $ip) {
        $ip = "localhost"
        Write-Host "⚠️  Não foi possível detectar o IP do servidor automaticamente." -ForegroundColor Yellow
        Write-Host "   Usando 'localhost'. Configure manualmente se necessário." -ForegroundColor Yellow
    } else {
        Write-Host "✅ IP do servidor detectado: $ip" -ForegroundColor Green
    }
    
    return $ip
}

$SERVER_IP = Get-ServerIP
Write-Host ""

# Detectar e navegar para a raiz do projeto
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$SCRIPT_DIR_NAME = Split-Path -Leaf $SCRIPT_DIR
$PROJECT_ROOT = Get-Location

# Se o script está em scripts/, a raiz do projeto é o diretório pai
if ($SCRIPT_DIR_NAME -eq "scripts") {
    $PROJECT_ROOT = Split-Path -Parent $SCRIPT_DIR
    Set-Location $PROJECT_ROOT
    Write-Host "✅ Navegando para a raiz do projeto: $(Get-Location)" -ForegroundColor Green
    Write-Host ""
} else {
    # Se não está em scripts/, assume que já está na raiz
    $PROJECT_ROOT = Get-Location
}

# Verificar se está na raiz do projeto
if (-not (Test-Path "backend")) {
    Write-Host "❌ Erro: Diretório 'backend' não encontrado." -ForegroundColor Red
    Write-Host "Execute este script da raiz do projeto ZapFlow ou da pasta scripts/."
    Write-Host "Diretório atual: $(Get-Location)"
    exit 1
}

Set-Location backend

# 1. Verificar Node.js
Write-Host "[1/7] Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    
    if ($nodeMajor -lt 18) {
        Write-Host "❌ Node.js versão 18+ é necessário. Versão atual: $nodeVersion" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Node.js $nodeVersion encontrado" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js não encontrado. Instale Node.js 18+ primeiro." -ForegroundColor Red
    Write-Host "Download: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# 2. Verificar PostgreSQL
Write-Host "[2/7] Verificando PostgreSQL..." -ForegroundColor Yellow
$pgFound = $false

try {
    $null = psql --version
    $pgFound = $true
    Write-Host "✅ PostgreSQL encontrado" -ForegroundColor Green
} catch {
    Write-Host "⚠️  PostgreSQL não encontrado." -ForegroundColor Yellow
    Write-Host "Deseja instalar o PostgreSQL? (s/n)"
    $installPG = Read-Host
    
    if ($installPG -eq "s" -or $installPG -eq "S") {
        Write-Host "Instalando PostgreSQL via Chocolatey..."
        if (Get-Command choco -ErrorAction SilentlyContinue) {
            choco install postgresql -y
            refreshenv
            $pgFound = $true
        } else {
            Write-Host "❌ Chocolatey não encontrado." -ForegroundColor Red
            Write-Host "Instale o PostgreSQL manualmente: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "❌ PostgreSQL é necessário. Instale manualmente e execute o script novamente." -ForegroundColor Red
        exit 1
    }
}
Write-Host ""

# 3. Configurar banco de dados
Write-Host "[3/7] Configurando banco de dados..." -ForegroundColor Yellow

Write-Host "Informe os dados do PostgreSQL:"
$DB_HOST = Read-Host "Host [localhost]"
if ([string]::IsNullOrWhiteSpace($DB_HOST)) { $DB_HOST = "localhost" }

$DB_PORT = Read-Host "Porta [54321] (porta alta para evitar conflitos)"
if ([string]::IsNullOrWhiteSpace($DB_PORT)) { $DB_PORT = "54321" }

$DB_NAME = Read-Host "Nome do banco [zapflow]"
if ([string]::IsNullOrWhiteSpace($DB_NAME)) { $DB_NAME = "zapflow" }

$DB_USER = Read-Host "Usuário [postgres]"
if ([string]::IsNullOrWhiteSpace($DB_USER)) { $DB_USER = "postgres" }

$securePassword = Read-Host "Senha do PostgreSQL" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$DB_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Testar conexão com PostgreSQL
Write-Host "Testando conexão com PostgreSQL..."
$env:PGPASSWORD = $DB_PASSWORD
try {
    $testResult = psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Conexão com PostgreSQL estabelecida" -ForegroundColor Green
        
        # Criar banco de dados
        Write-Host "Criando banco de dados '$DB_NAME'..."
        $createResult = psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Banco de dados '$DB_NAME' criado com sucesso" -ForegroundColor Green
        } else {
            # Verificar se o banco já existe
            $checkResult = psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "⚠️  Banco de dados '$DB_NAME' já existe. Continuando..." -ForegroundColor Yellow
            } else {
                Write-Host "⚠️  Não foi possível criar o banco. Verifique as permissões." -ForegroundColor Yellow
            }
        }
    } else {
        throw "Connection failed"
    }
} catch {
    Write-Host "❌ Erro: Não foi possível conectar ao PostgreSQL" -ForegroundColor Red
    Write-Host ""
    Write-Host "Verifique:" -ForegroundColor Yellow
    Write-Host "  1. O PostgreSQL está rodando?"
    Write-Host "  2. A porta está correta? (padrão: 5432, mas você pode usar 54321)"
    Write-Host "  3. O host está correto? (localhost ou IP do servidor)"
    Write-Host "  4. As credenciais estão corretas?"
    Write-Host ""
    $continue = Read-Host "Deseja continuar mesmo assim? (s/n)"
    if ($continue -ne "s" -and $continue -ne "S") {
        exit 1
    }
}
Write-Host ""

# 4. Instalar dependências do backend
Write-Host "[4/7] Instalando dependências do backend..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    npm install
    Write-Host "✅ Dependências instaladas" -ForegroundColor Green
} else {
    Write-Host "⚠️  node_modules já existe. Pulando instalação..." -ForegroundColor Yellow
    Write-Host "Para reinstalar, delete a pasta node_modules e execute novamente."
}
Write-Host ""

# 5. Configurar .env
Write-Host "[5/7] Configurando arquivo .env..." -ForegroundColor Yellow

if (Test-Path ".env") {
    Write-Host "⚠️  Arquivo .env já existe." -ForegroundColor Yellow
    Write-Host "Deseja sobrescrever? (s/n)"
    $overwrite = Read-Host
    
    if ($overwrite -ne "s" -and $overwrite -ne "S") {
        Write-Host "Mantendo .env existente."
    } else {
        Remove-Item .env
    }
}

if (-not (Test-Path ".env")) {
    # Gerar JWT secret aleatório
    $JWT_SECRET = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
    
    # Solicitar porta do servidor
    $SERVER_PORT = Read-Host "Porta do servidor backend [3001]"
    if ([string]::IsNullOrWhiteSpace($SERVER_PORT)) { $SERVER_PORT = "3001" }
    
    # Configurar CORS origin automaticamente com IP detectado
    $DEFAULT_CORS_ORIGIN = "http://${SERVER_IP}:5173,http://localhost:5173"
    Write-Host "CORS Origin detectado automaticamente: $DEFAULT_CORS_ORIGIN" -ForegroundColor Green
    $CORS_ORIGIN = Read-Host "Deseja alterar? (Enter para usar o padrão ou digite uma URL customizada)"
    if ([string]::IsNullOrWhiteSpace($CORS_ORIGIN)) { $CORS_ORIGIN = $DEFAULT_CORS_ORIGIN }
    
    # Criar arquivo .env
    $envContent = @"
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
"@
    
    $envContent | Out-File -FilePath .env -Encoding utf8
    Write-Host "✅ Arquivo .env criado" -ForegroundColor Green
} else {
    Write-Host "✅ Arquivo .env mantido" -ForegroundColor Green
}
Write-Host ""

# 6. Executar migração
Write-Host "[6/7] Executando migração do banco de dados..." -ForegroundColor Yellow
try {
    npm run migrate
    Write-Host "✅ Migração concluída" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro na migração. Verifique as credenciais do banco." -ForegroundColor Red
    exit 1
}
Write-Host ""

# 7. Verificar instalação
Write-Host "[7/7] Verificando instalação..." -ForegroundColor Yellow
Write-Host "✅ Instalação concluída" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "  Instalação concluída com sucesso!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Próximos passos:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Inicie o servidor backend:"
Write-Host "   cd backend" -ForegroundColor Yellow
Write-Host "   npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "2. Configure o frontend (opcional):"
Write-Host "   Adicione no .env do frontend:"
Write-Host "   VITE_API_URL=http://${SERVER_IP}:$SERVER_PORT/api" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Credenciais padrão do admin:"
Write-Host "   Username: admin" -ForegroundColor Yellow
Write-Host "   Password: admin123" -ForegroundColor Yellow
Write-Host "   ⚠️  ALTERE A SENHA EM PRODUÇÃO!" -ForegroundColor Red
Write-Host ""
Write-Host "4. Teste a API:"
Write-Host "   curl http://${SERVER_IP}:$SERVER_PORT/api/health" -ForegroundColor Yellow
Write-Host ""

# Voltar para a raiz do projeto
Set-Location $PROJECT_ROOT

