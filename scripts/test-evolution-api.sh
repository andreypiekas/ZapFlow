#!/bin/bash

# Script para testar endpoints da Evolution API e diagnosticar erro 500

BASE_URL="http://192.168.101.234:8080"
API_KEY="B8349283-F143-429D-B6C2-9386E8016558"
INSTANCE_NAME="ZapFlow"

echo "=========================================="
echo "Teste de Endpoints da Evolution API"
echo "=========================================="
echo ""

echo "[1] Testando findChats com body vazio..."
curl -X POST "${BASE_URL}/chat/findChats/${INSTANCE_NAME}" \
  -H "apikey: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nStatus: %{http_code}\n" \
  -s

echo ""
echo "[2] Testando findChats com where vazio..."
curl -X POST "${BASE_URL}/chat/findChats/${INSTANCE_NAME}" \
  -H "apikey: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"where": {}}' \
  -w "\nStatus: %{http_code}\n" \
  -s

echo ""
echo "[3] Testando findChats com include messages..."
curl -X POST "${BASE_URL}/chat/findChats/${INSTANCE_NAME}" \
  -H "apikey: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"where": {}, "include": ["messages"], "limit": 100}' \
  -w "\nStatus: %{http_code}\n" \
  -s

echo ""
echo "[4] Testando findChats sem include messages..."
curl -X POST "${BASE_URL}/chat/findChats/${INSTANCE_NAME}" \
  -H "apikey: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"where": {}, "limit": 100}' \
  -w "\nStatus: %{http_code}\n" \
  -s

echo ""
echo "[5] Verificando logs da Evolution API (últimas 20 linhas com erro)..."
docker logs evolution_api --tail 100 2>&1 | grep -i "error\|500\|exception" | tail -20

echo ""
echo "=========================================="
echo "Teste concluído"
echo "=========================================="

