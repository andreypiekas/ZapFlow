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

