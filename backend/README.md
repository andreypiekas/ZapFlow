# ZapFlow Backend API

Backend API para persistência de dados do ZapFlow usando PostgreSQL.

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
createdb zapflow

# Ou usando psql:
psql -U postgres
CREATE DATABASE zapflow;
\q
```

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
- Username: `admin`
- Password: `admin123`

**⚠️ IMPORTANTE: Altere a senha do admin em produção!**

5. **Inicie o servidor:**
```bash
# Desenvolvimento (com watch)
npm run dev

# Produção
npm start
```

O servidor estará rodando em `http://localhost:3001`

## Configuração

### Variáveis de Ambiente (.env)

```env
# PostgreSQL
DATABASE_URL=postgresql://usuario:senha@localhost:5432/zapflow
# ou
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zapflow
DB_USER=postgres
DB_PASSWORD=sua_senha

# JWT Secret (mude em produção!)
JWT_SECRET=seu_jwt_secret_super_seguro_aqui

# Porta do servidor
PORT=3001

# CORS - URLs permitidas
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

## API Endpoints

### Autenticação

**POST /api/auth/login**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

Resposta:
```json
{
  "token": "jwt_token_aqui",
  "user": {
    "id": 1,
    "username": "admin",
    "name": "Administrador",
    "email": "admin@zapflow.com",
    "role": "admin"
  }
}
```

### Dados do Usuário

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

## Tipos de Dados Suportados

- `config` - Configurações da API
- `chats` - Conversas
- `contacts` - Contatos
- `users` - Usuários
- `departments` - Departamentos
- `quickReplies` - Respostas rápidas
- `workflows` - Workflows
- `chatbotConfig` - Configuração do chatbot
- `viewState` - Estado da view atual
- `sidebarState` - Estado da sidebar

## Segurança

- Todas as rotas de dados requerem autenticação JWT
- Senhas são hasheadas com bcrypt
- Tokens JWT expiram em 7 dias
- CORS configurável por ambiente

## Troubleshooting

**Erro de conexão com PostgreSQL:**
- Verifique se o PostgreSQL está rodando
- Confirme as credenciais no .env
- Teste a conexão: `psql -U postgres -d zapflow`

**Erro de autenticação:**
- Verifique se o token está sendo enviado no header Authorization
- Formato: `Authorization: Bearer <token>`

**Erro de CORS:**
- Adicione a URL do frontend em `CORS_ORIGIN` no .env

