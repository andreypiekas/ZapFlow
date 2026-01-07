# Guia: Verificar e Configurar PostgreSQL para o Backend

O backend do **Zentria** precisa de uma instância PostgreSQL rodando. Este guia ajuda a verificar e configurar.

**Compatibilidade (upgrade):** se você já tinha uma instalação antiga, seu banco pode se chamar `zapflow`.
Nesse caso, mantenha `DB_NAME=zapflow` no `backend/.env` ou renomeie o banco para `zentria`.

## 🔍 Verificar se PostgreSQL está rodando

### 1. Verificar processos PostgreSQL

```bash
# Ver se há processos PostgreSQL rodando
ps aux | grep postgres

# Ver se há containers PostgreSQL do Docker
docker ps | grep postgres

# Verificar se porta 5432 está em uso
netstat -tulpn | grep 5432
# ou
ss -tulpn | grep 5432
```

### 2. Verificar variáveis de ambiente

```bash
# Ver variáveis de ambiente do backend
cd /home/piekas/zentria
cat backend/.env 2>/dev/null || echo "Arquivo .env não encontrado"
```

## 📋 Opções de Configuração

### Opção 1: Usar PostgreSQL do Docker (Recomendado)

Adicionar serviço PostgreSQL ao `docker-compose.yml`:

```yaml
services:
  # ... serviços existentes ...
  
  zentria_postgres:
    image: postgres:15-alpine
    container_name: zentria_postgres
    restart: always
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=sua_senha_aqui
      - POSTGRES_DB=zentria
    ports:
      - "5432:5432"  # Ou outra porta como 54321 para evitar conflitos
    volumes:
      - zentria_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d zentria"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  # ... volumes existentes ...
  zentria_postgres_data:
```

**Iniciar:**
```bash
cd /home/piekas/zentria
docker-compose up -d zentria_postgres
```

### Opção 2: Instalar PostgreSQL no Sistema

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# Iniciar serviço
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Criar banco e usuário
sudo -u postgres psql
```

No psql:
```sql
CREATE DATABASE zentria;
CREATE USER zentria_user WITH PASSWORD 'sua_senha';
GRANT ALL PRIVILEGES ON DATABASE zentria TO zentria_user;
\q
```

### Opção 3: Configurar para usar PostgreSQL da Evolution API (Não recomendado)

Se quiser usar o mesmo PostgreSQL, precisa criar o banco `zentria` no container `evolution_postgres`:

```bash
# Entrar no container
docker exec -it evolution_postgres psql -U user -d evolution

# No psql, criar banco zentria
CREATE DATABASE zentria;
\q

# Criar usuário se necessário
docker exec -it evolution_postgres psql -U user
CREATE USER zentria_user WITH PASSWORD 'senha';
GRANT ALL PRIVILEGES ON DATABASE zentria TO zentria_user;
\q
```

## ⚙️ Configurar arquivo .env do Backend

Criar/editar `backend/.env`:

```bash
cd /home/piekas/zentria/backend
nano .env
```

**Conteúdo exemplo:**

```env
# Opção 1: Usando Docker (porta 5432 padrão)
DATABASE_URL=postgresql://postgres:sua_senha@localhost:5432/zentria

# Ou configurar individualmente:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zentria
DB_USER=postgres
DB_PASSWORD=sua_senha

# JWT Secret
JWT_SECRET=seu_jwt_secret_super_seguro

# Porta do servidor
PORT=3001

# CORS
CORS_ORIGIN=http://SEU_IP_SERVIDOR:5173,http://localhost:5173
```

**Salvar:** `Ctrl+X`, depois `Y`, depois `Enter`

## ✅ Testar Conexão

### 1. Verificar se PostgreSQL está acessível

```bash
# Se usando Docker
docker exec -it zentria_postgres psql -U postgres -d zentria -c "SELECT version();"

# Se usando sistema
psql -U postgres -d zentria -h localhost -c "SELECT version();"
```

### 2. Testar conexão do backend

```bash
cd /home/piekas/zentria
node -e "
import('pg').then(({ Pool }) => {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:sua_senha@localhost:5432/zentria'
  });
  pool.query('SELECT NOW()').then(res => {
    console.log('✅ Conexão OK:', res.rows[0]);
    pool.end();
  }).catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
});
"
```

### 3. Reiniciar backend

```bash
pm2 restart zentria-backend
pm2 logs zentria-backend --lines 20
```

## 🗄️ Criar Tabelas Necessárias

O backend precisa das tabelas criadas. Verificar se o banco está inicializado:

```bash
# Conectar ao banco
psql -U postgres -d zentria -h localhost

# Verificar tabelas existentes
\dt

# Se não houver tabelas, o backend deve criar automaticamente na primeira conexão
# Ou executar script de inicialização se existir
```

## 🔧 Troubleshooting

### Erro: "connect ECONNREFUSED 127.0.0.1:5432"

**Causa:** PostgreSQL não está rodando ou não está na porta 5432.

**Soluções:**
1. Verificar se PostgreSQL está rodando: `docker ps | grep postgres` ou `systemctl status postgresql`
2. Verificar porta: `netstat -tulpn | grep 5432`
3. Se PostgreSQL estiver em outra porta, atualizar `.env` com a porta correta
4. Se usar Docker, verificar se o container está rodando: `docker ps`

### Erro: "password authentication failed"

**Causa:** Senha incorreta no `.env`.

**Solução:**
1. Verificar senha no `.env`
2. Testar senha: `psql -U postgres -h localhost -d zentria`
3. Se necessário, redefinir senha:
   ```bash
   sudo -u postgres psql
   ALTER USER postgres WITH PASSWORD 'nova_senha';
   ```

### Erro: "database does not exist"

**Causa:** Banco `zentria` não foi criado.

**Solução:**
```bash
# Criar banco
sudo -u postgres createdb zentria
# ou
psql -U postgres -c "CREATE DATABASE zentria;"
```

## 📝 Próximos Passos

Após configurar o PostgreSQL:

1. ✅ Verificar conexão
2. ✅ Reiniciar backend
3. ✅ Testar endpoint `/api/health`
4. ✅ Testar webhook enviando uma imagem

