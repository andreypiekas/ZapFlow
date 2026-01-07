# Zentria Backend API

Backend API para persistência de dados do **Zentria** usando PostgreSQL.

## Pré-requisitos

- Node.js 18+ 
- PostgreSQL 12+
- npm ou yarn

## Instalação

1. **Instale as dependências:**
```bash
cd backend
npm install
```

2. **Configure o banco de dados PostgreSQL:**
```bash
# Crie o banco de dados
createdb zentria

# Ou usando psql:
psql -U postgres
CREATE DATABASE zentria;
\q
```

**Compatibilidade (upgrade):** se sua instalação antiga usava o banco `zapflow`, você pode:
- Manter como está e definir `DB_NAME=zapflow` no `.env`, ou
- Renomear o banco: `ALTER DATABASE zapflow RENAME TO zentria;`

3. **Configure as variáveis de ambiente:**
```bash
# Copie o arquivo de exemplo
cp config.example.env .env

# Edite o .env com suas configurações
nano .env
```

4. **Execute a migração:**
```bash
npm run migrate
```

Isso criará as tabelas necessárias e um usuário admin padrão:
- ✅ Tabela `users` (com campo `department_id`)
- ✅ Tabela `user_data` (dados genéricos)
- ✅ Tabela `departments`
- ✅ Tabela `contacts`
- ✅ Tabela `quick_replies`
- ✅ Tabela `workflows`
- ✅ Usuário admin padrão:
  - **Username:** `admin@piekas.com`
  - **Password:** `123`
  - **Role:** `ADMIN`

**⚠️ IMPORTANTE: Altere a senha do admin em produção!**

### Migrações Adicionais

Se você está atualizando um banco existente, execute:

```bash
# Adicionar campo department_id na tabela users (se não existir)
node scripts/add-department-id-to-users.js

# Corrigir data_keys de chats (se necessário)
node scripts/fix-chat-data-keys.js

# Limpar chats inválidos (números com menos de 11 dígitos)
node scripts/clean-invalid-chats.js
```

5. **Inicie o servidor:**
```bash
# Desenvolvimento (com watch)
npm run dev

# Produção
npm start
```

O servidor estará rodando em `http://SEU_IP_SERVIDOR:3001`

**Importante:** Substitua `SEU_IP_SERVIDOR` pelo IP real do seu servidor. Para descobrir o IP:
```bash
hostname -I | awk '{print $1}'
# ou
ip addr show | grep "inet " | grep -v 127.0.0.1
```

## Configuração

### Variáveis de Ambiente (.env)

```env
# PostgreSQL (localhost está correto aqui, pois o PostgreSQL roda no mesmo servidor)
DATABASE_URL=postgresql://usuario:senha@localhost:5432/zentria
# ou
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zentria
DB_USER=postgres
DB_PASSWORD=sua_senha

# JWT Secret (mude em produção!)
JWT_SECRET=seu_jwt_secret_super_seguro_aqui

# Porta do servidor
PORT=3001

# CORS - URLs permitidas (use o IP do servidor, não localhost)
CORS_ORIGIN=http://SEU_IP_SERVIDOR:5173,http://localhost:5173

# Rate Limiting - Prevenção de Brute Force e DDoS
RATE_LIMIT_WINDOW_MS=15        # Janela geral (minutos)
RATE_LIMIT_MAX=100              # Máximo de requisições gerais
LOGIN_RATE_LIMIT_WINDOW_MS=15  # Janela para login (minutos)
LOGIN_RATE_LIMIT_MAX=5         # Máximo de tentativas de login
DATA_RATE_LIMIT_WINDOW_MS=1    # Janela para dados (minutos)
DATA_RATE_LIMIT_MAX=60         # Máximo de requisições de dados
```

**Nota:** O `DB_HOST=localhost` está correto porque o PostgreSQL roda no mesmo servidor. Mas o `CORS_ORIGIN` deve usar o IP do servidor para permitir acesso do frontend.

## API Endpoints

### Autenticação

**POST /api/auth/login**
```json
{
  "username": "admin@piekas.com",
  "password": "123"
}
```

Resposta:
```json
{
  "token": "jwt_token_aqui",
  "user": {
    "id": 1,
    "username": "admin@piekas.com",
    "name": "Andrey",
    "email": "admin@piekas.com",
    "role": "ADMIN"
  }
}
```

**Rate Limit:** 5 tentativas por 15 minutos por IP/username

### Perfil do Usuário

**PUT /api/user/profile**
- Atualiza nome e email do usuário logado
- Requer autenticação

```json
{
  "name": "Novo Nome",
  "email": "novo@email.com"
}
```

### Gestão de Usuários (ADMIN apenas)

**GET /api/users**
- Lista todos os usuários
- Requer role ADMIN
- Retorna `departmentId` para cada usuário

**POST /api/users**
- Cria novo usuário
- Requer role ADMIN

```json
{
  "username": "usuario@exemplo.com",
  "password": "senha123",
  "name": "Nome do Usuário",
  "email": "usuario@exemplo.com",
  "role": "AGENT"
}
```

**PUT /api/users/:id**
- Atualiza usuário existente
- Requer role ADMIN
- Suporta `departmentId` para atribuir usuário a departamento

```json
{
  "name": "Nome do Usuário",
  "email": "usuario@exemplo.com",
  "role": "AGENT",
  "departmentId": "dept_1",
  "password": "nova_senha"  // Opcional
}
```

**DELETE /api/users/:id**
- Remove usuário
- Requer role ADMIN

### Departamentos

**GET /api/departments**
- Lista todos os departamentos

**POST /api/departments**
- Cria novo departamento

```json
{
  "name": "Suporte",
  "description": "Departamento de suporte técnico",
  "color": "#3B82F6"
}
```

**PUT /api/departments/:id**
- Atualiza departamento

**DELETE /api/departments/:id**
- Remove departamento

### Contatos

**GET /api/contacts**
- Lista todos os contatos

**POST /api/contacts**
- Cria novo contato

```json
{
  "name": "João Silva",
  "phone": "5549984329374",
  "email": "joao@exemplo.com",
  "avatar": "https://...",
  "source": "manual"
}
```

**PUT /api/contacts/:id**
- Atualiza contato

**DELETE /api/contacts/:id**
- Remove contato

### Respostas Rápidas

**GET /api/quick-replies**
- Lista todas as respostas rápidas

**POST /api/quick-replies**
- Cria nova resposta rápida

```json
{
  "title": "Saudação",
  "content": "Olá! Como posso ajudar?"
}
```

**PUT /api/quick-replies/:id**
- Atualiza resposta rápida

**DELETE /api/quick-replies/:id**
- Remove resposta rápida

### Workflows

**GET /api/workflows**
- Lista todos os workflows

**POST /api/workflows**
- Cria novo workflow

```json
{
  "title": "Protocolo de Venda",
  "description": "Checklist para processo de venda",
  "trigger_keywords": ["venda", "comprar"],
  "steps": [
    {"title": "Identificar necessidade", "completed": false},
    {"title": "Apresentar solução", "completed": false}
  ],
  "target_department_id": 1
}
```

**PUT /api/workflows/:id**
- Atualiza workflow

**DELETE /api/workflows/:id**
- Remove workflow

### Dados Genéricos (Legacy)

**GET /api/data/:dataType?key=opcional**
- Busca dados do tipo especificado
- Se `key` for fornecido, retorna apenas aquele item
- Requer autenticação (Bearer token)

**POST /api/data/:dataType**
```json
{
  "key": "nome_do_item",
  "value": { /* dados aqui */ }
}
```

**PUT /api/data/:dataType/:key**
```json
{
  "value": { /* dados atualizados */ }
}
```

**DELETE /api/data/:dataType/:key**
- Remove um item específico

**POST /api/data/:dataType/batch**
```json
{
  "data": {
    "key1": { /* valor1 */ },
    "key2": { /* valor2 */ }
  }
}
```

### Health Check

**GET /api/health**
- Verifica se o servidor e banco estão funcionando
- Não requer autenticação
- Não conta no rate limiting

## Tipos de Dados Suportados (Legacy)

- `config` - Configurações da API
- `chats` - Conversas
- `contacts` - Contatos (agora tem tabela dedicada)
- `users` - Usuários (agora tem tabela dedicada)
- `departments` - Departamentos (agora tem tabela dedicada)
- `quickReplies` - Respostas rápidas (agora tem tabela dedicada)
- `workflows` - Workflows (agora tem tabela dedicada)
- `chatbotConfig` - Configuração do chatbot
- `viewState` - Estado da view atual
- `sidebarState` - Estado da sidebar

## Segurança

- Todas as rotas de dados requerem autenticação JWT
- Senhas são hasheadas com bcrypt
- Tokens JWT expiram em 7 dias
- CORS configurável por ambiente
- **Rate Limiting** implementado para prevenir brute force e DDoS:
  - **Login**: Máximo 5 tentativas por 15 minutos por IP/username
- **Rotas de dados**: Máximo 200 requisições por minuto por usuário
- **Geral**: Máximo 1000 requisições por 15 minutos por IP
- Configurável via variáveis de ambiente (ver `.env`)

## Troubleshooting

**Erro de conexão com PostgreSQL:**
- Verifique se o PostgreSQL está rodando
- Confirme as credenciais no .env
      - Teste a conexão: `psql -U postgres -d zentria`

**Erro de autenticação:**
- Verifique se o token está sendo enviado no header Authorization
- Formato: `Authorization: Bearer <token>`

**Erro de CORS:**
- Adicione a URL do frontend em `CORS_ORIGIN` no .env

**Erro 429 (Too Many Requests):**
- Você atingiu o limite de requisições (rate limiting)
- Para login: Aguarde 15 minutos ou ajuste `LOGIN_RATE_LIMIT_MAX` no .env
- Para dados: Aguarde 1 minuto ou ajuste `DATA_RATE_LIMIT_MAX` no .env
- Em produção, considere aumentar os limites se necessário

