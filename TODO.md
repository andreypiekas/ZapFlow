# 📋 TODO - Tarefas Pendentes / Roadmap

## ✅ Concluídos

### 1. Duplicação de Cabeçalho em Mensagens do Agente (100%)
**Status:** ✅ Concluído (100%)  
**Prioridade:** Alta (resolvido)  
**Objetivo:** Garantir que **texto com nome/cabeçalho nunca entre no estado da UI** e **nunca seja salvo no banco**.  
**Resultado esperado:** Mensagens do agente no React state e no banco ficam sempre como `{ sender: 'agent', content: '3' }` (nunca `"Andrey:\n3"`).

**Implementação (resumo):**
- `messageToSend` existe apenas para envio ao WhatsApp.
- UI e banco usam sempre `messageContent` (sem header).
- Deduplicação por `whatsappMessageId` + normalização defensiva para mensagens antigas.

**Arquivos principais:**
- `App.tsx`
- `components/ChatInterface.tsx`
- `services/whatsappService.ts`

**Critério de aceite:**
- Enviar/receber 10 mensagens seguidas → nenhuma duplicação visual por header e nenhuma mensagem salva no banco com header.

---
### 2. Imagens não aparecem (mídia sem URL/base64)
**Status:** ✅ Concluído  
**Prioridade:** Alta (resolvido)  
**Resultado:** Imagens/vídeos/PDFs deixam de sumir após alguns segundos; a mensagem “Imagem (URL não disponível)” não volta após sync/F5.

**Correções efetivas:**
- Backend: webhook salva base64 de forma robusta em `webhook_messages` (PostgreSQL).
- Frontend: busca `webhook_messages` por `messageId` (inclui `data.key.id`), faz retry controlado e preserva `mediaUrl`/`rawMessage` ao mesclar mensagens (evita sobreposição por cópias sem mídia).
- Deduplicação/merge: no `App.tsx`, ao mesclar mensagens (API/DB/local), mantemos a `mediaUrl` existente se a nova cópia vier sem mídia.

**Critério de aceite (atingido):**
- Enviar/receber imagens/vídeos/PDFs → continuam aparecendo após sync e F5, sem voltar “URL não disponível”.

---

### 3. Arquivos, mídias e links “igual WhatsApp Web” (paridade de UX)
**Status:** ✅ Concluído  
**Prioridade:** Alta  
**Objetivo:** Mensagens de **link**, **arquivo** e **mídia** devem se comportar/parecer com o WhatsApp Web.

**Implementação (resumo):**
- Links: detecção + preview com cache no servidor (`/api/link-preview`, SSRF-safe) e cache no cliente.
- Arquivos: cards com metadados (nome/tipo/tamanho/data) e ações (visualizar/baixar quando possível).
- Mídias: normalização de `directPath` (CDN do WhatsApp), fallback/retry via `webhook_messages` + busca por `messageId`, suporte a data URL (base64) e URLs autenticadas.

**Tarefas detalhadas:**
- **Links (preview estilo WhatsApp):**
  - Detectar link no conteúdo.
  - Gerar preview (título, descrição, imagem) com cache no servidor.
  - Segurança: bloquear SSRF (não permitir fetch para IPs locais/privados).
- **Arquivos (cards completos):**
  - Mostrar nome, tipo, tamanho, ícone, data/hora.
  - Botão “Baixar” (sempre que houver fonte).
- **Mídias (imagem/vídeo/áudio):**
  - Mostrar miniatura, legenda e estado (enviando/enviado/erro).
  - Tratamento correto para base64, URL direta e URL autenticada.

**Critério de aceite:**
- Link + imagem + PDF enviados/recebidos → UI consistente, sem placeholders “não disponível”.

---

### 4. Visualização expandida no chat + botão de download (imagem/vídeo/PDF)
**Status:** ✅ Concluído  
**Prioridade:** Alta  
**Objetivo:** Ao clicar na mídia no chat, abrir um **viewer** (modal) para visualizar, com opção de download.

**Implementação (resumo):**
- Viewer modal para imagem/vídeo/PDF (fecha com ESC/click fora).
- Download robusto (Data URL → Blob/`blob:`; URL HTTP quando disponível).

**Tarefas detalhadas:**
- **Imagem:** modal com zoom, navegação (esc fecha), abrir em nova aba opcional.
- **Vídeo:** modal com player, fullscreen, download.
- **PDF:** viewer (iframe/pdf.js) + download.
- **Download:** gerar arquivo a partir de:
  - Data URL (base64) → converter para Blob e baixar
  - URL (HTTP) → baixar via link/endpoint autenticado

**Critério de aceite:**
- Click → abre viewer; Download → salva arquivo correto.

---

### 5. Encaminhamento de mensagens (Forward) com tag “Encaminhada”
**Status:** ✅ Concluído  
**Prioridade:** Alta  
**Objetivo:** Permitir encaminhar mensagens e exibir a tag “Encaminhada”, como no WhatsApp.

**Implementação (resumo):**
- UI: menu de contexto/ações na mensagem → **Encaminhar**; modal para selecionar chats destino.
- Persistência: salva metadata `forwarded`, `forwardedFromChatId`, `forwardedFromMessageId` na mensagem.
- Render: mostra selo **“Encaminhada”** no bubble.
- **Pesquisa técnica:** Evolution API não expõe flag “forwarded” nativa para o WhatsApp (encaminhada “real”); adotado **selo na UI** como alternativa.

**Tarefas detalhadas:**
- UI: menu de contexto na mensagem → “Encaminhar”.
- Selecionar chat(s) de destino.
- Persistir metadata: `forwarded = true`, `forwardedFromChatId`, `forwardedFromMessageId`.
- Render: mostrar selo “Encaminhada”.
- **Pesquisa técnica (obrigatória):** verificar se a Evolution API permite enviar com flag de encaminhada “real” (para o WhatsApp do cliente).  
  - Se não suportar, definir alternativa (ex.: selo apenas na UI + texto opcional).

---
## 🔴 Prioritário

### 6. IP do servidor automático (zero configuração manual)
**Status:** 🔴 Pendente  
**Prioridade:** Alta  
**Objetivo:** Nada deve exigir edição manual de IP em arquivos/scripts.

**Tarefas detalhadas:**
- `install/autoinstall.txt`: detectar IP automaticamente e persistir em `.env`/config.
- Remover IP hardcoded de docs/scripts e usar `SERVER_IP`/variáveis.
- Garantir CORS e URLs internos usando o `SERVER_IP` detectado.

---

### 7. Webhook persistente (global) — não configurável “por máquina”
**Status:** 🔴 Pendente  
**Prioridade:** Alta  
**Objetivo:** A configuração do webhook deve ser **centralizada no servidor** e reaplicada automaticamente.

**Tarefas detalhadas:**
- Definir fonte de verdade: PostgreSQL (`/api/config` global) + `.env` no servidor.
- Criar rotina no backend (startup) para “garantir webhook configurado” na Evolution via API (se houver endpoint).
- Incluir no autoinstall a configuração automática do webhook (URL + eventos + base64).

---

### 8. Feriados (dashboard + tela) — inconsistência + dedupe de pesquisa por cidade/estado
**Status:** 🔴 Pendente (revalidação)  
**Prioridade:** Alta  
**Objetivo:** Tudo que aparece no dashboard deve aparecer na tela de feriados e vice‑versa; evitar buscas repetidas.

**Tarefas detalhadas:**
- Validar persistência e leitura do banco (nacionais + municipais).
- Ajustar UI para garantir renderização e filtros consistentes.
- Criar rotina anti‑duplicidade:
  - Não pesquisar mesma cidade/estado/ano em duplicidade (concorrente e histórico).
  - Respeitar TTL (ex.: 10 dias) e quota do Gemini.
- Melhorar indicador de status (buscando, quota excedida, fonte: banco vs IA).

---

## 🟢 Futuras

### 9. Reduzir logs no F12 + toggle “Debug do Dev”
**Status:** 🟢 Planejado  
**Objetivo:** Usuário final não deve ver logs excessivos; dev pode reativar.

**Tarefas detalhadas:**
- Criar `logger` com níveis (`error/warn/info/debug`).
- Toggle em Configurações (salvo no banco) para habilitar logs de debug.
- Remover/encapsular logs atuais em `debug()`.

---

### 10. Validação de segurança da aplicação
**Status:** 🟢 Planejado  
**Objetivo:** Hardening de autenticação, permissões e superfície de ataque.

**Tarefas detalhadas (alto nível):**
- Revisar CORS, JWT, rate limiting (reativar em produção), validações de input.
- Revisar endpoints que retornam dados globais (ex.: `webhook_messages`).
- Checklist de produção (segredos, HTTPS, headers, logs).

---

### 11. Relatório diário via Telegram (uso/consumo/armazenamento)
**Status:** 🟢 Planejado  
**Objetivo:** Enviar relatório automático diário (status do sistema).

**Tarefas detalhadas:**
- Criar job diário no backend (cron) para coletar métricas.
- Enviar via Bot Telegram (chatId configurado).
- Métricas: volume de chats/mensagens, tamanho do DB, falhas, quota Gemini, etc.

---

## ❓ Questionamentos / Decisões

### 12. Onde as mídias/arquivos são salvos hoje? (e estratégia futura)
**Status:** 🟡 Em definição  
**Hoje (estado atual):**
- Quando o **Webhook Base64** está ativo, o backend salva **base64 (Data URL)** no PostgreSQL em `user_data` (`data_type = webhook_messages`).
- Mídia enviada pelo agente também pode ficar como Data URL no estado/registro do chat (dependendo do fluxo).

**Decisão necessária (para escalar igual WhatsApp Web):**
- Definir armazenamento de mídia no servidor:
  - Opção A: PostgreSQL (rápido de implementar, pior para volume grande)
  - Opção B: Arquivo em disco/MinIO/S3 + tabela com metadados (recomendado)
- Definir política de retenção (ex.: 30/90 dias) + limpeza automática.

