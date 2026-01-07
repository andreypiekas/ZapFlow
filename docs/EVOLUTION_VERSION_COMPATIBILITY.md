# Compatibilidade de Versões - Evolution API

## Versões Suportadas

Este projeto é compatível com as seguintes versões da Evolution API:
- **v2.3.4** (✅ Recomendada - Versão estável)
- **v2.3.6** (⚠️ Versão com problemas conhecidos)

**Fonte da Imagem Docker**: [evoapicloud/evolution-api no Docker Hub](https://hub.docker.com/r/evoapicloud/evolution-api)

As imagens oficiais estão disponíveis no Docker Hub e podem ser baixadas usando:
```bash
# ✅ Tag correta confirmada: v2.3.4 (com prefixo v)
docker pull evoapicloud/evolution-api:v2.3.4
```

## Problemas Conhecidos da Versão 2.3.6

A versão 2.3.6 da Evolution API apresenta os seguintes problemas relatados:

### 1. **imageMessage Vazio ao Buscar Mensagens**
- **Problema**: Quando mensagens são buscadas via REST API (`findChats`), o campo `imageMessage` pode vir vazio `{}`
- **Impacto**: Imagens não carregam no chat inicialmente
- **Solução Implementada**: 
  - Busca automática de URL usando `messageId` quando disponível
  - Atualização automática via WebSocket quando dados completos chegarem
  - Fallback para mostrar "Imagem (URL não disponível)" temporariamente

### 2. **Problemas com QR Code**
- **Problema**: QR Code pode apresentar carregamento infinito e falhar na conexão
- **Referência**: [Issue #2181](https://github.com/EvolutionAPI/evolution-api/issues/2181)

### 3. **Falhas no Envio de Mensagens**
- **Problema**: Alguns números não recebem mensagens enviadas, resultando em mensagens pendentes
- **Referência**: [Issue #2272](https://github.com/EvolutionAPI/evolution-api/issues/2272)

### 4. **Interrupção de Webhooks**
- **Problema**: Webhooks (n8n, etc.) podem parar de receber dados após atualização para 2.3.6
- **Referência**: [Issue #2126](https://github.com/EvolutionAPI/evolution-api/issues/2126)

## Recomendação

**Use a versão 2.3.4** para maior estabilidade e menor probabilidade de problemas.

### Como Fazer Downgrade para 2.3.4

```bash
# 1. Parar o container atual
docker-compose down

# 2. Editar docker-compose.yml e alterar a imagem:
# DE:
#   image: evoapicloud/evolution-api:latest
# PARA:
#   image: evoapicloud/evolution-api:2.3.4

# 3. Recriar o container
docker-compose up -d
```

## Compatibilidade do Código

O código do Zentria foi desenvolvido para funcionar com ambas as versões:

- ✅ Suporte para `mediatype` no nível raiz (2.3.4 e 2.3.6)
- ✅ Tratamento de `imageMessage` vazio
- ✅ Busca automática de URLs quando `messageId` está disponível
- ✅ Atualização via WebSocket como fallback

## Mudanças de Versão

### v2.3.4 → v2.3.6
- ✅ Código compatível sem mudanças necessárias
- ⚠️ Problemas de estabilidade na 2.3.6
- ⚠️ `imageMessage` vazio mais frequente na 2.3.6

### v2.3.6 → v2.3.4 (Downgrade)
- ✅ Código funciona sem modificações
- ✅ Maior estabilidade
- ✅ Menos problemas com `imageMessage` vazio

## Testes Realizados

- ✅ Envio de mensagens de texto
- ✅ Envio de mídia (imagens, vídeos, áudios)
- ✅ Recebimento de mensagens via WebSocket
- ✅ Busca de mensagens antigas via REST API
- ⚠️ Carregamento de imagens antigas (problema na 2.3.6, resolvido com busca automática)

## Referências

- [Evolution API GitHub](https://github.com/EvolutionAPI/evolution-api)
- [Documentação Oficial](https://doc.evolution-api.com/)
- [Issue #2181 - QR Code Problems](https://github.com/EvolutionAPI/evolution-api/issues/2181)
- [Issue #2272 - Message Sending Issues](https://github.com/EvolutionAPI/evolution-api/issues/2272)
- [Issue #2126 - Webhook Issues](https://github.com/EvolutionAPI/evolution-api/issues/2126)

