# 📘 Documentação Técnica - ZapFlow Manager

**Versão:** 1.3.0  
**Última Atualização:** 2025-01-XX

---

## 🏗️ Arquitetura do Sistema

### Visão Geral

O ZapFlow Manager é uma aplicação full-stack que combina:
- **Frontend React** (SPA) para interface do usuário
- **Backend API Node.js/Express** para persistência de dados
- **Evolution API** (Docker) para comunicação com WhatsApp
- **PostgreSQL** para armazenamento de dados
- **Socket.IO** para comunicação em tempo real

### Fluxo de Dados

```
┌─────────────┐
│   Browser   │
│  (React)    │
└──────┬──────┘
       │
       ├─── HTTP/REST ────► Backend API (Node.js/Express)
       │                      │
       │                      ├─── PostgreSQL (Dados)
       │                      └─── JWT (Autenticação)
       │
       ├─── Socket.IO ──────► Evolution API (Docker)
       │                      │
       │                      └─── WhatsApp Servers
       │
       └─── HTTP/REST ────► Google APIs
                            ├─── Gemini AI
                            └─── People API
```

---

## 🎨 Frontend

### Stack Tecnológica

- **React 19.2.0** - Framework UI
- **TypeScript 5.8.2** - Tipagem estática
- **Vite 6.2.0** - Build tool e dev server
- **Tailwind CSS 3.4.1** - Framework CSS (PostCSS)
- **Socket.IO Client 4.7.5** - Comunicação em tempo real
- **Lucide React 0.554.0** - Ícones

### Estrutura de Arquivos

```
/
├── App.tsx                 # Componente principal
├── index.tsx              # Entry point
├── index.html             # HTML base
├── vite.config.ts        # Configuração Vite
├── tailwind.config.js    # Configuração Tailwind
├── postcss.config.js     # Configuração PostCSS
├── tsconfig.json         # Configuração TypeScript
├── components/           # Componentes React
│   ├── ChatInterface.tsx
│   ├── Settings.tsx
│   ├── Login.tsx
│   └── ...
├── services/            # Serviços e lógica de negócio
│   ├── apiService.ts    # Comunicação com backend
│   ├── whatsappService.ts # Comunicação com Evolution API
│   ├── chatbotService.ts # Lógica do chatbot
│   ├── securityService.ts # Criptografia de dados
│   └── storageService.ts # Persistência híbrida
├── types.ts             # Definições TypeScript
└── constants.ts         # Constantes da aplicação
```

### Socket.IO Client

#### Configuração

O Socket.IO está configurado para:
- **Tentar WebSocket primeiro**, fallback automático para polling HTTP
- **Reconexão automática** com backoff exponencial
- **Autenticação** via query parameters (`instance` e `apikey`)

```typescript
const socket = io(apiConfig.baseUrl, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    query: {
        instance: instanceName,
        apikey: apiKey
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    timeout: 20000
});
```

#### Eventos Implementados

- **`messages.upsert`** - Novas mensagens ou atualizações
- **`messages.update`** - Atualizações de status (entregue, lida)
- **`qrcode.updated`** - Atualizações de QR Code

#### Tratamento de Erros

- Erros esperados de WebSocket durante conexão inicial são filtrados do console
- Sistema continua funcionando via polling se WebSocket falhar
- Status visual no dashboard mostra estado da conexão

### Tailwind CSS

#### Configuração para Produção

- **PostCSS** com Autoprefixer para compatibilidade
- **Build otimizado** - apenas classes usadas são incluídas
- **Minificação** automática no build de produção
- **Sem CDN** - CSS compilado localmente

#### Arquivos de Configuração

- `tailwind.config.js` - Configuração do Tailwind
- `postcss.config.js` - Configuração do PostCSS
- `src/index.css` - CSS principal com diretivas

### Segurança

#### Criptografia de Dados Sensíveis

O `SecurityService` criptografa dados sensíveis antes de salvar no localStorage:
- **API Keys** (configurações da Evolution API)
- **Tokens de autenticação** (JWT)
- **Dados de usuário** (nome, email)

**Método:** Base64 + Salt (simples, mas eficaz para dados não críticos)

#### Opção PostgreSQL-Only

Configuração disponível para usar **apenas PostgreSQL**:
- Dados sensíveis não são salvos no localStorage
- Tudo é persistido no banco de dados
- Ideal para ambientes compartilhados

---

## 🔧 Backend API

### Stack Tecnológica

- **Node.js 18+** - Runtime
- **Express 4.18.2** - Framework web
- **PostgreSQL 12+** - Banco de dados
- **JWT (jsonwebtoken 9.0.2)** - Autenticação
- **bcryptjs 2.4.3** - Hash de senhas
- **express-rate-limit 7.1.5** - Rate limiting

### Estrutura de Banco de Dados

#### Tabelas Principais

**`users`**
- `id` (SERIAL PRIMARY KEY)
- `username` (VARCHAR UNIQUE)
- `password` (VARCHAR - bcrypt hash)
- `name` (VARCHAR)
- `email` (VARCHAR)
- `role` (VARCHAR - 'ADMIN' ou 'AGENT')
- `created_at`, `updated_at` (TIMESTAMP)

**`user_data`**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER REFERENCES users)
- `data_type` (VARCHAR)
- `data_key` (VARCHAR)
- `data_value` (JSONB)
- `created_at`, `updated_at` (TIMESTAMP)

**`departments`**
- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR)
- `description` (TEXT)
- `color` (VARCHAR)
- `created_at`, `updated_at` (TIMESTAMP)

**`contacts`**
- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR)
- `phone` (VARCHAR)
- `email` (VARCHAR)
- `avatar` (TEXT)
- `source` (VARCHAR - 'manual' ou 'google')
- `created_at`, `updated_at` (TIMESTAMP)

**`quick_replies`**
- `id` (SERIAL PRIMARY KEY)
- `title` (VARCHAR)
- `content` (TEXT)
- `created_at`, `updated_at` (TIMESTAMP)

**`workflows`**
- `id` (SERIAL PRIMARY KEY)
- `title` (VARCHAR)
- `description` (TEXT)
- `trigger_keywords` (TEXT[])
- `steps` (JSONB)
- `target_department_id` (INTEGER REFERENCES departments)
- `created_at`, `updated_at` (TIMESTAMP)

### API Endpoints

#### Autenticação

**POST /api/auth/login**
- Autentica usuário e retorna JWT token
- Rate limit: 5 tentativas por 15 minutos

#### Perfil do Usuário

**PUT /api/user/profile**
- Atualiza nome e email do usuário logado
- Requer autenticação

#### Gestão de Usuários (ADMIN apenas)

**GET /api/users**
- Lista todos os usuários

**POST /api/users**
- Cria novo usuário

**PUT /api/users/:id**
- Atualiza usuário existente

**DELETE /api/users/:id**
- Remove usuário

#### Departamentos

**GET /api/departments**
- Lista todos os departamentos

**POST /api/departments**
- Cria novo departamento

**PUT /api/departments/:id**
- Atualiza departamento

**DELETE /api/departments/:id**
- Remove departamento

#### Contatos

**GET /api/contacts**
- Lista todos os contatos

**POST /api/contacts**
- Cria novo contato

**PUT /api/contacts/:id**
- Atualiza contato

**DELETE /api/contacts/:id**
- Remove contato

#### Respostas Rápidas

**GET /api/quick-replies**
- Lista todas as respostas rápidas

**POST /api/quick-replies**
- Cria nova resposta rápida

**PUT /api/quick-replies/:id**
- Atualiza resposta rápida

**DELETE /api/quick-replies/:id**
- Remove resposta rápida

#### Workflows

**GET /api/workflows**
- Lista todos os workflows

**POST /api/workflows**
- Cria novo workflow

**PUT /api/workflows/:id**
- Atualiza workflow

**DELETE /api/workflows/:id**
- Remove workflow

#### Dados Genéricos (Legacy)

**GET /api/data/:dataType?key=opcional**
- Busca dados do tipo especificado

**POST /api/data/:dataType**
- Salva dados do tipo especificado

**PUT /api/data/:dataType/:key**
- Atualiza dados específicos

**DELETE /api/data/:dataType/:key**
- Remove dados específicos

**POST /api/data/:dataType/batch**
- Salva múltiplos dados de uma vez

#### Health Check

**GET /api/health**
- Verifica saúde do servidor e banco de dados
- Não requer autenticação

### Rate Limiting

O backend implementa rate limiting em três níveis:

1. **Geral** (todas as rotas)
   - 100 requisições por 15 minutos por IP
   - Configurável via `RATE_LIMIT_MAX` e `RATE_LIMIT_WINDOW_MS`

2. **Login** (prevenção de brute force)
   - 5 tentativas por 15 minutos por IP/username
   - Configurável via `LOGIN_RATE_LIMIT_MAX` e `LOGIN_RATE_LIMIT_WINDOW_MS`

3. **Dados** (rotas de dados)
   - 200 requisições por minuto por usuário
   - Configurável via `DATA_RATE_LIMIT_MAX` e `DATA_RATE_LIMIT_WINDOW_MS`

### Segurança

- **JWT Tokens** com expiração de 7 dias
- **Senhas hasheadas** com bcrypt (10 rounds)
- **CORS configurável** por ambiente
- **Rate limiting** para prevenir DDoS e brute force
- **Validação de input** básica
- **SQL Injection** prevenido via prepared statements (pg)

---

## 🔌 Integração com Evolution API

### Endpoints Utilizados

#### Instâncias

- `GET /instance/fetchInstances` - Lista todas as instâncias
- `GET /instance/fetchInstance/:instanceName` - Detalhes de uma instância
- `POST /instance/create` - Cria nova instância
- `DELETE /instance/delete/:instanceName` - Remove instância

#### Mensagens

- `POST /message/sendText/:instance/:number` - Envia mensagem de texto
- `POST /message/sendMedia/:instance/:number` - Envia mídia
- `POST /message/sendContact/:instance/:number` - Envia contato (vCard)

#### Chats

- `GET /chat/fetchChats/:instance` - Lista chats
- `GET /chat/findChats/:instance` - Busca chats específicos

### Autenticação

A Evolution API requer `apikey` em:
- **Header:** `apikey: <token>`
- **Query Parameter:** `?apikey=<token>`
- **WebSocket:** `?apikey=<token>` na URL

### Formato de Mensagens

#### Envio de Contato (vCard)

```typescript
{
  number: "5549984329374",  // Número do contato (com código do país)
  contacts: {
    displayName: "Nome do Contato",
    contacts: [{
      fullName: "Nome Completo",
      phoneNumber: "+5549984329374"  // Com + e código do país
    }]
  }
}
```

---

## 🗄️ Persistência de Dados

### Estratégia Híbrida

O sistema usa uma estratégia híbrida de persistência:

1. **Prioridade 1:** Backend API (PostgreSQL)
2. **Fallback:** localStorage (criptografado)

### Dados Persistidos

#### No PostgreSQL (via API)

- ✅ Usuários e autenticação
- ✅ Departamentos
- ✅ Contatos
- ✅ Respostas rápidas
- ✅ Workflows
- ✅ Configurações do chatbot
- ✅ Dados de usuário (chats, preferências)

#### No localStorage (fallback/offline)

- Configurações da API (criptografadas)
- Chats e mensagens
- Estado da UI
- Preferências do usuário

### Criptografia

Dados sensíveis no localStorage são criptografados usando:
- **Método:** Base64 + Salt
- **Dados criptografados:**
  - API Keys
  - Tokens de autenticação
  - Dados de usuário

---

## 🚀 Build e Deploy

### Frontend

```bash
# Desenvolvimento
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview
```

**Arquivos gerados:**
- `dist/index.html` - HTML otimizado
- `dist/assets/index-*.css` - CSS minificado (Tailwind)
- `dist/assets/index-*.js` - JavaScript minificado e otimizado

### Backend

```bash
# Desenvolvimento (com watch)
npm run dev

# Produção
npm start
```

### Scripts Disponíveis

**Frontend:**
- `npm run dev` - Servidor de desenvolvimento (Vite)
- `npm run build` - Build de produção
- `npm run preview` - Preview do build

**Backend:**
- `npm run dev` - Servidor com watch mode
- `npm start` - Servidor de produção
- `npm run migrate` - Executa migrações do banco
- `npm run create-admin` - Cria usuário admin padrão
- `npm run update-user-name` - Atualiza nome de usuário
- `npm run validate-users` - Valida usuários no banco

---

## 🔍 Troubleshooting

### Socket.IO não conecta

1. Verifique se a Evolution API está rodando
2. Confirme que `apiKey` está configurada corretamente
3. Verifique logs do servidor Evolution API
4. Sistema funciona via polling mesmo se WebSocket falhar

### Erro de build do Tailwind

1. Verifique se `tailwind.config.js` está correto
2. Confirme que `postcss.config.js` existe
3. Verifique se `src/index.css` importa as diretivas corretamente
4. Execute `npm install` para garantir dependências instaladas

### Erro 429 (Too Many Requests)

1. Aguarde o período de rate limit
2. Ajuste limites no `.env` do backend se necessário
3. Verifique se não há múltiplas requisições simultâneas

### Dados não persistem

1. Verifique conexão com PostgreSQL
2. Confirme que backend está rodando
3. Verifique logs do backend para erros
4. Sistema usa localStorage como fallback automaticamente

---

## 📊 Monitoramento

### Health Checks

**Backend:**
- `GET /api/health` - Verifica servidor e banco

**Frontend:**
- Status do Socket.IO exibido no dashboard
- Logs filtrados no console para melhor análise

### Logs

**Frontend:**
- Logs filtrados automaticamente (base64, erros esperados)
- Apenas erros críticos e warnings são exibidos

**Backend:**
- Logs no console (stdout)
- Recomendado usar PM2 para gerenciar logs em produção

---

**Última atualização:** 2025-01-XX

