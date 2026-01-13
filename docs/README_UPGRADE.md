# 🔄 Guia de Upgrade - Evolution API + Zentria (após `git pull`)

## Uso Rápido

### Evolution API (Docker) - Ubuntu 22.04 (ou similar):

```bash
# 1. Dar permissão de execução
chmod +x scripts/upgrade_evolution.sh

# 2. Executar o script
./scripts/upgrade_evolution.sh
```

---

## Upgrade do Zentria (este repositório) após `git pull`

### É pelo `backend/scripts/migrate.js`?

**Sim**: ele é a **migração principal** do banco do Zentria (PostgreSQL do *backend API*), e é o passo padrão após `git pull` quando houver mudanças de schema/dados.

### Fluxo recomendado (produção)

1) **Atualize o código**

```bash
git pull
```

2) **Atualize dependências**

```bash
npm install
```

3) **Rode a migração principal do backend**

```bash
npm --prefix backend run migrate
```

4) **(Se aplicável) Migrações adicionais**

```bash
# Só se você veio de versões antigas onde apiConfig era por usuário
node backend/scripts/migrate-config-to-global.js
```

5) **Reinicie o backend/frontend conforme seu deploy**

### Importante (admin / senha)

- O `migrate.js` **só cria** o admin `admin@piekas.com` se ele não existir.
- Para **forçar reset de senha** (ex.: ambiente novo), use:

```bash
RESET_ADMIN_PASSWORD=true SEED_ADMIN_PASSWORD="SUA_SENHA" npm --prefix backend run migrate
```

## O que o script faz

1. ✅ **Verifica pré-requisitos** (Docker instalado e rodando)
2. ✅ **Detecta versão atual** automaticamente
3. ✅ **Cria backup completo**:
   - Banco de dados PostgreSQL
   - Arquivo docker-compose.yml
4. ✅ **Para containers** (apenas Evolution API, mantém Postgres/Redis)
5. ✅ **Atualiza docker-compose.yml** para latest
6. ✅ **Baixa nova imagem** do Docker Hub
7. ✅ **Recria e inicia containers**
8. ✅ **Aguarda serviços ficarem prontos**
9. ✅ **Verifica se upgrade funcionou**

## Requisitos

- Docker e Docker Compose instalados
- Containers Evolution API já instalados
- Acesso root/sudo (para alguns comandos)
- Conexão com internet (para baixar nova imagem)

## Estrutura do Backup

Os backups são salvos em `./backups/`:

```
backups/
├── docker-compose.yml.20251202_120000
├── evolution_db_20251202_120000.sql
└── backup_info_20251202_120000.txt
```

## Rollback (Se Necessário)

Se algo der errado, você pode restaurar:

```bash
# 1. Parar containers
docker-compose down

# 2. Restaurar docker-compose.yml
cp backups/docker-compose.yml.TIMESTAMP docker-compose.yml

# 3. Restaurar banco de dados
docker exec -i evolution_postgres psql -U user evolution < backups/evolution_db_TIMESTAMP.sql

# 4. Recriar containers
docker-compose up -d
```

## Verificação Pós-Upgrade

Após o upgrade, verifique:

```bash
# Ver logs
docker logs evolution_api -f

# Verificar versão (deve mostrar v2.3.4)
docker inspect evolution_api --format='{{.Config.Image}}'

# Testar API
curl http://localhost:8080/instance/fetchInstances \
  -H "apikey: B8349283-F143-429D-B6C2-9386E8016558"
```

## Troubleshooting

### Erro: "Container não encontrado"
- Execute primeiro o script de instalação (`install/setup_evolution.txt`)

### Erro: "Docker não está rodando"
```bash
sudo systemctl start docker
sudo usermod -aG docker $USER
# Faça logout e login novamente
```

### Erro: "Falha ao baixar imagem"
- Verifique conexão com internet
- Verifique se a imagem existe: `docker pull evoapicloud/evolution-api:latest`

### API não responde após upgrade
```bash
# Ver logs detalhados
docker logs evolution_api --tail 100

# Verificar se container está rodando
docker ps | grep evolution_api

# Reiniciar container
docker restart evolution_api
```

## Diferenças dos Scripts

- **`install/setup_evolution.txt`**: Instalação completa do zero
- **`install/autoinstall.txt`**: Instalação automatizada completa (inclui frontend)
- **`scripts/upgrade_evolution.sh`**: Apenas upgrade da Evolution API (mantém dados)

## Suporte

Para mais informações, consulte:
- `CHANGELOG_EVOLUTION_UPGRADE.md` - Mudanças da versão
- `ATUALIZAR_EVOLUTION_UBUNTU.md` - Guia manual de atualização
- `ANALISE_ERROS.md` - Análise de problemas conhecidos

