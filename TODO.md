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
- `frontend/App.tsx`
- `frontend/components/ChatInterface.tsx`
- `frontend/services/whatsappService.ts`

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
- Deduplicação/merge: no `frontend/App.tsx`, ao mesclar mensagens (API/DB/local), mantemos a `mediaUrl` existente se a nova cópia vier sem mídia.

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

### 6. IP do servidor automático (zero configuração manual)
**Status:** ✅ Concluído  
**Prioridade:** Alta  
**Objetivo:** Nada deve exigir edição manual de IP em arquivos/scripts.

**Implementação (resumo):**
- Frontend: URL do backend auto‑derivada de `window.location` quando `VITE_API_URL` não está definido.
- Backend: detecção automática de `SERVER_IP` (fallback) para liberar CORS e melhorar logs.
- Infra/Docs/Scripts: removido IP hardcoded (`docker-compose.yml` usa `SERVER_IP`; docs/scripts usam placeholders).

**Tarefas detalhadas:**
- `install/autoinstall.txt`: detectar IP automaticamente e persistir em `.env`/config.
- Remover IP hardcoded de docs/scripts e usar `SERVER_IP`/variáveis.
- Garantir CORS e URLs internos usando o `SERVER_IP` detectado.

---
## 🔴 Prioritário

### 7. Webhook persistente (global) — não configurável “por máquina”
**Status:** ✅ Concluído  
**Prioridade:** Alta  
**Objetivo:** A configuração do webhook deve ser **centralizada no servidor** e reaplicada automaticamente.

**Implementação (resumo):**
- Fonte de verdade: `apiConfig` global no PostgreSQL (`/api/config`) + variáveis `EVOLUTION_*` no `.env` do backend (fallback).
- Backend: rotina de startup + reaplicação ao salvar `/api/config` para tentar configurar webhook (URL + eventos + base64) via Evolution API (best‑effort, tenta múltiplos endpoints).
- Autoinstall: gera as variáveis `EVOLUTION_BASE_URL`, `EVOLUTION_AUTH_KEY`, `EVOLUTION_WEBHOOK_URL`, `EVOLUTION_WEBHOOK_EVENTS`, `EVOLUTION_WEBHOOK_BASE64`, `EVOLUTION_WEBHOOK_BY_EVENTS`.

**Tarefas detalhadas:**
- Definir fonte de verdade: PostgreSQL (`/api/config` global) + `.env` no servidor.
- Criar rotina no backend (startup) para “garantir webhook configurado” na Evolution via API (se houver endpoint).
- Incluir no autoinstall a configuração automática do webhook (URL + eventos + base64).

---

### 8. Feriados (dashboard + tela) — inconsistência + dedupe de pesquisa por cidade/estado
**Status:** ✅ Concluído  
**Prioridade:** Alta  
**Objetivo:** Tudo que aparece no dashboard deve aparecer na tela de feriados e vice‑versa; evitar buscas repetidas.

**Implementação (resumo):**
- Consistência Dashboard ↔ Tela: a tela `Feriados` agora usa, por padrão, os **mesmos estados do dashboard** (SC/PR/RS + `holidayStates`) e carrega municipais do **banco/cache**; busca via IA só ocorre quando o usuário seleciona estados manualmente.
- Anti‑duplicidade / TTL: habilitado **cache negativo** (array vazio) para cidades sem feriados municipais, evitando re‑pesquisa por 10 dias; mantém respeito ao controle de cota do Gemini.
- Status: indicador mostra **fonte** (Banco / IA / Banco+IA) e progresso melhorado durante varredura por municípios.

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
**Status:** ✅ Concluído  
**Objetivo:** Usuário final não deve ver logs excessivos; dev pode reativar.

**Implementação (resumo):**
- Criado `frontend/services/logger.ts` com níveis (`error/warn/info/debug`) e flag `debugLogsEnabled`.
- Adicionado toggle em **Configurações** (“Debug do Dev”) persistido no `/api/config`.
- Logs `[DEBUG]` do `frontend/App.tsx` migrados para `logger.debug()` (silencioso por padrão; aparece quando ativado).

**Tarefas detalhadas:**
- Criar `logger` com níveis (`error/warn/info/debug`).
- Toggle em Configurações (salvo no banco) para habilitar logs de debug.
- Remover/encapsular logs atuais em `debug()`.

---

### 10. Validação de segurança da aplicação
**Status:** ✅ Concluído  
**Objetivo:** Hardening de autenticação, permissões e superfície de ataque.

**Implementação (resumo):**
- Backend: **rate limiting reativado** (por padrão em produção) para **geral / login / dados / webhook** (`ENABLE_RATE_LIMITING` + `*_RATE_LIMIT_*`).
- JWT: `JWT_SECRET` **obrigatório em produção** (sem fallback), algoritmo travado (`HS256`) e expiração configurável (`JWT_EXPIRES_IN`).
- CORS: controle de rede privada via `CORS_ALLOW_PRIVATE_NETWORK` (default mais seguro em produção).
- Headers: `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e **HSTS condicional** (`ENABLE_HSTS`).
- SSRF: `/api/link-preview` reforçado (redirects validados + leitura com limite real de bytes).
- Inputs: validação de `dataType/key` nas rotas `/api/data` e validação de `id` numérico em rotas críticas.
- Docs: `CHECKLIST_PRODUCAO.md` atualizado com os itens concluídos.

**Critério de aceite (atingido):**
- Em `NODE_ENV=production` sem `JWT_SECRET` o backend **não inicia**.
- `/api/link-preview` não consegue acessar IP privado via redirect e não baixa HTML gigante quando `content-length` não existe.

---

### 11. Relatório diário via Telegram (uso/consumo/armazenamento)
**Status:** ✅ Concluído  
**Objetivo:** Enviar relatório automático diário (status do sistema).

**Implementação (resumo):**
- Backend: `backend/services/telegramReportService.js` com scheduler diário (hora + timezone) e envio via Bot API.
- Persistência: config global salva no banco em `user_data` (`data_type = integrations`, `data_key = telegram_report`) + status em `telegram_report_status`.
- Segurança: token do bot **não é exposto** no `/api/config` (endpoints dedicados para admin).
- Frontend: nova **aba Telegram** em `frontend/components/Settings.tsx` para ativar/desativar, definir horário/timezone/chatId/token + botões **Enviar teste** e **Enviar agora**.
- Docs: tutorial em `docs/TELEGRAM_RELATORIO_DIARIO.md`.

**Critério de aceite (atingido):**
- Admin configura Telegram e consegue **Enviar teste** e **Enviar agora**.
- Com o relatório ativado, backend envia automaticamente 1x ao dia no horário configurado.

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

---

## 🔒 Infra / Deploy

### 13. HTTPS mesmo acessando por IP + arquivo de autoconfiguração
**Status:** ✅ Concluído  
**Prioridade:** Alta  
**Objetivo:** Permitir acesso via `https://<IP>` sem depender de domínio e sem exigir configuração manual; o processo deve gerar um **arquivo de autoconfiguração**.

**Implementação (resumo):**
- Autoconfig (Linux): `install/https_autoconfig.sh`
  - Detecta IP automaticamente
  - Gera certificado self‑signed com **SAN IP** e salva em `/etc/zentria/certs/`
  - Copia o cert público para `certs/zentria-ip.crt` (ignorado no git)
  - Configura Nginx com `80 → 443` e proxy:
    - `/` → frontend (`:5173`)
    - `/api/` → backend (`:3001`)
    - `/instance/`, `/message/`, `/chat/`, `/socket.io/` → Evolution (`:8080`) com upgrade (WSS)
- Helper (Windows): `install/https_autoconfig.ps1` (importa o cert no store confiável do Windows).
- Docs: `docs/HTTPS_POR_IP_AUTOCONFIG.md` (inclui passos Windows/Android e troubleshooting).
- Docker: `docker-compose.yml` aceita override de URL pública via `EVOLUTION_SERVER_URL`.
- Backend: `backend/config.example.env` atualizado (envs novos + proxy/HSTS + rate limiting).

**Critério de aceite:**
- Abrir `https://<IP>` e usar login + chats + mídias + WebSocket sem falhas.

---

## 🧹 Organização / Branding

### 14. Reorganizar arquivos do projeto + README
**Status:** ✅ Concluído  
**Prioridade:** Média  
**Objetivo:** Organizar a estrutura do repositório e garantir um `README.md` único e confiável.
Manter os arquivos de instucao e manuais, documentos

**Tarefas detalhadas:**
- Padronizar pastas (`frontend/`, `backend/`, `docs/`, `install/`, `scripts/`) e mover arquivos conforme necessário.
- Remover/arquivar duplicidades (ex.: backups, manuais repetidos) sem quebrar o fluxo de instalação.
- Atualizar `README.md` com direcoes para os arquivos de instalacao, ajustes e configuracoes (Windows/Linux), variáveis `.env`, e troubleshooting.

---

### 15. Renomear “ZapFlow” → “Zentria” (novo nome do produto)
**Status:** ✅ Concluído  
**Prioridade:** Alta  
**Objetivo:** Alterar o branding em todo o sistema (UI, docs, scripts, serviços), mantendo compatibilidade.

**Implementação (resumo):**
- Branding atualizado para **Zentria** em UI/backend/docs/scripts (sem “ZapFlow” em arquivos ativos).
- Compatibilidade preservada:
  - **LocalStorage:** chaves legadas `zapflow_*` continuam sendo lidas e migradas (best‑effort) para `zentria_*`.
  - **Banco:** instalações antigas podem manter `DB_NAME=zapflow` (opcional renomear banco para `zentria`).
  - **PM2:** processos legados `zapflow-*` são removidos/limpos quando aplicável.
- Script de migração para servidores já rodando versões antigas:
  - `scripts/migrate_zapflow_to_zentria.sh`
  - `scripts/migrate_zapflow_to_zentria.ps1`

**Tarefas detalhadas:**
- Frontend: atualizar textos/títulos/labels (incl. telas e menu).
- Backend: atualizar logs/nomes e mensagens.
- Docs/Scripts/PM2/Docker: atualizar nomes e referências.
- Fazer varredura por `ZapFlow`/`zapflow` e substituir com critério (não quebrar chaves/IDs; definir estratégia de migração de `localStorage` se necessário).

