# 📋 TODO - Tarefas Pendentes

## 🔴 Problemas Críticos

### 1. Duplicação de Cabeçalho em Mensagens do Agente
**Status:** 🔴 Em andamento  
**Prioridade:** Alta  
**Descrição:** Mensagens do agente ainda estão aparecendo com cabeçalho duplicado na interface (ex: "Andrey:\nAndrey:\n111" em vez de apenas "111").

**Tentativas de correção realizadas:**
- ✅ Criada função `normalizeMessageContent` para remover cabeçalhos
- ✅ Normalização aplicada ao carregar mensagens do banco
- ✅ Normalização aplicada ao processar mensagens via Socket.IO
- ✅ Normalização aplicada ao salvar mensagens no banco
- ✅ Normalização aplicada na renderização (`ChatInterface.tsx`)
- ✅ Melhorada função para remover cabeçalhos duplicados com loop robusto

**Problema persistente:**
- Mensagens antigas no banco ainda têm cabeçalho duplicado
- A normalização não está removendo todos os casos de duplicação
- Pode haver múltiplas fontes de duplicação (banco, Socket.IO, renderização)

**Próximos passos sugeridos:**
1. Investigar se há outras fontes de duplicação além das já identificadas
2. Verificar se a normalização está sendo aplicada em TODOS os pontos de entrada de dados
3. Considerar criar um script de migração para limpar mensagens antigas no banco
4. Adicionar logs mais detalhados para rastrear onde a duplicação está ocorrendo
5. Testar com mensagens novas para confirmar se o problema persiste apenas em mensagens antigas

**Arquivos relacionados:**
- `App.tsx` (função `normalizeMessageContent`, `handleUpdateChat`, `processSingleMessage`)
- `components/ChatInterface.tsx` (função `normalizeMessageContent`, `renderMessageContent`)
- Banco de dados (mensagens antigas com cabeçalho duplicado)

---

### 2. Imagens não aparecem (mídia sem URL/base64)
**Status:** 🟡 Em validação  
**Prioridade:** Alta  
**Descrição:** Mensagens de imagem aparecem como "Imagem (URL não disponível)" e não renderizam o conteúdo.

**Causas identificadas e correções aplicadas:**
- ✅ **Webhook Base64 era salvo como global (user_id NULL), mas não era lido pela UI**:
  - O backend `GET /api/data/:dataType` filtrava apenas por `user_id = req.user.id`, então `webhook_messages` nunca era retornado.
  - **Correção**: para `webhook_messages`, o backend agora permite buscar por `key` retornando registros `user_id = req.user.id` **ou** `user_id IS NULL` (com `LIMIT 1`).
- ✅ **Preview de mídia enviada pelo agente estava quebrado**:
  - `blobToBase64()` retorna base64 puro; o frontend salvava isso em `mediaUrl` sem prefixo `data:<mime>;base64,`, então o `<img>` não carregava.
  - **Correção**: `mediaUrl` agora usa Data URL completo (`data:${mime};base64,...`).

**Pré-requisito (para mensagens recebidas/antigas com `imageMessage: {}`):**
- Recomenda-se habilitar **Webhook Base64** na Evolution API (ver `docs/CONFIGURAR_WEBHOOK_BASE64.md`).

**Arquivos relacionados:**
- `backend/server.js` (leitura de `webhook_messages`)
- `components/ChatInterface.tsx` (render e preview de mídia)

---

## 🟡 Melhorias Pendentes

### 2. Otimização de Performance
**Status:** 🟡 Pendente  
**Prioridade:** Média  
**Descrição:** Reduzir re-renders desnecessários e otimizar sincronização de chats.

---

## 🟢 Funcionalidades Futuras

### 3. Melhorias de UX
**Status:** 🟢 Planejado  
**Prioridade:** Baixa  
**Descrição:** Melhorias gerais na experiência do usuário.

---

## 📝 Notas

- Este arquivo deve ser atualizado conforme problemas são resolvidos ou novos são identificados
- Use emojis para indicar status: 🔴 Crítico, 🟡 Pendente, 🟢 Planejado, ✅ Concluído

