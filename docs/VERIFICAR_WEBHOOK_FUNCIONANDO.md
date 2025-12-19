# Guia: Verificar se o Webhook está Funcionando

Este guia ajuda a diagnosticar se o webhook da Evolution API está enviando eventos para o seu backend e se o base64 está sendo salvo corretamente.

## ✅ Checklist de Configuração

Antes de verificar, confirme que:

- [ ] **Webhook Enabled**: ON (verde) na Evolution API
- [ ] **URL do Webhook**: `http://192.168.101.234:3001/api/webhook/evolution`
- [ ] **Webhook Base64**: ON (verde) na Evolution API
- [ ] **MESSAGES_UPSERT**: ON (verde) na lista de eventos
- [ ] **Backend rodando**: Verifique com `pm2 status` ou `pm2 logs backend`

## 🔍 Passo 1: Verificar Logs do Backend

### Opção A: Usar PM2 (Recomendado)

```bash
# Ver logs em tempo real
pm2 logs backend

# Ver apenas as últimas 100 linhas
pm2 logs backend --lines 100

# Limpar logs antigos e ver apenas novos
pm2 flush backend
pm2 logs backend
```

### Opção B: Verificar arquivo de log (se existir)

```bash
# Se usar arquivo de log
tail -f logs/server.log

# Ou procurar por [WEBHOOK] no arquivo
grep -i "\[WEBHOOK\]" logs/server.log
```

### O que procurar nos logs:

✅ **Sucesso - Webhook funcionando:**
```
[WEBHOOK] Evento recebido: MESSAGES_UPSERT
[WEBHOOK] ✅ Mensagem com base64 salva: 3AF748B8338777F9B792 (image/jpeg)
```

❌ **Problema - Webhook não recebendo:**
- Nenhuma mensagem `[WEBHOOK] Evento recebido`
- Backend não está recebendo requisições

⚠️ **Problema - Webhook recebendo mas sem base64:**
```
[WEBHOOK] Evento recebido: MESSAGES_UPSERT
(apenas isso, sem a mensagem de base64 salvo)
```

## 🧪 Passo 2: Testar Manualmente o Endpoint

Teste se o endpoint está acessível e funcionando:

```bash
# De dentro da VM ou do mesmo servidor do backend
curl -X POST http://192.168.101.234:3001/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "test.event",
    "data": {
      "message": "Teste de webhook"
    }
  }'
```

**Resposta esperada:**
```json
{"received":true,"event":"test.event"}
```

Se retornar erro ou timeout:
- Verifique se o backend está rodando (`pm2 status`)
- Verifique se a porta 3001 está aberta no firewall
- Verifique se o IP está correto

## 📨 Passo 3: Enviar Mensagem de Teste

1. **Envie uma NOVA imagem** pelo WhatsApp para o número conectado na Evolution API
2. **Observe os logs do backend** imediatamente após enviar:
   ```bash
   pm2 logs backend --lines 50
   ```

3. **O que deve aparecer:**
   ```
   [WEBHOOK] Evento recebido: MESSAGES_UPSERT
   [WEBHOOK] ✅ Mensagem com base64 salva: MESSAGE_ID (image/jpeg)
   ```

## 🗄️ Passo 4: Verificar Base64 no Banco de Dados

Verifique se o base64 foi salvo no banco:

```sql
-- Conectar ao PostgreSQL
psql -U postgres -d zapflow

-- Ver mensagens salvas pelo webhook
SELECT 
  data_key as message_id,
  data_value->>'mimeType' as mime_type,
  LENGTH(data_value->>'dataUrl') as data_url_length,
  data_value->>'timestamp' as timestamp
FROM user_data
WHERE data_type = 'webhook_messages'
ORDER BY updated_at DESC
LIMIT 10;

-- Ver conteúdo completo de uma mensagem específica
SELECT data_value
FROM user_data
WHERE data_type = 'webhook_messages' 
  AND data_key = 'MESSAGE_ID_AQUI';
```

**Substitua `MESSAGE_ID_AQUI`** pelo ID real da mensagem (ex: `3AF748B8338777F9B792`)

## 🐛 Problemas Comuns e Soluções

### Problema 1: Nenhum log `[WEBHOOK] Evento recebido`

**Possíveis causas:**
- Evolution API não está conseguindo acessar a URL do webhook
- Firewall bloqueando requisições
- Backend não está rodando

**Soluções:**
1. Verifique se o backend está rodando:
   ```bash
   pm2 status
   # Se não estiver rodando:
   cd /caminho/do/projeto
   pm2 start backend/server.js --name backend
   ```

2. Teste a conectividade da Evolution API para o backend:
   ```bash
   # Da VM onde está a Evolution API, teste se consegue acessar o backend
   curl http://192.168.101.234:3001/
   ```

3. Verifique se a porta está aberta:
   ```bash
   # No servidor do backend
   netstat -tulpn | grep 3001
   # Ou
   ss -tulpn | grep 3001
   ```

### Problema 2: Webhook recebendo mas sem base64

**Sintomas:**
- Logs mostram `[WEBHOOK] Evento recebido: MESSAGES_UPSERT`
- Mas NÃO mostra `[WEBHOOK] ✅ Mensagem com base64 salva`

**Possíveis causas:**
- Webhook Base64 está OFF (mesmo que pareça estar ON)
- Estrutura do payload diferente do esperado

**Soluções:**
1. **Verifique novamente o toggle "Webhook Base64"**:
   - Acesse a Evolution API
   - Vá em Events > Webhook
   - Certifique-se de que "Webhook Base64" está **ON (verde)**
   - Se estiver OFF, ative e **salve** (algumas interfaces precisam de confirmação)

2. **Adicione logs temporários** no backend para debugar:
   Edite `backend/server.js` na linha 1472:
   ```javascript
   // Se for mensagem de mídia e tiver base64, salva no banco
   console.log('[WEBHOOK DEBUG] imageMsg:', imageMsg ? 'existe' : 'null', 
               'base64:', imageMsg?.base64 ? 'presente' : 'ausente');
   if ((imageMsg || videoMsg || audioMsg || documentMsg) && 
       (imageMsg?.base64 || videoMsg?.base64 || audioMsg?.base64 || documentMsg?.base64)) {
   ```

3. **Verifique o payload completo**:
   Adicione temporariamente no backend:
   ```javascript
   console.log('[WEBHOOK DEBUG] Payload completo:', JSON.stringify(event, null, 2));
   ```

### Problema 3: Base64 salvo mas imagens não carregam no frontend

**Sintomas:**
- Logs mostram base64 sendo salvo
- Banco de dados tem os dados
- Mas frontend ainda mostra "Image couldn't be loaded"

**Possíveis causas:**
- Frontend não está buscando base64 do banco
- Cache do navegador
- messageId não corresponde

**Soluções:**
1. **Limpar cache do navegador**:
   - Pressione `Ctrl+Shift+Del` (Windows/Linux) ou `Cmd+Shift+Del` (Mac)
   - Limpe cache e cookies
   - Ou use modo anônimo/privado

2. **Verificar logs do frontend**:
   - Abra DevTools (F12)
   - Vá na aba Console
   - Procure por: `[ChatInterface] ✅ Base64 encontrado no banco (webhook)`

3. **Verificar se messageId corresponde**:
   - No console do navegador, verifique o messageId que está sendo buscado
   - Compare com o messageId no banco de dados

### Problema 4: Mensagens antigas não carregam

**Isso é esperado!** 

- Webhooks só recebem mensagens **novas** (após ativação do webhook)
- Mensagens antigas foram criadas antes do webhook estar configurado
- **Solução**: Envie uma **nova imagem** para testar. Mensagens antigas podem não ter base64.

## ✅ Verificação Final

Após seguir todos os passos, você deve ver:

1. ✅ Logs do backend mostrando webhooks sendo recebidos
2. ✅ Base64 sendo salvo no banco de dados
3. ✅ Frontend buscando e exibindo as imagens

Se tudo estiver funcionando:
- Novas mensagens com imagem devem carregar automaticamente
- Você verá `[ChatInterface] ✅ Base64 encontrado no banco (webhook)` no console do navegador

## 📝 Próximos Passos

Se o webhook estiver funcionando para mensagens novas, mas mensagens antigas não carregam:
- Isso é normal - mensagens antigas não têm base64 salvo
- Considere reenviar imagens importantes ou aguardar novas mensagens
- O problema está resolvido para todas as mensagens futuras

