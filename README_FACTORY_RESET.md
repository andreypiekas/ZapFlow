# 🗑️ Factory Reset Completo - Guia de Uso

## ⚠️ ATENÇÃO

Este script remove **TUDO** relacionado ao Evolution API e ZapFlow:
- ✅ Containers (Evolution API, PostgreSQL, Redis)
- ✅ Volumes (incluindo **TODOS os dados do banco de dados**)
- ✅ Imagens Docker
- ✅ Arquivos de configuração
- ✅ Cache do Docker (opcional)

**Esta ação é IRREVERSÍVEL!**

## 🚀 Como Usar

### 1. Dar Permissão de Execução

```bash
chmod +x factory_reset_complete.sh
```

### 2. Executar o Script

```bash
./factory_reset_complete.sh
```

### 3. Seguir as Instruções

O script irá:
1. ⚠️ Mostrar avisos de segurança
2. 💾 Oferecer opção de backup
3. ✅ Pedir confirmações múltiplas
4. 🗑️ Remover tudo passo a passo

## 📋 O que o Script Faz

### Passo 1: Parar e Remover Containers
- Para todos os containers relacionados
- Remove containers Evolution API, PostgreSQL e Redis

### Passo 2: Remover Volumes
- Remove volumes de dados do PostgreSQL
- Remove volumes do Redis
- Opção de remover volumes órfãos

### Passo 3: Remover Imagens Docker
- Remove imagens Evolution API
- Remove imagens PostgreSQL e Redis
- Opção de remover todas imagens não utilizadas

### Passo 4: Limpar Cache
- Opção de limpar cache de build do Docker

### Passo 5: Remover Arquivos
- Remove `docker-compose.yml`
- Remove `.env` (se existir)
- Remove outros arquivos de configuração

### Passo 6: Limpar Redes (Opcional)
- Remove redes Docker não utilizadas

### Passo 7: Limpeza Completa (Opcional)
- Remove **TUDO** do Docker (muito agressivo)
- Requer confirmação final

## 💾 Backup Automático

O script oferece opção de backup antes de remover:
- Backup do banco de dados PostgreSQL
- Backup do `docker-compose.yml`
- Backup de arquivos de configuração

**Recomendado:** Sempre faça backup antes de executar!

## 🔒 Segurança

O script tem **múltiplas confirmações**:
1. Aviso inicial
2. Opção de backup
3. Confirmação principal (digite "SIM")
4. Confirmações para cada etapa opcional
5. Confirmação final para limpeza completa (digite "CONFIRMAR")

## 📝 Exemplo de Uso

```bash
# 1. Dar permissão
chmod +x factory_reset_complete.sh

# 2. Executar
./factory_reset_complete.sh

# 3. Seguir instruções:
#    - Fazer backup? (s/N): s
#    - Confirmar limpeza? Digite: SIM
#    - Remover volumes órfãos? (s/N): s
#    - Remover imagens não utilizadas? (s/N): s
#    - Limpar cache? (s/N): s
#    - Limpeza completa? (s/N): N (recomendado não usar)
```

## 🔄 Após a Limpeza

Para reinstalar do zero:

```bash
# Opção 1: Instalação completa automatizada
./autoinstall.txt

# Opção 2: Setup Evolution API apenas
./setup_evolution.txt

# Opção 3: Manual
# Editar docker-compose.yml e executar
docker-compose up -d
```

## ⚡ Comandos Rápidos (Sem Script)

Se preferir fazer manualmente:

```bash
# Parar e remover containers
docker-compose down -v

# Remover containers específicos
docker rm -f evolution_api evolution_postgres evolution_redis

# Remover volumes
docker volume rm evolution_postgres_data evolution_redis_data

# Remover imagens
docker rmi evoapicloud/evolution-api:latest postgres:15-alpine redis:alpine

# Limpeza completa do Docker (CUIDADO!)
docker system prune -a --volumes -f
```

## 🆘 Troubleshooting

### Erro: "Permission denied"
```bash
chmod +x factory_reset_complete.sh
```

### Erro: "Container is running"
O script tenta parar automaticamente, mas se falhar:
```bash
docker stop evolution_api evolution_postgres evolution_redis
```

### Erro: "Volume is in use"
```bash
docker-compose down -v
# ou
docker volume rm -f evolution_postgres_data evolution_redis_data
```

## 📚 Arquivos Relacionados

- `factory_reset_complete.sh` - Script de limpeza completa
- `setup_evolution.txt` - Instalação do Evolution API
- `autoinstall.txt` - Instalação completa automatizada
- `upgrade_evolution.sh` - Script de upgrade

## ⚠️ Avisos Finais

1. **Sempre faça backup** antes de executar
2. **Leia todas as confirmações** cuidadosamente
3. **Não execute em produção** sem backup
4. **Teste primeiro** em ambiente de desenvolvimento

