# 🔧 Solução: Erro de Conexão com Banco de Dados

## Erro
```
Error: P1001: Can't reach database server at `evolution_postgres:5432`
```

## Causa
O container Evolution API não consegue se conectar ao PostgreSQL porque:
1. Containers não estão na mesma rede Docker
2. PostgreSQL não está pronto quando Evolution API tenta conectar
3. Nome do host incorreto na string de conexão

## ✅ Soluções

### Solução 1: Verificar se os containers estão rodando

```bash
# Verificar status dos containers
docker ps -a

# Verificar se estão na mesma rede
docker network inspect bridge | grep -A 10 evolution
```

### Solução 2: Garantir que PostgreSQL está pronto antes do Evolution API

O `docker-compose.yml` deve ter `depends_on` com `healthcheck`:

```yaml
services:
  evolution_api:
    depends_on:
      evolution_postgres:
        condition: service_healthy
      evolution_redis:
        condition: service_started

  evolution_postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d evolution"]
      interval: 5s
      timeout: 5s
      retries: 5
```

### Solução 3: Recriar containers na mesma rede

```bash
# Parar todos os containers
docker-compose down

# Remover containers órfãos
docker-compose down --remove-orphans

# Recriar com dependências corretas
docker-compose up -d

# Verificar logs do PostgreSQL
docker logs evolution_postgres

# Verificar logs do Evolution API
docker logs evolution_api
```

### Solução 4: Verificar variáveis de ambiente

Certifique-se de que a string de conexão está correta:

```bash
# Verificar variável de ambiente no container
docker exec evolution_api env | grep DATABASE_CONNECTION_URI

# Deve mostrar algo como:
# DATABASE_CONNECTION_URI=postgresql://user:password@evolution_postgres:5432/evolution
```

### Solução 5: Testar conexão manualmente

```bash
# Testar se PostgreSQL está acessível
docker exec evolution_api ping -c 2 evolution_postgres

# Testar conexão com psql
docker exec evolution_postgres psql -U user -d evolution -c "SELECT 1;"
```

### Solução 6: Usar IP do container (alternativa)

Se o nome do host não funcionar, use o IP do container:

```bash
# Descobrir IP do PostgreSQL
POSTGRES_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' evolution_postgres)
echo "PostgreSQL IP: $POSTGRES_IP"

# Atualizar docker-compose.yml para usar IP (não recomendado, mas funciona)
# DATABASE_CONNECTION_URI=postgresql://user:password@${POSTGRES_IP}:5432/evolution
```

### Solução 7: Recriar do zero (último recurso)

```bash
# Fazer backup primeiro!
docker exec evolution_postgres pg_dump -U user evolution > backup.sql

# Parar e remover tudo
docker-compose down -v

# Recriar
docker-compose up -d

# Aguardar PostgreSQL ficar pronto
sleep 10

# Verificar logs
docker logs evolution_postgres
docker logs evolution_api
```

## 🔍 Diagnóstico Passo a Passo

### 1. Verificar se containers estão rodando
```bash
docker ps | grep evolution
```

### 2. Verificar rede Docker
```bash
docker network ls
docker network inspect bridge
```

### 3. Verificar logs do PostgreSQL
```bash
docker logs evolution_postgres --tail 50
```

### 4. Verificar logs do Evolution API
```bash
docker logs evolution_api --tail 50
```

### 5. Testar conectividade
```bash
# Do container Evolution API para PostgreSQL
docker exec evolution_api ping evolution_postgres

# Verificar porta
docker exec evolution_api nc -zv evolution_postgres 5432
```

## 📝 Checklist

- [ ] Containers estão rodando (`docker ps`)
- [ ] Containers estão na mesma rede
- [ ] PostgreSQL está saudável (`docker logs evolution_postgres`)
- [ ] Variável `DATABASE_CONNECTION_URI` está correta
- [ ] Nome do host `evolution_postgres` resolve corretamente
- [ ] Porta 5432 está acessível
- [ ] Credenciais estão corretas (user:password)

## ⚠️ Nota Importante

O erro geralmente ocorre quando:
- Evolution API tenta conectar antes do PostgreSQL estar pronto
- Containers foram criados separadamente (não via docker-compose)
- Rede Docker não está configurada corretamente

**Solução mais comum:** Usar `docker-compose up -d` que garante que os containers sejam criados na mesma rede e com as dependências corretas.

