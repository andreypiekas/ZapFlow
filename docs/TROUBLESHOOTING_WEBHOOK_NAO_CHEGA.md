# Troubleshooting: Webhook não está chegando ao Backend

Se após enviar uma mensagem/imagem pelo WhatsApp nada aparece nos logs do `pm2 logs backend`, significa que a Evolution API não está enviando o webhook. Este guia ajuda a diagnosticar e resolver.

## 🔍 Diagnóstico

### 1. Verificar se o Backend está acessível da Evolution API

Teste se a Evolution API consegue acessar o backend:

```bash
# Da VM onde está a Evolution API (ou do mesmo servidor)
curl http://192.168.101.234:3001/

# Deve retornar algo como:
# {"service":"Zentria Backend API","version":"1.0.0",...}
```

**Se retornar erro de conexão:**
- Backend pode não estar rodando
- Firewall bloqueando porta 3001
- IP/porta incorretos

### 2. Verificar se o Backend está rodando

```bash
pm2 status
# Deve mostrar "backend" como "online"

# Ou verificar processo na porta 3001
netstat -tulpn | grep 3001
# Ou
ss -tulpn | grep 3001
```

### 3. Verificar configuração do Webhook na Evolution API

Acesse a interface da Evolution API e verifique:

1. **Events → Webhook**
2. Confirme:
   - ✅ **Enabled**: ON (verde)
   - ✅ **URL**: `http://192.168.101.234:3001/api/webhook/evolution`
   - ✅ **Webhook Base64**: ON (verde)
   - ✅ **MESSAGES_UPSERT**: ON (verde)

### 4. ⚠️ IMPORTANTE: Reiniciar a Instância após Configurar Webhook

**A Evolution API precisa reiniciar a instância para aplicar as configurações de webhook!**

#### Opção A: Via Interface Web

1. Acesse a Evolution API
2. Vá em **Instances** ou **Instâncias**
3. Localize sua instância (ex: `piekas`)
4. Clique em **Restart** ou **Reiniciar**
5. Aguarde a instância reconectar (status "open")

#### Opção B: Via API REST

```bash
# Parar instância
curl -X DELETE http://192.168.101.234:8080/instance/delete/piekas \
  -H "apikey: B8349283-F143-429D-B6C2-9386E8016558"

# Aguardar alguns segundos

# Criar/reiniciar instância (se necessário)
curl -X POST http://192.168.101.234:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: B8349283-F143-429D-B6C2-9386E8016558" \
  -d '{
    "instanceName": "piekas",
    "qrcode": true
  }'
```

### 5. Verificar Logs da Evolution API

Verifique se a Evolution API está tentando enviar webhooks:

```bash
# Se usar Docker
docker logs evolution_api --tail 100 | grep -i webhook

# Ou
docker-compose logs evolution_api | grep -i webhook
```

Procure por mensagens de erro relacionadas a webhook, como:
- `webhook error`
- `failed to send webhook`
- `ECONNREFUSED`
- `timeout`

### 6. Testar conectividade entre Evolution API e Backend

Da VM onde está a Evolution API, teste:

```bash
# Teste HTTP básico
curl -v http://192.168.101.234:3001/

# Teste o endpoint de webhook diretamente
curl -v -X POST http://192.168.101.234:3001/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -d '{"test": "ok"}'

# Verificar se há firewall bloqueando
telnet 192.168.101.234 3001
# Se conectar, está OK. Se der timeout/refused, firewall está bloqueando
```

### 7. Verificar URL do Webhook

⚠️ **URL deve ser acessível da Evolution API!**

- Se a Evolution API está em `192.168.101.234:8080`
- E o backend está em `192.168.101.234:3001`
- A URL deve ser: `http://192.168.101.234:3001/api/webhook/evolution`

**NÃO use:**
- ❌ `localhost` ou `127.0.0.1` (Evolution API não consegue acessar)
- ❌ `http://localhost:3001` (não funciona em Docker)
- ❌ URLs externas se não houver rota de rede

**USE:**
- ✅ IP real da VM/servidor (`192.168.101.234`)
- ✅ URL completa com protocolo (`http://`)
- ✅ Porta correta (`3001`)

### 8. Verificar "Webhook by Events"

Se o toggle **"Webhook by Events"** estiver ON, a Evolution API pode estar tentando enviar para uma URL diferente.

**Com "Webhook by Events" ON:**
- URL base: `http://192.168.101.234:3001/api/webhook/evolution`
- URL real usada: `http://192.168.101.234:3001/api/webhook/evolution/MESSAGES_UPSERT`

**Solução:**
- Opção 1: Desative "Webhook by Events" (OFF)
- Opção 2: Ajuste o backend para aceitar URLs com `/MESSAGES_UPSERT` no final

### 9. Verificar Configuração Global vs Instância

Algumas versões da Evolution API têm configurações de webhook:
- **Globais** (aplicam a todas as instâncias)
- **Por instância** (configuração específica)

Verifique se você configurou o webhook no lugar correto.

### 10. Verificar Versão da Evolution API

Versões antigas ou muito recentes podem ter bugs com webhooks.

```bash
# Ver versão
curl http://192.168.101.234:8080/
```

Recomendada: **v2.3.4** (conforme `docker-compose.yml`)

## 🔧 Soluções Rápidas

### Solução 1: Reiniciar Instância (Mais Comum)

1. Pare a instância na Evolution API
2. Inicie novamente
3. Configure o webhook novamente
4. Reinicie a instância novamente
5. Teste enviando uma nova mensagem

### Solução 2: Verificar Backend está Acessível

```bash
# No servidor do backend
# Verificar se está rodando
pm2 status

# Se não estiver, iniciar
cd /home/piekas/ZapFlow
pm2 start backend/server.js --name backend

# Verificar porta
netstat -tulpn | grep 3001
```

### Solução 3: Testar com curl direto

```bash
# Da Evolution API ou mesmo servidor, teste:
curl -X POST http://192.168.101.234:3001/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "MESSAGES_UPSERT",
    "data": {
      "messages": [{
        "key": {
          "remoteJid": "554984329374@s.whatsapp.net",
          "id": "TEST456"
        },
        "message": {
          "imageMessage": {
            "base64": "test123",
            "mimetype": "image/jpeg"
          }
        }
      }]
    }
  }'
```

Se funcionar, o problema é a Evolution API não enviando. Se não funcionar, problema é no backend/rede.

## ✅ Checklist Final

Antes de desistir, confirme:

- [ ] Backend está rodando (`pm2 status` mostra `backend` online)
- [ ] Backend está acessível (`curl http://192.168.101.234:3001/` funciona)
- [ ] Webhook Enabled está ON na Evolution API
- [ ] URL do webhook está correta (IP real, não localhost)
- [ ] Webhook Base64 está ON
- [ ] MESSAGES_UPSERT está ON
- [ ] Instância foi **reiniciada** após configurar webhook
- [ ] Porta 3001 não está bloqueada por firewall
- [ ] Evolution API consegue acessar o IP do backend

## 📝 Próximos Passos

Se nada funcionar:

1. Verifique logs da Evolution API para erros de webhook
2. Teste com uma ferramenta de webhook (como webhook.site) para ver se Evolution API envia
3. Verifique se há proxy/firewall intermediário bloqueando
4. Considere usar WebSocket como alternativa (já está implementado)

## 🔄 Alternativa: Usar WebSocket

Se o webhook não funcionar, o sistema já tem suporte para WebSocket. Quando mensagens chegam via WebSocket, elas devem ter URLs completas e o problema de `imageMessage: {}` vazio pode não ocorrer.

