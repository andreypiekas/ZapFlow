# Atualização Evolution API: v2.2.3 → v2.3.6

**Data:** 2025-12-02  
**Versão Anterior:** v2.2.3  
**Nova Versão:** v2.3.6

## 📦 Arquivos Atualizados

### Arquivos de Configuração Docker
- ✅ `setup_evolution.txt` - Imagem atualizada para `atendai/evolution-api:v2.3.6`
- ✅ `autoinstall.txt` - Imagem atualizada para `atendai/evolution-api:v2.3.6`
- ✅ `manual_instalacao.txt` - Imagem atualizada para `atendai/evolution-api:v2.3.6`
- ✅ `manual_instalacao_completo.txt` - Imagem atualizada para `atendai/evolution-api:v2.3.6`

### Documentação
- ✅ `README.md` - Referências atualizadas para v2.3.6
- ✅ `ANALISE_ERROS.md` - Referências atualizadas para v2.3.6
- ✅ `services/whatsappService.ts` - Comentário atualizado

## 💾 Backup

Todos os arquivos originais foram salvos em: `backup_evolution_v2.2.3/`

## 🔄 Próximos Passos

### 1. Atualizar Container Docker

Para aplicar a atualização no servidor:

```bash
# Parar containers
docker-compose down

# Atualizar imagem
docker pull atendai/evolution-api:v2.3.6

# Recriar containers
docker-compose up -d
```

### 2. Verificar Compatibilidade

A versão 2.3.6 pode ter:
- ✅ Melhor suporte para `include: ['messages']` no `findChats`
- ✅ Correções no WebSocket
- ✅ Melhorias na estabilidade

### 3. Testar Funcionalidades

Após atualizar, verificar:
- [ ] Conexão WebSocket funciona corretamente
- [ ] Busca de mensagens no `findChats` retorna dados
- [ ] Envio e recebimento de mensagens
- [ ] QR Code é gerado corretamente

## ⚠️ Notas Importantes

- **Backup criado:** Todos os arquivos originais estão em `backup_evolution_v2.2.3/`
- **Rollback:** Se necessário, restaure os arquivos do backup
- **Configurações:** As variáveis de ambiente permanecem as mesmas
- **Banco de Dados:** Não deve ser necessário migração de dados

## 📚 Referências

- Documentação Evolution API: https://doc.evolution-api.com/
- Docker Hub: https://hub.docker.com/r/atendai/evolution-api

