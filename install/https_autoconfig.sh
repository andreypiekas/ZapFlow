#!/bin/bash
#
# ==============================================================================
# 🔒 ZENTRIA - HTTPS POR IP (AUTOCONFIG)
# ==============================================================================
# Objetivo: habilitar https://<IP> SEM domínio usando certificado self-signed
# com SAN para IP, e configurar Nginx como proxy reverso:
#   - /            -> Frontend (serve/vite build) 5173
#   - /api/        -> Backend API (Node/Express) 3001
#   - /instance/   -> Evolution API 8080
#   - /message/    -> Evolution API 8080
#   - /chat/       -> Evolution API 8080
#   - /socket.io/  -> Evolution WebSocket (wss) 8080
#
# Requisitos: Ubuntu/Debian + sudo
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error_exit() { echo -e "${RED}❌ Erro: $1${NC}" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
EVOLUTION_PORT="${EVOLUTION_PORT:-8080}"

NGINX_SITE_NAME="zentria-ip"
CERT_DIR="/etc/zentria/certs"
CERT_KEY="${CERT_DIR}/zentria-ip.key"
CERT_CRT="${CERT_DIR}/zentria-ip.crt"

detect_server_ip() {
  local ip=""

  # Prefer rota default (mais confiável em VPS)
  if command -v ip >/dev/null 2>&1; then
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++){if($i=="src"){print $(i+1); exit}}}')
  fi

  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi

  if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then
    ip=$(ip addr show 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}' | cut -d'/' -f1)
  fi

  if [ -z "$ip" ] && command -v ifconfig >/dev/null 2>&1; then
    ip=$(ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
  fi

  if [ -z "$ip" ]; then
    echo ""
  else
    echo "$ip"
  fi
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"

  [ -f "$file" ] || return 0

  if grep -qE "^${key}=" "$file"; then
    sudo sed -i "s|^${key}=.*|${key}=${value}|g" "$file"
  else
    echo "${key}=${value}" | sudo tee -a "$file" >/dev/null
  fi
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ZENTRIA - HTTPS POR IP (AUTOCONFIG)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

SERVER_IP="$(detect_server_ip)"
if [ -z "$SERVER_IP" ]; then
  error_exit "Não foi possível detectar o IP do servidor automaticamente."
fi
success "IP detectado: ${SERVER_IP}"

info "Raiz do projeto: ${PROJECT_ROOT}"
echo ""

if [ "$(id -u)" -ne 0; then
  if ! command -v sudo >/dev/null 2>&1; then
    error_exit "Este script requer sudo (instale sudo ou execute como root)."
  fi
fi

info "Instalando dependências (nginx + openssl)..."
export DEBIAN_FRONTEND=noninteractive
if command -v apt >/dev/null 2>&1; then
  sudo apt update -qq
  sudo apt install -y nginx openssl
else
  warning "apt não encontrado. Instale nginx e openssl manualmente e rode novamente."
  exit 1
fi
success "Dependências OK"

info "Gerando certificado self-signed (SAN IP) em ${CERT_DIR}..."
sudo mkdir -p "$CERT_DIR"

OPENSSL_CNF="$(mktemp)"
cat > "$OPENSSL_CNF" <<EOF
[req]
distinguished_name=req_distinguished_name
x509_extensions=v3_req
prompt=no

[req_distinguished_name]
CN=${SERVER_IP}

[v3_req]
subjectAltName=@alt_names
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
IP.1 = ${SERVER_IP}
EOF

sudo openssl req -x509 -nodes -newkey rsa:2048 \
  -days 825 \
  -keyout "$CERT_KEY" \
  -out "$CERT_CRT" \
  -config "$OPENSSL_CNF" \
  -extensions v3_req >/dev/null 2>&1

rm -f "$OPENSSL_CNF"
sudo chmod 600 "$CERT_KEY"
success "Certificado gerado: ${CERT_CRT}"

info "Copiando certificado público para o projeto (para facilitar download)..."
sudo mkdir -p "${PROJECT_ROOT}/certs"
sudo cp -f "$CERT_CRT" "${PROJECT_ROOT}/certs/zentria-ip.crt"
sudo chmod 644 "${PROJECT_ROOT}/certs/zentria-ip.crt"
success "Cert público em: ${PROJECT_ROOT}/certs/zentria-ip.crt"

info "Criando configuração do Nginx (${NGINX_SITE_NAME})..."
NGINX_SITE_PATH="/etc/nginx/sites-available/${NGINX_SITE_NAME}"

sudo tee "$NGINX_SITE_PATH" >/dev/null <<EOF
# Zentria - HTTPS por IP (self-signed)
# Gerado por: install/https_autoconfig.sh

map \$http_upgrade \$connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl http2 default_server;
  listen [::]:443 ssl http2 default_server;
  server_name _;

  ssl_certificate     ${CERT_CRT};
  ssl_certificate_key ${CERT_KEY};

  # Evita bloqueio de uploads (base64/webhook e arquivos)
  client_max_body_size 60m;

  # Headers úteis
  proxy_set_header Host \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$scheme;

  # Backend API (Node/Express)
  location /api/ {
    proxy_pass http://127.0.0.1:${BACKEND_PORT};
    proxy_http_version 1.1;
  }

  # Evolution WebSocket (Socket.IO)
  location /socket.io/ {
    proxy_pass http://127.0.0.1:${EVOLUTION_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  # Evolution REST endpoints usados pelo frontend
  location ~ ^/(instance|message|chat)/ {
    proxy_pass http://127.0.0.1:${EVOLUTION_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  # Frontend (serve -s dist -l 5173 / Vite)
  location / {
    proxy_pass http://127.0.0.1:${FRONTEND_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }
}
EOF

success "Nginx site criado: ${NGINX_SITE_PATH}"

info "Ativando site e recarregando Nginx..."
if [ -f /etc/nginx/sites-enabled/default ]; then
  sudo rm -f /etc/nginx/sites-enabled/default || true
fi

sudo ln -sf "$NGINX_SITE_PATH" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
sudo nginx -t
sudo systemctl restart nginx
success "Nginx reiniciado"

if command -v ufw >/dev/null 2>&1; then
  if sudo ufw status 2>/dev/null | grep -qi "Status: active"; then
    info "UFW ativo: liberando 80/tcp e 443/tcp..."
    sudo ufw allow 80/tcp >/dev/null || true
    sudo ufw allow 443/tcp >/dev/null || true
    success "Firewall atualizado"
  fi
fi

info "Ajustes recomendados no backend (.env) — best-effort..."
BACKEND_ENV="${PROJECT_ROOT}/backend/.env"
if [ -f "$BACKEND_ENV" ]; then
  # Para o backend entender HTTPS atrás do proxy (rate limit / logs / HSTS condicional)
  set_env_value "$BACKEND_ENV" "TRUST_PROXY" "1"
  set_env_value "$BACKEND_ENV" "ENABLE_HSTS" "true"
  success "backend/.env atualizado (TRUST_PROXY=1, ENABLE_HSTS=true)"
else
  warning "backend/.env não encontrado. Se estiver usando proxy, adicione: TRUST_PROXY=1 e ENABLE_HSTS=true"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ HTTPS por IP configurado com sucesso${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Acesse: ${BLUE}https://${SERVER_IP}${NC}"
echo ""
echo "📌 Próximos passos no Zentria:"
echo "- Em Configurações → Evolution API → URL da API: https://${SERVER_IP}"
echo "- (Sem porta e sem /api)"
echo ""
echo "📌 Confiar no certificado (para remover o aviso do navegador):"
echo "- Cert público: ${PROJECT_ROOT}/certs/zentria-ip.crt"
echo "- Windows: importar em 'Autoridades de Certificação Raiz Confiáveis' (LocalMachine)"
echo "- Android: Configurações → Segurança → Instalar certificado (CA) (pode variar por fabricante)"
echo ""
echo "Dica: para copiar o cert para seu PC:"
echo "  scp root@${SERVER_IP}:${PROJECT_ROOT}/certs/zentria-ip.crt ."
echo ""


