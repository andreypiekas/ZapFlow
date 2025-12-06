# Instalação do Backend ZapFlow

## Passo a Passo Rápido

### 1. Instalar PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:**
- Baixe e instale do site oficial: https://www.postgresql.org/download/windows/

### 2. Criar Banco de Dados

```bash
# Acesse o PostgreSQL
sudo -u postgres psql

# Crie o banco de dados
CREATE DATABASE zapflow;

# Crie um usuário (opcional, pode usar postgres)
CREATE USER zapflow_user WITH PASSWORD 'sua_senha_segura';
GRANT ALL PRIVILEGES ON DATABASE zapflow TO zapflow_user;

# Saia
\q
```

### 3. Configurar Backend

```bash
# Entre na pasta do backend
cd backend

# Instale as dependências
npm install

# Copie o arquivo de configuração
cp config.example.env .env

# Edite o .env com suas configurações
nano .env
```

**Configure o .env:**
```env
DATABASE_URL=postgresql://zapflow_user:sua_senha_segura@localhost:5432/zapflow
JWT_SECRET=seu_jwt_secret_super_seguro_aqui_mude_em_producao
PORT=3001
CORS_ORIGIN=http://SEU_IP_SERVIDOR:5173,http://localhost:5173
```

**Importante:** Substitua `SEU_IP_SERVIDOR` pelo IP real do seu servidor. O `localhost:5173` é mantido como fallback para desenvolvimento local.

Para descobrir o IP do servidor:
```bash
hostname -I | awk '{print $1}'
# ou
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### 4. Executar Migração

```bash
npm run migrate
```

Isso criará:
- Tabelas necessárias
- Usuário admin padrão (username: `admin`, password: `admin123`)

**⚠️ IMPORTANTE: Altere a senha do admin em produção!**

### 5. Iniciar Servidor

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

### 6. Configurar Frontend

No arquivo `.env` do frontend (raiz do projeto), adicione:

```env
VITE_API_URL=http://SEU_IP_SERVIDOR:3001/api
```

**Substitua `SEU_IP_SERVIDOR` pelo IP real do seu servidor.**

Ou configure no `vite.config.ts` se necessário.

## Verificação

1. **Health Check:**
```bash
curl http://SEU_IP_SERVIDOR:3001/api/health
```

**Substitua `SEU_IP_SERVIDOR` pelo IP real do seu servidor.**

Deve retornar:
```json
{"status":"ok","message":"Backend is running"}
```

2. **Teste de Login:**
```bash
curl -X POST http://SEU_IP_SERVIDOR:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"admin123"}'
```

**Substitua `SEU_IP_SERVIDOR` pelo IP real do seu servidor.**
```

## Produção

Para produção:

1. **Altere o JWT_SECRET** para algo seguro e aleatório
2. **Configure CORS_ORIGIN** com o domínio do seu frontend
3. **Use variáveis de ambiente** do servidor (não commit o .env)
4. **Configure SSL/HTTPS** para o servidor
5. **Use um processo manager** como PM2:
```bash
npm install -g pm2
pm2 start server.js --name zapflow-backend
pm2 save
pm2 startup
```

## Troubleshooting

**Erro de conexão com PostgreSQL:**
- Verifique se o PostgreSQL está rodando: `sudo systemctl status postgresql`
- Teste a conexão: `psql -U postgres -d zapflow`
- Verifique as credenciais no .env

**Erro de porta em uso:**
- Altere a PORT no .env ou mate o processo: `lsof -ti:3001 | xargs kill`

**Erro de CORS:**
- Adicione a URL do frontend em CORS_ORIGIN no .env

