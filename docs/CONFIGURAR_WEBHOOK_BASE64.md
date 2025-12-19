# Configurar Webhook Base64 na Evolution API

## 🎯 Solução para Imagens sem URL

O **Webhook Base64** da Evolution API resolve o problema de `imageMessage: {}` vazio quando mensagens são buscadas do banco via REST API.

Quando habilitado, a Evolution API envia os dados da mídia em **base64** no payload do webhook, permitindo exibir imagens mesmo sem URL disponível.

## 📋 Pré-requisitos

- Evolution API v2.3.4 ou superior instalada e rodando
- Acesso à interface web da Evolution API
- URL pública ou IP acessível do seu backend (para receber webhooks)

## 🔧 Passo a Passo

### 1. Acessar a Interface da Evolution API

Acesse a interface web da Evolution API no navegador:
```
http://SEU_IP:8080
```

### 2. Navegar para Configurações de Webhook

1. No menu lateral esquerdo, clique em **"Events"**
2. Selecione **"Webhook"**

### 3. Configurar o Webhook

#### 3.1 Habilitar Webhook

1. Localize a opção **"Enabled"**
2. Ative o toggle para **ON** (verde)

#### 3.2 Configurar URL do Webhook

1. No campo **"URL"**, insira a URL do seu backend:
   ```
   http://SEU_IP_BACKEND:3001/api/webhook/evolution
   ```
   
   **Exemplo:**
   ```
   http://192.168.101.234:3001/api/webhook/evolution
   ```
   
   **Nota:** 
   - Substitua `SEU_IP_BACKEND` pelo IP do servidor onde está rodando o backend do ZapFlow
   - A porta padrão é `3001`, mas verifique no seu `backend/server.js` ou `.env`
   - Para produção com domínio público, use HTTPS:
     ```
     https://seu-dominio.com/api/webhook/evolution
     ```

#### 3.3 Habilitar Webhook Base64 ⭐ **CRÍTICO**

1. Localize a opção **"Webhook Base64"** (marcada com seta vermelha na imagem)
2. **ATIVE o toggle para ON** (verde)
3. Esta é a configuração mais importante - quando habilitada, a mídia vem em base64

#### 3.4 Configurar Eventos

1. Selecione os eventos que deseja receber
2. **Mínimo necessário:**
   - ✅ `MESSAGES_UPSERT` (obrigatório para receber mensagens)
3. **Recomendado para funcionalidade completa:**
   - ✅ `MESSAGES_UPSERT`
   - ✅ `MESSAGES_UPDATE`
   - ✅ `CHATS_UPSERT`
   - ✅ `CHATS_UPDATE`
   - ✅ `CONTACTS_UPSERT`
   - ✅ `CONNECTION_UPDATE`

4. Você pode usar **"Mark All"** para selecionar todos os eventos
5. Ou **"Unmark All"** para desmarcar e escolher apenas os necessários

### 4. Salvar Configurações

1. Clique em **"Save"** ou **"Salvar"** (se disponível)
2. Ou simplesmente feche a página - as configurações são salvas automaticamente

## ✅ Verificação

### 1. Testar o Endpoint

Você pode testar se o endpoint está funcionando:

```bash
curl -X POST http://SEU_IP_BACKEND:3001/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -d '{"test": "ok"}'
```

Deve retornar:
```json
{"received": true, "event": "unknown"}
```

### 2. Verificar Logs do Backend

Quando uma mensagem com mídia for recebida, você verá nos logs:

```
[WEBHOOK] Evento recebido: messages.upsert
[WEBHOOK] ✅ Mensagem com base64 salva: MESSAGE_ID (image/jpeg)
```

### 3. Testar Enviando uma Imagem

1. Envie uma imagem pelo WhatsApp para o número conectado na Evolution API
2. Verifique os logs do backend
3. Verifique se a imagem aparece corretamente no chat do ZapFlow

## 🔍 Como Funciona

### Fluxo Normal (sem Webhook Base64)
1. Mensagem recebida → Evolution API salva no banco
2. `imageMessage: {}` vem vazio do banco
3. URL não disponível → Imagem não carrega ❌

### Fluxo com Webhook Base64 ✅
1. Mensagem recebida → Evolution API envia webhook com base64
2. Backend recebe webhook → Salva base64 no banco
3. Frontend busca mensagem → Encontra base64 → Cria `data:image/jpeg;base64,...`
4. Imagem carrega corretamente ✅

## 📝 Notas Importantes

### 1. Performance
- Base64 aumenta o tamanho dos payloads (~33% maior que binário)
- Para muitos webhooks, isso pode aumentar o tráfego de rede
- Para a maioria dos casos, o impacto é mínimo

### 2. Segurança
- O endpoint de webhook não requer autenticação por padrão
- **Recomendação:** Implemente validação de origem se expor publicamente
- Considere usar HTTPS em produção

### 3. Mensagens Antigas
- Webhooks só recebem mensagens **novas** (após ativação)
- Mensagens antigas do banco ainda podem não ter URL
- A solução funciona para todas as mensagens **futuras**

### 4. Fallback
- O código ainda tenta buscar URLs normalmente
- Base64 é usado apenas quando URL não está disponível
- WebSocket continua funcionando como antes

## 🐛 Troubleshooting

### Webhook não está sendo recebido

1. **Verifique se o webhook está habilitado:**
   - Toggle "Enabled" deve estar ON

2. **Verifique a URL:**
   - A URL deve ser acessível pela Evolution API
   - Teste acessar a URL no navegador ou curl

3. **Verifique firewall:**
   - Porta 3001 (ou a porta do backend) deve estar aberta
   - Evolution API precisa conseguir acessar o backend

4. **Verifique logs do backend:**
   ```bash
   # No servidor onde roda o backend
   tail -f logs/server.log
   # ou
   pm2 logs backend
   ```

### Base64 não está sendo processado

1. **Verifique se "Webhook Base64" está habilitado:**
   - Deve estar ON (verde) na interface

2. **Verifique os logs:**
   - Deve aparecer `[WEBHOOK] ✅ Mensagem com base64 salva`

3. **Verifique o payload do webhook:**
   - Adicione log temporário no backend para ver o payload completo

### Imagens ainda não aparecem

1. **Limpe o cache do navegador:**
   - Ctrl+Shift+R (Windows/Linux)
   - Cmd+Shift+R (Mac)

2. **Verifique se o código foi atualizado:**
   - O código agora prioriza base64 quando disponível
   - Recompile o frontend se necessário

3. **Verifique mensagens antigas vs novas:**
   - Mensagens antigas (antes de ativar webhook) podem não ter base64
   - Envie uma nova imagem para testar

## 🔗 Links Úteis

- [Documentação Evolution API - Webhooks](https://doc.evolution-api.com/)
- [Guia de Compatibilidade de Versões](./EVOLUTION_VERSION_COMPATIBILITY.md)
- [Guia de Downgrade para v2.3.4](./GUIA_DOWNGRADE_VM_2.3.4.md)

