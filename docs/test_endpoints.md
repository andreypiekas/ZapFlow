# Teste de Endpoints da Evolution API

## Como testar os endpoints diretamente

### 1. Teste via curl (PowerShell)

```powershell
# Substitua pelos seus valores
$baseUrl = "http://192.168.3.206:8080"
$apiKey = "B8349283-F143-429D-B6C2-9386E8016558"
$instanceName = "ZapFlow"
$chatId = "554984329374@s.whatsapp.net"
$phoneNumber = "554984329374"

# Endpoint 1: fetchMessages com remoteJid exato
curl -X POST "$baseUrl/message/fetchMessages/$instanceName" `
  -H "apikey: $apiKey" `
  -H "Content-Type: application/json" `
  -d "{`"where`": {`"remoteJid`": `"$chatId`"}, `"limit`": 100}"

# Endpoint 2: fetchMessages com remoteJid sem @s.whatsapp.net
curl -X POST "$baseUrl/message/fetchMessages/$instanceName" `
  -H "apikey: $apiKey" `
  -H "Content-Type: application/json" `
  -d "{`"where`": {`"remoteJid`": `"$phoneNumber`"}, `"limit`": 100}"

# Endpoint 3: fetchAllMessages
curl -X GET "$baseUrl/message/fetchAllMessages/$instanceName" `
  -H "apikey: $apiKey"

# Endpoint 4: fetchMessages sem where (busca recentes)
curl -X POST "$baseUrl/message/fetchMessages/$instanceName" `
  -H "apikey: $apiKey" `
  -H "Content-Type: application/json" `
  -d "{`"limit`": 100}"

# Endpoint 5: chat/findChats com include messages
curl -X POST "$baseUrl/chat/findChats/$instanceName" `
  -H "apikey: $apiKey" `
  -H "Content-Type: application/json" `
  -d "{`"where`": {`"id`": `"$chatId`"}, `"include`": [`"messages`"], `"limit`": 1}"
```

### 2. Teste via Postman

1. Crie uma nova requisição POST
2. URL: `http://192.168.3.206:8080/message/fetchMessages/ZapFlow`
3. Headers:
   - `apikey: B8349283-F143-429D-B6C2-9386E8016558`
   - `Content-Type: application/json`
4. Body (JSON):
```json
{
  "where": {
    "remoteJid": "554984329374@s.whatsapp.net"
  },
  "limit": 100
}
```

### 3. Verificar logs do Docker

```bash
# Ver logs do container da Evolution API
docker logs evolution_api --tail 100

# Ou se o container tiver outro nome
docker ps  # Para ver o nome do container
docker logs <nome_do_container> --tail 100
```

### 4. Verificar configurações do banco de dados

Verifique se as seguintes variáveis estão configuradas no docker-compose.yml:
- `STORE_MESSAGES=true` (importante para armazenar mensagens)
- `DATABASE_ENABLED=true`
- `DATABASE_PROVIDER=postgresql`
- `DATABASE_CONNECTION_URI=...`

### 5. Testar WebSocket

Abra o console do navegador e execute:

```javascript
const ws = new WebSocket('ws://192.168.3.206:8080/chat/ZapFlow');
ws.onopen = () => console.log('WebSocket conectado!');
ws.onmessage = (event) => console.log('Mensagem recebida:', event.data);
ws.onerror = (error) => console.error('Erro:', error);
ws.onclose = () => console.log('WebSocket fechado');
```

## O que verificar nos logs

1. Se os endpoints retornam dados vazios `[]` ou erro
2. Se há mensagens de erro sobre banco de dados
3. Se há mensagens sobre armazenamento de mensagens
4. Se o WebSocket está conectando corretamente

