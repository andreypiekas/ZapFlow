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

Existem múltiplas imagens da Evolution API disponíveis no Docker Hub:

### Imagem Principal (Recomendada)
- **Repositório**: `evoapicloud/evolution-api`
- **Docker Hub**: [evoapicloud/evolution-api](https://hub.docker.com/r/evoapicloud/evolution-api)
- **Stars**: 66 ⭐
- **Versão utilizada**: `v2.3.4` (✅ tag confirmada - com prefixo v)

### Imagem Alternativa (Mais Popular)
- **Repositório**: `atendai/evolution-api`
- **Docker Hub**: [atendai/evolution-api](https://hub.docker.com/r/atendai/evolution-api)
- **Stars**: 136 ⭐ (mais popular)
- **Nota**: Pode ter tags diferentes, verifique antes de usar

### Verificar Tags Disponíveis
Você pode verificar todas as versões disponíveis diretamente no Docker Hub ou usar o script fornecido abaixo.

## 📋 Pré-requisitos

- Acesso SSH à VM
- Acesso ao diretório onde está o `docker-compose.yml` da Evolution API
- Conhecimento básico de comandos Linux

## 🔧 Passo a Passo

### 1. Conectar na VM via SSH

```bash
ssh usuario@ip_da_vm
# Exemplo: ssh root@192.168.3.206
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
    image: evoapicloud/evolution-api:v2.3.4
```

**⚠️ IMPORTANTE**: A tag correta é `v2.3.4` (com prefixo `v`), não `2.3.4`.

**Salvar e sair:**
- Nano: `Ctrl + X`, depois `Y`, depois `Enter`
- Vi: `Esc`, depois `:wq`, depois `Enter`

### 6. Verificar Tags Disponíveis no Docker Hub

**⚠️ IMPORTANTE**: A versão `2.3.4` pode não estar disponível no Docker Hub. Verifique primeiro quais tags estão disponíveis:

**Opção 1: Usar o script auxiliar (recomendado)**
```bash
# Baixar o script (se ainda não estiver no servidor)
wget -O /tmp/verificar_tags_evolution.sh https://raw.githubusercontent.com/andreypiekas/ZapFlow/main/install/verificar_tags_evolution.sh
chmod +x /tmp/verificar_tags_evolution.sh
/tmp/verificar_tags_evolution.sh
```

**Opção 2: Verificar manualmente via curl**
```bash
# Requer jq instalado: apt-get install jq
curl -s "https://hub.docker.com/v2/repositories/evoapicloud/evolution-api/tags?page_size=100" | jq -r '.results[].name' | grep -E "2\.3|v2\.3"

# Ou ver todas as tags
curl -s "https://hub.docker.com/v2/repositories/evoapicloud/evolution-api/tags?page_size=100" | jq -r '.results[].name' | sort -V
```

**Opção 3: Acessar diretamente no navegador**
- URL: https://hub.docker.com/r/evoapicloud/evolution-api/tags

**Opção 4: Tentar baixar e ver o erro**
```bash
docker pull evoapicloud/evolution-api:v2.3.4 2>&1 | head -5
```

**✅ TAG CONFIRMADA**: A tag correta é `v2.3.4` (com prefixo `v`)

**Tags possíveis para testar:**
- `v2.3.4` (com prefixo v)
- `2.3.3` ou `v2.3.3` (versão anterior)
- `2.3.2` ou `v2.3.2`
- `2.2.0` ou `v2.2.0` (versão anterior estável)
- `latest` (pode ser 2.3.6 - **NÃO RECOMENDADO**)

**Alternativa - Tentar imagem `atendai/evolution-api` (mais popular):**
- A imagem `atendai/evolution-api` tem mais estrelas e pode ter a versão v2.3.4 disponível
- Verifique: https://hub.docker.com/r/atendai/evolution-api/tags
- Se usar esta imagem, altere no docker-compose.yml: `atendai/evolution-api:v2.3.4`

### 7. Remover a Imagem Antiga (Opcional)

Para garantir que a nova versão será baixada:

```bash
# Remover a imagem latest (opcional, mas recomendado)
docker rmi evoapicloud/evolution-api:latest 2>/dev/null || true

# Ou remover todas as imagens não utilizadas
docker image prune -a
```

### 8. Baixar a Imagem Correta

**✅ TAG CONFIRMADA**: A tag correta é `v2.3.4` (com prefixo `v`)

**Se por algum motivo `v2.3.4` não estiver disponível, você tem duas opções:**

#### Opção A: Tentar tags alternativas em evoapicloud/evolution-api

```bash
# ✅ TAG CONFIRMADA: v2.3.4 (com prefixo v)
docker pull evoapicloud/evolution-api:v2.3.4 || \
# Se falhar, tentar sem prefixo v (não recomendado)
docker pull evoapicloud/evolution-api:2.3.4 || \
# Se falhar, tentar 2.3.3
docker pull evoapicloud/evolution-api:2.3.3 || \
# Se falhar, tentar v2.3.3
docker pull evoapicloud/evolution-api:v2.3.3 || \
# Se falhar, tentar 2.3.2
docker pull evoapicloud/evolution-api:2.3.2 || \
# Se falhar, tentar v2.3.2
docker pull evoapicloud/evolution-api:v2.3.2 || \
# Última alternativa: versão anterior estável
docker pull evoapicloud/evolution-api:v2.2.0
```

#### Opção B: Tentar a imagem alternativa atendai/evolution-api (mais popular)

```bash
# Verificar se v2.3.4 existe na imagem alternativa
docker pull atendai/evolution-api:v2.3.4 || \
docker pull atendai/evolution-api:2.3.4 || \
docker pull atendai/evolution-api:2.3.3 || \
docker pull atendai/evolution-api:v2.3.3
```

**Se usar a imagem `atendai/evolution-api`, lembre-se de atualizar o docker-compose.yml!**

**OU** verificar manualmente e baixar:

```bash
# Baixar a versão disponível (substitua pela tag correta encontrada)
docker pull evoapicloud/evolution-api:<TAG_ENCONTRADA>

# Verificar se foi baixada
docker images | grep evolution-api
```

Você deve ver algo como:
```
evoapicloud/evolution-api    <tag>    abc123def456   2 weeks ago   2.5GB
```

**✅ Após confirmar que `v2.3.4` funciona, o docker-compose.yml já estará correto!**

### 9. Recriar e Iniciar os Containers

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

