# Guia: Downgrade Evolution API para Versão 2.3.4 na VM

Este guia mostra como fazer o downgrade da Evolution API da versão `latest` (que pode ser 2.3.6) para a versão `2.3.4` na sua VM.

## ⚠️ Por que fazer o downgrade?

A versão 2.3.6 apresenta problemas conhecidos:
- `imageMessage` vazio ao buscar mensagens via REST API
- Problemas com QR Code (carregamento infinito)
- Falhas no envio de mensagens
- Interrupção de webhooks

A versão 2.3.4 é mais estável e recomendada.

## 📦 Fonte da Imagem Docker

A imagem oficial da Evolution API está disponível no Docker Hub:
- **Repositório**: [evoapicloud/evolution-api](https://hub.docker.com/r/evoapicloud/evolution-api)
- **Versão utilizada**: `2.3.4`
- **Tag completa**: `evoapicloud/evolution-api:2.3.4`

Você pode verificar todas as versões disponíveis diretamente no Docker Hub.

## 📋 Pré-requisitos

- Acesso SSH à VM
- Acesso ao diretório onde está o `docker-compose.yml` da Evolution API
- Conhecimento básico de comandos Linux

## 🔧 Passo a Passo

### 1. Conectar na VM via SSH

```bash
ssh usuario@ip_da_vm
# Exemplo: ssh root@192.168.101.234
```

### 2. Navegar para o diretório da Evolution API

Normalmente o docker-compose.yml está em um diretório como `/opt/evolution-api` ou similar:

```bash
# Verificar se há container rodando
docker ps | grep evolution

# Navegar para o diretório (ajuste o caminho conforme necessário)
cd /opt/evolution-api
# ou
cd ~/evolution-api
# ou o caminho onde você instalou a Evolution API
```

### 3. Fazer Backup do docker-compose.yml atual

```bash
# Criar backup do arquivo atual
cp docker-compose.yml docker-compose.yml.backup

# Verificar se o backup foi criado
ls -la docker-compose.yml*
```

### 4. Parar os Containers

```bash
# Parar todos os containers relacionados
docker-compose down

# Verificar se foram parados
docker ps | grep evolution
```

### 5. Editar o docker-compose.yml

```bash
# Abrir o arquivo para edição (use nano ou vi)
nano docker-compose.yml
# ou
vi docker-compose.yml
```

**Localizar a linha:**
```yaml
    image: evoapicloud/evolution-api:latest
```

**Alterar para:**
```yaml
    image: evoapicloud/evolution-api:2.3.4
```

**Salvar e sair:**
- Nano: `Ctrl + X`, depois `Y`, depois `Enter`
- Vi: `Esc`, depois `:wq`, depois `Enter`

### 6. Remover a Imagem Antiga (Opcional)

Para garantir que a nova versão será baixada:

```bash
# Remover a imagem latest (opcional, mas recomendado)
docker rmi evoapicloud/evolution-api:latest

# Ou remover todas as imagens não utilizadas
docker image prune -a
```

### 7. Baixar a Imagem 2.3.4

```bash
# Baixar a versão 2.3.4
docker pull evoapicloud/evolution-api:2.3.4

# Verificar se foi baixada
docker images | grep evolution-api
```

Você deve ver algo como:
```
evoapicloud/evolution-api    2.3.4    abc123def456   2 weeks ago   2.5GB
```

### 8. Recriar e Iniciar os Containers

```bash
# Recriar os containers com a nova versão
docker-compose up -d

# Verificar o status
docker-compose ps

# Ver os logs para confirmar que iniciou corretamente
docker-compose logs -f evolution_api
```

**Pressione `Ctrl + C` para sair dos logs após confirmar que iniciou.**

### 9. Verificar a Versão

```bash
# Verificar os logs do container para confirmar a versão
docker-compose logs evolution_api | grep -i version

# Ou verificar diretamente no container
docker exec evolution_api node --version
```

### 10. Testar a API

```bash
# Verificar se a API está respondendo
curl http://localhost:8080

# Ou testar um endpoint específico (ajuste conforme sua configuração)
curl -X GET http://localhost:8080/instance/fetchInstances \
  -H "apikey: SUA_API_KEY_AQUI"
```

## ✅ Verificação Final

### Checklist:

- [ ] Containers estão rodando (`docker-compose ps`)
- [ ] Imagem 2.3.4 foi baixada (`docker images | grep 2.3.4`)
- [ ] API está respondendo (teste com curl)
- [ ] Logs não mostram erros críticos (`docker-compose logs evolution_api`)
- [ ] WebSocket está funcionando (teste no frontend)
- [ ] Imagens estão carregando no chat (após alguns minutos, as imagens devem aparecer)

## 🔄 Rollback (Se Algo Der Errado)

Se precisar voltar para a versão anterior:

```bash
# Parar containers
docker-compose down

# Restaurar backup
cp docker-compose.yml.backup docker-compose.yml

# Baixar latest novamente
docker pull evoapicloud/evolution-api:latest

# Recriar containers
docker-compose up -d
```

## 📝 Notas Importantes

1. **Dados Preservados**: O downgrade não apaga dados do banco de dados ou volumes. Suas mensagens e chats continuam disponíveis.

2. **WebSocket**: Pode ser necessário reconectar o WebSocket no frontend após o downgrade.

3. **Tempo de Carregamento**: Após o downgrade, pode levar alguns minutos para que as imagens antigas sejam atualizadas via WebSocket.

4. **Nova Imagem**: A primeira vez que baixar a 2.3.4 pode levar alguns minutos dependendo da conexão.

## 🆘 Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker-compose logs evolution_api

# Verificar se há conflitos de porta
netstat -tulpn | grep 8080

# Verificar se os volumes estão corretos
docker volume ls | grep evolution
```

### Imagens antigas ainda não carregam

Isso é normal. As imagens serão atualizadas quando:
1. Novos dados chegarem via WebSocket
2. A busca automática encontrar as URLs (pode levar alguns minutos)
3. O usuário receber novas mensagens no chat

### Erro ao baixar imagem 2.3.4

```bash
# Verificar conexão com Docker Hub
ping hub.docker.com

# Tentar baixar novamente
docker pull evoapicloud/evolution-api:2.3.4

# Se continuar com erro, verificar DNS
cat /etc/resolv.conf
```

## 📚 Referências

- [Documentação Evolution API](https://doc.evolution-api.com/)
- [Docker Hub - Evolution API](https://hub.docker.com/r/evoapicloud/evolution-api)
- [Guia de Compatibilidade](./EVOLUTION_VERSION_COMPATIBILITY.md)

