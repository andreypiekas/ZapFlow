# 📋 Roteiro de Implantação - Novas Funcionalidades

## 📅 Data de Criação: 2025-01-XX

---

## 🎯 Funcionalidade 1: Exibir Nome do Usuário e Setor nas Mensagens Enviadas

### Descrição
Ao enviar uma mensagem no chat, deve aparecer o nome do usuário e o setor antes da mensagem.

### Exemplo Visual
```
Andrey - Faturamento:
Olá, tudo bem?
```

### Requisitos Técnicos
- **Arquivo:** `frontend/components/ChatInterface.tsx`
- **Modificações:**
  1. Adicionar exibição do nome do usuário e setor acima da mensagem enviada
  2. Nome e setor em **negrito**
  3. Mensagem abaixo em texto normal
  4. Aplicar apenas para mensagens enviadas (`sender === 'agent'`)

### Dados Necessários
- `currentUser.name` - Nome do usuário
- `currentUser.departmentId` - ID do departamento
- `departments` - Lista de departamentos para buscar o nome

### Implementação
1. Modificar componente de renderização de mensagem em `ChatInterface.tsx`
2. Adicionar lógica para buscar nome do departamento pelo ID
3. Aplicar estilos (negrito para nome/setor, normal para mensagem)
4. Verificar se usuário tem departamento atribuído

### Prioridade: 🔴 Alta

---

## 🎯 Funcionalidade 2: Enviar Contato da Lista de Contatos

### Descrição
Adicionar opção no chat para enviar um contato da lista de contatos cadastrados.

### Requisitos Técnicos
- **Arquivos:**
  - `frontend/components/ChatInterface.tsx` - Interface do chat
  - `frontend/services/whatsappService.ts` - Serviço de envio de mensagens
  - `frontend/types.ts` - Tipos de dados

### Funcionalidades
1. Botão/ícone para abrir lista de contatos
2. Buscar contatos cadastrados no sistema
3. Selecionar contato da lista
4. Enviar contato via WhatsApp (formato vCard)

### Implementação
1. Adicionar botão de contato na barra de ferramentas do chat
2. Criar modal/popup com lista de contatos
3. Implementar busca/filtro de contatos
4. Integrar com API do Evolution para envio de contato (vCard)
5. Adicionar tipo de mensagem `contact` em `MessageType`

### Prioridade: 🟡 Média

---

## 🎯 Funcionalidade 3: Mensagem Automática de Seleção de Setores

### Descrição
Quando um usuário entra em contato pela primeira vez, enviar mensagem automática solicitando seleção de setor.

### Fluxo
1. Usuário envia primeira mensagem
2. Sistema detecta que é novo contato (sem departamento atribuído)
3. Envia mensagem automática com lista de setores numerados
4. Usuário responde com número do setor
5. Sistema atribui chat ao setor selecionado
6. Chat vai para triagem do setor

### Exemplo de Mensagem
```
Boa tarde! Favor selecionar o departamento para atendimento:

1 - Faturamento
2 - Suporte Técnico
3 - Vendas
4 - Financeiro
```

### Requisitos Técnicos
- **Arquivos:**
  - `frontend/App.tsx` - Lógica de detecção de novo contato
  - `frontend/services/whatsappService.ts` - Envio de mensagem automática
  - `frontend/components/ChatInterface.tsx` - Processamento de resposta

### Funcionalidades
1. Detectar novo contato (sem departamento atribuído)
2. Gerar mensagem com lista de setores numerados
3. Ajustar saudação conforme fuso horário (manhã/tarde/noite)
4. Processar resposta numérica do usuário
5. Atribuir chat ao setor selecionado
6. Mover chat para triagem do setor

### Implementação
1. Criar função `sendDepartmentSelectionMessage()` em `whatsappService.ts`
2. Adicionar lógica em `syncChats` para detectar novos contatos
3. Criar função `processDepartmentSelection()` para processar resposta
4. Integrar com sistema de fuso horário existente
5. Atualizar status do chat após seleção

### Prioridade: 🔴 Alta

---

## 🎯 Funcionalidade 4: Ajustar Relatórios - Contagem de Avaliações

### Descrição
Os relatórios não estão contando as avaliações recebidas no final do atendimento.

### Requisitos Técnicos
- **Arquivo:** `frontend/components/ReportsDashboard.tsx`
- **Verificar:**
  1. Se avaliações estão sendo salvas corretamente
  2. Se relatórios estão buscando avaliações do banco/estado
  3. Se filtros de data estão incluindo avaliações

### Implementação
1. Verificar estrutura de dados de avaliações em `Chat` interface
2. Revisar queries/filtros de relatórios
3. Adicionar contagem de avaliações por período
4. Adicionar gráficos/estatísticas de avaliações
5. Verificar se `rating` está sendo persistido corretamente

### Prioridade: 🟡 Média

---

## 🎯 Funcionalidade 5: Ajustar Chatbot

### Descrição
O chatbot não está funcionando conforme configurado.

### Requisitos Técnicos
- **Arquivos:**
  - `frontend/components/ChatbotSettings.tsx` - Configurações do chatbot
  - `frontend/services/geminiService.ts` - Serviço de IA (se aplicável)
  - Lógica de processamento de mensagens do chatbot

### Investigação Necessária
1. Verificar se chatbot está ativado
2. Verificar se mensagens estão sendo interceptadas corretamente
3. Verificar se respostas estão sendo geradas
4. Verificar se configurações estão sendo aplicadas
5. Verificar logs de erro

### Implementação
1. Revisar lógica de ativação do chatbot
2. Verificar integração com serviço de IA
3. Corrigir processamento de mensagens
4. Adicionar logs de debug
5. Testar fluxo completo

### Prioridade: 🔴 Alta

---

## 🎯 Funcionalidade 6: Reformular Aba Conexão - Integração Evolution API

### Descrição
Reformular a aba de conexão para integrar com o serviço Evolution API que roda na porta 8080, permitindo cadastrar instâncias e gerar QR Code.

### Funcionalidades
1. Listar instâncias do Evolution API
2. Criar nova instância
3. Gerar QR Code para conexão
4. Verificar status da instância
5. Conectar/desconectar instâncias
6. Configurar instância (nome, webhook, etc.)

### Requisitos Técnicos
- **Arquivo:** `frontend/components/Connection.tsx`
- **Endpoints Evolution API:**
  - `GET /instance/fetchInstances` - Listar instâncias
  - `POST /instance/create` - Criar instância
  - `GET /instance/connect/{instanceName}` - Obter QR Code
  - `GET /instance/connectionState/{instanceName}` - Status da conexão
  - `DELETE /instance/logout/{instanceName}` - Desconectar

### Implementação
1. Criar interface para listar instâncias
2. Adicionar formulário para criar nova instância
3. Implementar geração e exibição de QR Code
4. Adicionar verificação de status em tempo real
5. Adicionar opções de configuração
6. Integrar com sistema de configuração existente

### Prioridade: 🟡 Média

---

## 📊 Priorização Geral

### 🔴 Alta Prioridade
1. Funcionalidade 1: Exibir Nome e Setor nas Mensagens
2. Funcionalidade 3: Mensagem Automática de Seleção de Setores
3. Funcionalidade 5: Ajustar Chatbot

### 🟡 Média Prioridade
1. Funcionalidade 2: Enviar Contato
2. Funcionalidade 4: Ajustar Relatórios
3. Funcionalidade 6: Reformular Aba Conexão

---

## 🔧 Dependências e Pré-requisitos

### Dados Necessários
- Lista de departamentos cadastrados
- Lista de contatos cadastrados
- Informações do usuário logado (nome, departamento)
- Configurações do Evolution API (baseUrl, apiKey)

### APIs Necessárias
- Evolution API v2.x (porta 8080)
- Endpoints de instâncias
- Endpoints de mensagens (envio de contato)

---

## 📝 Notas de Implementação

### Considerações
1. Manter compatibilidade com código existente
2. Adicionar logs de debug para facilitar troubleshooting
3. Testar cada funcionalidade isoladamente
4. Validar com dados reais antes de deploy

### Testes Necessários
- Teste de envio de mensagem com nome/setor
- Teste de seleção de setor por novo contato
- Teste de envio de contato
- Teste de relatórios com avaliações
- Teste de chatbot em diferentes cenários
- Teste de integração Evolution API

---

## 🚀 Ordem Sugerida de Implementação

1. **Fase 1 - Correções Críticas:**
   - Funcionalidade 5: Ajustar Chatbot
   - Funcionalidade 4: Ajustar Relatórios

2. **Fase 2 - Melhorias de UX:**
   - Funcionalidade 1: Exibir Nome e Setor
   - Funcionalidade 3: Mensagem Automática de Setores

3. **Fase 3 - Novas Funcionalidades:**
   - Funcionalidade 2: Enviar Contato
   - Funcionalidade 6: Reformular Aba Conexão

---

## 📌 Checklist de Validação

- [ ] Nome e setor aparecem corretamente nas mensagens enviadas
- [ ] Contatos podem ser enviados pelo chat
- [ ] Mensagem automática de setores é enviada para novos contatos
- [ ] Seleção de setor funciona corretamente
- [ ] Relatórios contam avaliações corretamente
- [ ] Chatbot funciona conforme configurado
- [ ] Aba conexão integra com Evolution API
- [ ] QR Code é gerado e exibido corretamente
- [ ] Todas as funcionalidades testadas e validadas

---

## 🔗 Referências

- Evolution API Documentation: https://doc.evolution-api.com/
- WhatsApp Business API: https://developers.facebook.com/docs/whatsapp
- vCard Format: https://en.wikipedia.org/wiki/VCard

