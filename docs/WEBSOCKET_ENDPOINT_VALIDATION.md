# Validação de Endpoint WebSocket - Evolution API

## Problema Identificado

O erro `404 Not Found` ao acessar `http://SEU_IP_SERVIDOR:8080/chat/ZapFlow` indica que esse endpoint **não existe** na Evolution API.

## Endpoints Corretos da Evolution API

### ✅ Endpoints que EXISTEM e FUNCIONAM:

1. **Buscar Chats (POST)**
   ```
   POST /chat/findChats/{instanceName}
   Headers: { apikey: "...", Content-Type: "application/json" }
   Body: { where: {}, include: ['messages'], limit: 100 }
   ```

2. **Buscar Instâncias (GET)**
   ```
   GET /instance/fetchInstances
   Headers: { apikey: "..." }
   ```

3. **Enviar Mensagem (POST)**
   ```
   POST /message/sendText/{instanceName}
   Headers: { apikey: "...", Content-Type: "application/json" }
   ```

### ❌ Endpoints que NÃO EXISTEM:

1. **GET /chat/{instanceName}** - ❌ Não existe (retorna 404)
2. **GET /chat/ZapFlow** - ❌ Não existe (retorna 404)

## WebSocket - Endpoint Correto

O WebSocket da Evolution API **NÃO usa** o endpoint `/chat/{instanceName}`.

### Possíveis Endpoints WebSocket:

1. **Socket.IO** (mais comum):
   ```
   ws://SEU_IP_SERVIDOR:8080/socket.io/?EIO=4&transport=websocket&instance=ZapFlow
   ```

2. **WebSocket direto** (se configurado):
   ```
   ws://SEU_IP_SERVIDOR:8080/ws/ZapFlow
   ```

3. **WebSocket com autenticação**:
   ```
   ws://SEU_IP_SERVIDOR:8080/socket.io/?instance=ZapFlow
   ```

## Como Verificar o Endpoint Correto

### 1. Verificar Documentação da Evolution API

Acesse a documentação oficial:
- https://doc.evolution-api.com/
- Verifique a seção sobre WebSocket/Real-time

### 2. Verificar Logs do Docker

```bash
docker logs evolution_api --tail 100 | grep -i websocket
docker logs evolution_api --tail 100 | grep -i socket
```

### 3. Verificar Configuração do Docker Compose

Verifique se `WEBSOCKET_ENABLED=true` está configurado:
```yaml
environment:
  - WEBSOCKET_ENABLED=true
```

### 4. Testar Endpoints WebSocket

No navegador (Console do DevTools):
```javascript
// Teste 1: Socket.IO
const ws1 = new WebSocket('ws://SEU_IP_SERVIDOR:8080/socket.io/?EIO=4&transport=websocket&instance=ZapFlow');
ws1.onopen = () => console.log('✅ Socket.IO conectado');
ws1.onerror = (e) => console.error('❌ Socket.IO erro:', e);

// Teste 2: WebSocket direto
const ws2 = new WebSocket('ws://SEU_IP_SERVIDOR:8080/ws/ZapFlow');
ws2.onopen = () => console.log('✅ WebSocket direto conectado');
ws2.onerror = (e) => console.error('❌ WebSocket direto erro:', e);
```

## Solução Implementada

O código já tenta múltiplos formatos de URL do WebSocket:

```typescript
const wsUrls = [
    `${baseWsUrl}/chat/${instanceName}`,  // ❌ Pode não existir
    `${baseWsUrl}/socket.io/?instance=${instanceName}`,  // ✅ Mais provável
    `${baseWsUrl}/socket.io/?EIO=4&transport=websocket&instance=${instanceName}`,  // ✅ Mais provável
    `${baseWsUrl}/ws/${instanceName}`  // ✅ Possível
];
```

## Recomendação

1. **Verificar documentação da Evolution API** para o endpoint WebSocket correto
2. **Testar cada endpoint** manualmente no console do navegador
3. **Verificar logs do Docker** para ver qual endpoint está sendo usado
4. **Atualizar o código** para usar apenas o endpoint que funciona

## Status Atual

- ✅ Sistema funciona via **polling** (sincronização periódica)
- ⚠️ WebSocket não conecta (mas não é crítico)
- ✅ Mensagens são recebidas mesmo sem WebSocket
- ✅ Feedback visual mostra status do WebSocket

## Próximos Passos

1. Verificar documentação oficial da Evolution API
2. Testar endpoints WebSocket manualmente
3. Atualizar código com endpoint correto quando identificado
4. Adicionar fallback para Socket.IO se necessário

