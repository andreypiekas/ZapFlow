# 📋 Checklist de Produção - Zentria Manager

**Versão:** 1.3.0  
**Data:** 2025-01-XX  
**Status:** Em desenvolvimento (⚠️ não pronto para produção)

---

## ✅ O QUE JÁ FOI IMPLEMENTADO

### 🔐 Backend & Autenticação

- [x] **Backend API Node.js/Express** com PostgreSQL
- [x] **Sistema de autenticação JWT** (tokens com expiração de 7 dias)
- [x] **Hash de senhas** com bcrypt
- [x] **Middleware de autenticação** para proteger rotas
- [x] **Sistema de roles** (ADMIN, AGENT) implementado
- [x] **CRUD completo de dados** (chats, contatos, usuários, departamentos, etc.)
- [x] **Persistência híbrida** (API + localStorage como fallback)
- [x] **Health check endpoint** (`/api/health`)
- [x] **CORS configurável** por ambiente
- [x] **Body parser** com limite de 50MB para payloads grandes
- [x] **Scripts de migração** do banco de dados
- [x] **Scripts de criação/validação** de usuários admin
- [x] **Tratamento de erros** básico nas rotas

### 🎨 Frontend

- [x] **Interface React 19** com TypeScript
- [x] **Build com Vite 6** configurado
- [x] **Tailwind CSS 3** configurado para produção (PostCSS)
- [x] **Socket.IO Client 4** implementado para tempo real
- [x] **Sistema de login** integrado com backend
- [x] **Gestão de usuários** (criação, edição, roles)
- [x] **Gestão de departamentos**
- [x] **Gestão de contatos** (com sincronização Google Contacts)
- [x] **Interface de chat** completa
- [x] **Respostas rápidas** (quick replies)
- [x] **Workflows/SOP** (checklists padronizados)
- [x] **Configuração de chatbot** com horários
- [x] **Dashboard de relatórios** básico
- [x] **Integração com Google Gemini AI** para sugestões
- [x] **Error Boundary** para captura de erros React
- [x] **Filtro de logs** para reduzir poluição do console
- [x] **Criptografia de dados sensíveis** no localStorage
- [x] **Opção PostgreSQL-only** para ambientes compartilhados

### 💾 Persistência de Dados

- [x] **PostgreSQL** como banco principal
- [x] **Tabelas criadas** (users, user_data)
- [x] **Migração automática** de schema
- [x] **StorageService** com fallback para localStorage
- [x] **Sincronização automática** entre API e localStorage
- [x] **Validação de dados** antes de salvar

### 🚀 Infraestrutura & Deploy

- [x] **Scripts de instalação automatizada** (`install/autoinstall.txt`)
- [x] **Scripts de setup backend** (Linux e Windows)
- [x] **Documentação de instalação** completa
- [x] **Guia de deploy** para HostGator VPS
- [x] **Guia de deploy** com domínio e HTTPS
- [x] **Configuração de Nginx** como proxy reverso
- [x] **Configuração de PM2** para gerenciamento de processos
- [x] **Docker Compose** para Evolution API
- [x] **Variáveis de ambiente** configuráveis (.env)

### 📚 Documentação

- [x] **README.md** principal com visão geral
- [x] **INSTALACAO_BACKEND.md** com passo a passo
- [x] **backend/README.md** com documentação da API
- [x] **TODO.md** com funcionalidades pendentes / roadmap
- [x] **Guia de troubleshooting** básico
- [x] **Documentação de análise de erros** (docs/)

---

## ❌ O QUE FALTA PARA PRODUÇÃO

### 🔴 CRÍTICO (Bloqueia produção)

#### Segurança

- [x] **JWT_SECRET forte** em produção (backend recusa iniciar sem `JWT_SECRET` quando `NODE_ENV=production`)
- [x] **Rate limiting** no backend (prevenir brute force / abuso de API)
  - [x] `generalLimiter`, `loginLimiter`, `dataLimiter` e `webhookLimiter` (habilitado por padrão em produção)
  - [x] Ajuste via env: `ENABLE_RATE_LIMITING`, `*_RATE_LIMIT_*`
  - [ ] Testar com carga real para definir valores adequados
- [x] **Validação de input (básica)** (dataType/key/ids nas rotas críticas)
- [ ] **Validação de schema** para payloads complexos (ex.: Zod/Joi) + sanitização mais completa
- [ ] **HTTPS obrigatório** (certificado SSL válido)
- [x] **Headers de segurança (básicos)** (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS condicional)
- [ ] **CSP / hardening avançado** (avaliar impacto no frontend antes de ativar)
- [ ] **Logs de auditoria** (quem fez o quê e quando)
- [ ] **Backup automático** do banco de dados
- [ ] **Rotação de logs** para evitar disco cheio
- [ ] **Senha padrão do admin** alterada em produção
- [x] **Firewall configurado** (UFW) — `install/autoinstall.txt` habilita UFW e libera portas essenciais
- [ ] **Fail2ban** configurado para SSH e API

#### Estabilidade & Performance

- [ ] **Tratamento de erros** robusto (try/catch em todas as rotas críticas)
- [ ] **Logging estruturado** (Winston, Pino, ou similar)
- [ ] **Monitoramento de saúde** (Uptime monitoring)
- [ ] **Alertas** para falhas críticas (email, Slack, etc.)
- [ ] **Connection pooling** otimizado para PostgreSQL
- [x] **Índices no banco** para queries frequentes (criados nas migrações: `backend/scripts/migrate.js` + scripts de feriados/cache)
- [ ] **Cache** para dados frequentemente acessados (Redis)
- [ ] **Compressão** de respostas HTTP (gzip)
- [x] **Timeout** configurado para requisições longas (Nginx no deploy/autoconfig define `proxy_read_timeout`/`proxy_send_timeout`, ex.: Socket.IO 3600s)
- [ ] **Graceful shutdown** do servidor

#### Testes

- [ ] **Testes unitários** para funções críticas
- [ ] **Testes de integração** para API
- [ ] **Testes E2E** para fluxos principais
- [ ] **Testes de carga** (stress testing)
- [ ] **Validação de segurança** (OWASP Top 10)

### 🟡 IMPORTANTE (Recomendado para produção)

#### Funcionalidades Pendentes

- [ ] **Exibir nome e setor** nas mensagens enviadas
- [x] **Mensagem automática** de seleção de setores para novos contatos (frontend envia seleção quando chat está sem departamento)
- [x] **Corrigir chatbot** (marcação de mensagens enviadas implementada) ✅ CORRIGIDO
- [ ] **Ajustar relatórios** (contagem de avaliações não funciona)
- [ ] **Enviar contato** da lista de contatos pelo chat
- [x] **Reformular aba Conexão** (integração completa com Evolution API: instâncias, QRCode, status, create/delete)

#### Correções de Bugs Conhecidos

- [x] **WebSocket desconectando** (code 1006) - ✅ CORRIGIDO: Migrado para Socket.IO Client com fallback automático
- [ ] **Chats sem mensagens** - API não retorna mensagens mesmo com `include: ['messages']`
- [ ] **Mensagens faltando na UI (Evolution 2.3.4)** - Em bursts (muitas mensagens seguidas) a UI pode mostrar apenas parte, apesar de a Evolution conter todas.
- [x] **Erro 413 Payload Too Large** - limites ajustados (backend 50MB + Nginx `client_max_body_size 60m` no deploy/autoconfig); ainda pode precisar de otimização
- [ ] **Processamento de mensagens** - melhorar fallback quando API não retorna formato esperado
- [ ] **Envio de contatos** - Contato está sendo enviado mas WhatsApp mostra "convidar para WhatsApp" ao invés de reconhecer como contato existente. Testar diferentes formatos de número no vCard (com/sem +, com/sem código do país) e verificar se Evolution API requer formato específico para reconhecimento

#### Melhorias de UX

- [x] **Feedback visual** quando WebSocket está desconectado ✅ IMPLEMENTADO: Status no dashboard
- [ ] **Loading states** em todas as operações assíncronas
- [ ] **Mensagens de erro** amigáveis ao usuário
- [x] **Retry automático** com backoff exponencial ✅ IMPLEMENTADO: Socket.IO gerencia automaticamente
- [ ] **Offline mode** (service worker para funcionar offline)

#### Infraestrutura

- [ ] **CI/CD pipeline** (GitHub Actions, GitLab CI, etc.)
- [ ] **Ambientes separados** (dev, staging, production)
- [ ] **Deploy automatizado** via CI/CD
- [ ] **Rollback automático** em caso de falha
- [ ] **Health checks** externos (UptimeRobot, Pingdom)
- [ ] **Métricas e analytics** (Prometheus, Grafana, ou similar)

### 🟢 DESEJÁVEL (Melhorias futuras)

#### Funcionalidades Avançadas

- [ ] **Multi-tenancy** (suporte a múltiplas empresas)
- [ ] **API pública** documentada (Swagger/OpenAPI)
- [ ] **Webhooks** para integrações externas
- [ ] **Exportação de dados** em múltiplos formatos
- [ ] **Importação em massa** de contatos/usuários
- [ ] **Templates de mensagens** avançados
- [ ] **Agendamento de mensagens**
- [ ] **Campanhas de marketing** via WhatsApp

#### Performance & Escalabilidade

- [ ] **CDN** para assets estáticos
- [ ] **Lazy loading** de componentes pesados
- [ ] **Code splitting** no frontend
- [ ] **Otimização de imagens** (compressão, WebP)
- [ ] **Database sharding** (se necessário)
- [ ] **Load balancing** (se múltiplos servidores)

#### Monitoramento & Observabilidade

- [ ] **APM** (Application Performance Monitoring)
- [ ] **Error tracking** (Sentry, Rollbar)
- [ ] **Log aggregation** (ELK Stack, Loki)
- [ ] **Dashboards** de métricas de negócio
- [ ] **Alertas inteligentes** baseados em padrões

---

## 📊 PRIORIZAÇÃO PARA PRODUÇÃO

### Fase 1: Segurança e Estabilidade (1-2 semanas)

- [ ] Configurar HTTPS com Let's Encrypt (certificado SSL válido)
- [x] Implementar rate limiting
- [x] Adicionar headers de segurança
- [x] Configurar firewall (UFW)
- [ ] Configurar Fail2ban
- [ ] Implementar logging estruturado
- [ ] Configurar backup automático
- [ ] Alterar senha padrão do admin
- [ ] Adicionar validação de input robusta (schema + sanitização)
- [ ] Implementar tratamento de erros completo
- [ ] Configurar monitoramento básico

### Fase 2: Correções Críticas (1 semana)

- [x] Corrigir WebSocket (limite de tentativas, backoff)
- [ ] Corrigir busca de mensagens da API (histórico completo / bursts)
- [ ] Melhorar processamento de mensagens (fallbacks e consistência)
- [ ] Adicionar testes básicos

### Fase 3: Funcionalidades Pendentes (2-3 semanas)

- [ ] Exibir nome e setor nas mensagens
- [x] Mensagem automática de seleção de setores
- [x] Corrigir chatbot (marcação de mensagens enviadas)
- [ ] Ajustar relatórios
- [x] Reformular aba Conexão

### Fase 4: Melhorias e Otimizações (contínuo)

- [ ] CI/CD pipeline
- [ ] Testes automatizados
- [ ] Monitoramento avançado
- [ ] Otimizações de performance

---

## 🔧 CHECKLIST PRÉ-DEPLOY

Antes de colocar em produção, verificar:

### Configuração

- [ ] `.env` configurado com valores de produção
- [ ] `JWT_SECRET` alterado para valor seguro e aleatório
- [ ] `CORS_ORIGIN` configurado apenas com domínio de produção
- [ ] Senha do banco de dados alterada
- [ ] Senha do usuário admin alterada
- [ ] Portas do firewall configuradas corretamente

### Infraestrutura

- [ ] PostgreSQL rodando e acessível
- [ ] Backend rodando com PM2
- [ ] Frontend buildado (`npm run build`)
- [ ] Nginx configurado e testado
- [ ] SSL/HTTPS funcionando
- [ ] DNS apontando corretamente

### Segurança

- [ ] Firewall ativo (UFW)
- [ ] Fail2ban configurado
- [ ] SSH com autenticação por chave
- [ ] Rate limiting ativo
- [ ] Headers de segurança configurados
- [ ] Backup automático configurado

### Testes

- [ ] Login funciona
- [ ] Criação de usuário funciona
- [ ] Salvamento de dados funciona
- [ ] Carregamento de dados funciona
- [ ] Chat funciona (envio/recebimento)
- [ ] WebSocket conecta corretamente
- [ ] Health check responde
- [ ] **Chatbot funciona corretamente:**
  - [ ] Chatbot está habilitado nas configurações
  - [ ] Mensagem de saudação configurada
  - [ ] Mensagem de ausência configurada
  - [ ] Horários de funcionamento configurados
  - [ ] Teste: Enviar primeira mensagem de número novo → Bot envia saudação (dentro do horário)
  - [ ] Teste: Enviar primeira mensagem fora do horário → Bot envia mensagem de ausência
  - [ ] Teste: Verificar que bot não reenvia mensagem (verificar mensagem de sistema no chat)
  - [ ] Teste: Verificar logs do console para confirmar envio (`[Chatbot] ✅ Mensagem enviada`)

### Monitoramento

- [ ] Logs sendo gerados
- [ ] Health check configurado
- [ ] Alertas configurados (se aplicável)
- [ ] Backup testado e restaurado

---

## 📝 NOTAS IMPORTANTES

### Riscos Conhecidos

1. ~~**WebSocket instável**: Pode causar perda de mensagens em tempo real~~ ✅ CORRIGIDO: Socket.IO com fallback para polling
2. **Chats sem mensagens**: Usuários podem ver conversas vazias
3. ~~**Chatbot não funcional**: Automação não está operacional~~ ✅ CORRIGIDO - Agora marca mensagens como enviadas
4. **Mensagens faltando na UI (Evolution 2.3.4)**: bursts podem não refletir 100% na interface, apesar de existir no Evolution
5. **Sem testes automatizados**: Mudanças podem quebrar funcionalidades existentes
6. **Relatórios incompletos**: Avaliações não são contabilizadas

### Dependências Externas

- **Evolution API**: Deve estar rodando e acessível na porta 8080
- **Google Gemini API**: Requer chave de API válida
- **Google People API**: Requer autenticação OAuth configurada
- **PostgreSQL**: Deve estar rodando e acessível

### Limitações Atuais

- Sem suporte a multi-tenancy
- Sem API pública documentada
- Sem sistema de webhooks
- Sem CI/CD automatizado
- Sem monitoramento avançado
- Sem testes automatizados

---

## 🎯 CONCLUSÃO

**Status Atual:** ⚠️ **NÃO PRONTO PARA PRODUÇÃO**

O projeto está funcionalmente completo para uso interno/desenvolvimento, mas **requer melhorias críticas de segurança, estabilidade e testes** antes de ser colocado em produção com usuários reais.

**Estimativa para produção:** 3-4 semanas de trabalho focado nas fases 1 e 2.

**Recomendação:** Implementar pelo menos as **Fases 1 e 2** antes de colocar em produção. As **Fases 3 e 4** podem ser feitas incrementalmente após o lançamento.

---

**Última atualização:** 2025-01-XX  
**Próxima revisão:** Após implementação das Fases 1 e 2

