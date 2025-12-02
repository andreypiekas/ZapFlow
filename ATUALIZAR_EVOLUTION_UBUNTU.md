# Guia de Atualização Evolution API - Ubuntu 22.04

**Versão Anterior:** v2.2.3  
**Nova Versão:** v2.3.4 (v2.3.6 não disponível no Docker Hub)  
**Sistema:** Ubuntu 22.04

## 📋 Pré-requisitos

- Docker e Docker Compose instalados
- Acesso SSH ao servidor ou acesso root/sudo
- Backup do banco de dados (recomendado)

## 🔄 Passo a Passo

### 1. Conectar ao Servidor

```bash
ssh usuario@seu-servidor
```

### 2. Navegar para o Diretório do Projeto

```bash
cd /caminho/para/seu/projeto
# Exemplo: cd /opt/zapflow
```

### 3. Fazer Backup do Banco de Dados (Recomendado)

```bash
# Backup do PostgreSQL
docker exec evolution_postgres pg_dump -U user evolution > backup_evolution_$(date +%Y%m%d_%H%M%S).sql

# Verificar se o backup foi criado
ls -lh backup_evolution_*.sql
```

### 4. Parar os Containers

```bash
# Parar todos os containers relacionados
docker-compose down

# OU se estiver usando docker diretamente:
docker stop evolution_api evolution_postgres evolution_redis
```

### 5. Atualizar o Arquivo docker-compose.yml

Se você tiver um arquivo `docker-compose.yml` no servidor, atualize a imagem:

```bash
# Editar o arquivo
nano docker-compose.yml
# ou
vi docker-compose.yml
```

Altere a linha:
```yaml
image: atendai/evolution-api:v2.2.3
```

Para:
```yaml
image: atendai/evolution-api:v2.3.4
```

**OU** se você estiver usando os scripts de instalação (`setup_evolution.txt`, `autoinstall.txt`, etc.), eles já foram atualizados no repositório.

### 6. Baixar a Nova Imagem

```bash
# Baixar a nova versão da imagem
docker pull atendai/evolution-api:v2.3.4

# Verificar se a imagem foi baixada
docker images | grep evolution-api
```

### 7. Remover Container Antigo (Opcional, mas Recomendado)

```bash
# Remover o container antigo (os dados estão no volume)
docker rm evolution_api
```

### 8. Recriar e Iniciar os Containers

```bash
# Se estiver usando docker-compose
docker-compose up -d

# OU se estiver usando docker diretamente, recrie o container:
docker run -d \
  --name evolution_api \
  --restart always \
  --shm-size=2gb \
  -p 8080:8080 \
  -e SERVER_PORT=8080 \
  -e SERVER_URL=http://SEU_IP:8080 \
  -e AUTHENTICATION_API_KEY=B8349283-F143-429D-B6C2-9386E8016558 \
  -e WEBSOCKET_ENABLED=true \
  -e DATABASE_ENABLED=true \
  -e DATABASE_PROVIDER=postgresql \
  -e DATABASE_CONNECTION_URI=postgresql://user:password@evolution_postgres:5432/evolution \
  -e DATABASE_CLIENT_NAME=evolution_exchange \
  -e CACHE_REDIS_ENABLED=true \
  -e CACHE_REDIS_URI=redis://evolution_redis:6379/0 \
  --network bridge \
  atendai/evolution-api:v2.3.6
```

### 9. Verificar se os Containers Estão Rodando

```bash
# Verificar status dos containers
docker ps

# Verificar logs do Evolution API
docker logs evolution_api --tail 50 -f
```

### 10. Verificar a Versão

```bash
# Verificar logs para confirmar a versão
docker logs evolution_api | grep -i "version\|v2.3.4"

# OU fazer uma requisição à API
curl http://localhost:8080/instance/fetchInstances \
  -H "apikey: B8349283-F143-429D-B6C2-9386E8016558"
```

## 🔍 Verificação e Testes

### Verificar Logs

```bash
# Logs em tempo real
docker logs evolution_api -f

# Últimas 100 linhas
docker logs evolution_api --tail 100
```

### Testar Endpoints

```bash
# Listar instâncias
curl http://localhost:8080/instance/fetchInstances \
  -H "apikey: B8349283-F143-429D-B6C2-9386E8016558"

# Verificar status de conexão
curl http://localhost:8080/instance/connectionState/ZapFlow \
  -H "apikey: B8349283-F143-429D-B6C2-9386E8016558"
```

### Verificar WebSocket

```bash
# Verificar se WebSocket está habilitado nos logs
docker logs evolution_api | grep -i websocket
```

## ⚠️ Troubleshooting

### Se o Container Não Iniciar

```bash
# Ver logs de erro
docker logs evolution_api

# Verificar se a porta está em uso
sudo netstat -tulpn | grep 8080

# Verificar recursos do sistema
docker stats
```

### Se Houver Problemas de Conexão

```bash
# Verificar rede dos containers
docker network ls
docker network inspect bridge

# Verificar se os containers estão na mesma rede
docker inspect evolution_api | grep NetworkMode
docker inspect evolution_postgres | grep NetworkMode
```

### Rollback (Se Necessário)

```bash
# Parar containers
docker-compose down

# Voltar para versão anterior
docker pull atendai/evolution-api:v2.2.3

# Editar docker-compose.yml para usar v2.2.3
# E recriar containers
docker-compose up -d
```

## 📝 Comandos Rápidos (Copy & Paste)

```bash
# Sequência completa de atualização
cd /caminho/para/seu/projeto
docker exec evolution_postgres pg_dump -U user evolution > backup_evolution_$(date +%Y%m%d_%H%M%S).sql
docker-compose down
docker pull atendai/evolution-api:v2.3.4
docker-compose up -d
docker logs evolution_api -f
```

## ✅ Checklist Pós-Atualização

- [ ] Containers estão rodando (`docker ps`)
- [ ] Logs não mostram erros críticos
- [ ] API responde às requisições
- [ ] WebSocket está habilitado
- [ ] Instâncias existentes ainda funcionam
- [ ] QR Code pode ser gerado (se necessário)
- [ ] Mensagens podem ser enviadas/recebidas
- [ ] WebSocket conecta corretamente

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs: `docker logs evolution_api -f`
2. Consulte o CHANGELOG_EVOLUTION_UPGRADE.md
3. Verifique a documentação: https://doc.evolution-api.com/

