# Script de instalação e configuração do backend Zentria (PowerShell)
# Autor: Zentria Team
# Versão: 1.0.0

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Instalação do Backend Zentria" -ForegroundColor Cyan
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
    Write-Host "Execute este script da raiz do projeto Zentria ou da pasta scripts/."
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

# Detectar instalações existentes do PostgreSQL
Write-Host "Detectando instalações do PostgreSQL..."
$SUGGESTED_HOST = "localhost"
$SUGGESTED_PORT = "54321"

try {
    # Verificar se PostgreSQL está rodando
    $pgProcess = Get-Process -Name "postgres" -ErrorAction SilentlyContinue
    if ($pgProcess) {
        Write-Host "✅ PostgreSQL está rodando" -ForegroundColor Green
        
        # Tentar detectar porta (Windows)
        $listeningPorts = netstat -ano | Select-String "LISTENING" | Select-String "postgres"
        if ($listeningPorts) {
            $portLine = $listeningPorts | Select-Object -First 1
            if ($portLine -match ":(\d+)\s") {
                $detectedPort = $matches[1]
                Write-Host "✅ PostgreSQL detectado na porta: $detectedPort" -ForegroundColor Green
                if ($detectedPort -eq "5432") {
                    Write-Host "⚠️  PostgreSQL está usando a porta padrão 5432" -ForegroundColor Yellow
                    Write-Host "   Para evitar conflitos, vamos usar a porta 54321" -ForegroundColor Yellow
                } else {
                    $SUGGESTED_PORT = $detectedPort
                }
            }
        }
    } else {
        Write-Host "⚠️  PostgreSQL não está rodando" -ForegroundColor Yellow
        Write-Host "Iniciando PostgreSQL..."
        Start-Service postgresql* -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
} catch {
    Write-Host "⚠️  Não foi possível detectar a configuração do PostgreSQL" -ForegroundColor Yellow
}

Write-Host ""

# 3. Configurar banco de dados
Write-Host "[3/7] Configurando banco de dados..." -ForegroundColor Yellow

Write-Host "Informe os dados do PostgreSQL:"
$DB_HOST = Read-Host "Host [$SUGGESTED_HOST]"
if ([string]::IsNullOrWhiteSpace($DB_HOST)) { $DB_HOST = $SUGGESTED_HOST }

$DB_PORT = Read-Host "Porta [$SUGGESTED_PORT] (porta alta para evitar conflitos)"
if ([string]::IsNullOrWhiteSpace($DB_PORT)) { $DB_PORT = $SUGGESTED_PORT }

$DB_NAME = Read-Host "Nome do banco [zentria]"
if ([string]::IsNullOrWhiteSpace($DB_NAME)) { $DB_NAME = "zentria" }

$DB_USER = Read-Host "Usuário [postgres]"
if ([string]::IsNullOrWhiteSpace($DB_USER)) { $DB_USER = "postgres" }

$securePassword = Read-Host "Senha do PostgreSQL" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$DB_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Testar conexão com PostgreSQL
Write-Host "Testando conexão com PostgreSQL em ${DB_HOST}:${DB_PORT}..."
$env:PGPASSWORD = $DB_PASSWORD
$CONNECTION_SUCCESS = $false

# Tentar conectar com o host fornecido
try {
    $testResult = psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Conexão com PostgreSQL estabelecida em ${DB_HOST}:${DB_PORT}" -ForegroundColor Green
        $CONNECTION_SUCCESS = $true
    } else {
        throw "Connection failed"
    }
} catch {
    # Se falhou e o host não é localhost, tentar localhost
    if ($DB_HOST -ne "localhost" -and $DB_HOST -ne "127.0.0.1") {
        Write-Host "⚠️  Falha ao conectar em $DB_HOST. Tentando localhost..." -ForegroundColor Yellow
        try {
            $testResult = psql -h localhost -p $DB_PORT -U $DB_USER -d postgres -c "SELECT 1;" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Conexão estabelecida em localhost:${DB_PORT}" -ForegroundColor Green
                Write-Host "⚠️  PostgreSQL está escutando apenas em localhost, não no IP da rede" -ForegroundColor Yellow
                $DB_HOST = "localhost"
                $CONNECTION_SUCCESS = $true
            }
        } catch {}
    }
    
    # Se ainda falhou, tentar porta padrão 5432
    if (-not $CONNECTION_SUCCESS -and $DB_PORT -ne "5432") {
        Write-Host "⚠️  Tentando porta padrão 5432..." -ForegroundColor Yellow
        try {
            $testResult = psql -h localhost -p 5432 -U $DB_USER -d postgres -c "SELECT 1;" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Conexão estabelecida em localhost:5432" -ForegroundColor Green
                $DB_HOST = "localhost"
                $DB_PORT = "5432"
                $CONNECTION_SUCCESS = $true
            }
        } catch {}
    }
}

if ($CONNECTION_SUCCESS) {
    Write-Host "✅ Configuração final: Host=$DB_HOST, Porta=$DB_PORT" -ForegroundColor Green
    Write-Host ""
    
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
    Write-Host "❌ Erro: Não foi possível conectar ao PostgreSQL" -ForegroundColor Red
    Write-Host ""
    Write-Host "Tentativas realizadas:" -ForegroundColor Yellow
    Write-Host "  - ${DB_HOST}:${DB_PORT}"
    if ($DB_HOST -ne "localhost") {
        Write-Host "  - localhost:${DB_PORT}"
    }
    if ($DB_PORT -ne "5432") {
        Write-Host "  - localhost:5432"
    }
    Write-Host ""
    Write-Host "Verifique:" -ForegroundColor Yellow
    Write-Host "  1. O PostgreSQL está rodando?"
    Write-Host "  2. A porta está correta?"
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
Write-Host "   Adicione em frontend\\.env (ou crie o arquivo):"
Write-Host "   VITE_API_URL=http://${SERVER_IP}:$SERVER_PORT" -ForegroundColor Yellow
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

