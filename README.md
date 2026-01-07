
# ⚡ Zentria Manager v1.3.0

**Plataforma Enterprise de Gestão de Atendimento para WhatsApp**

O **Zentria Manager** é uma solução completa para centralizar, organizar e escalar o atendimento via WhatsApp da sua empresa. Desenvolvido para transformar o WhatsApp em uma ferramenta de ticket profissional, ele elimina a desorganização de múltiplos celulares e centraliza tudo em um único painel multi-agente.

---

## 🚀 Funcionalidades Principais

### 🗣️ Gestão de Atendimento
*   **Multi-Agente:** Vários atendentes utilizando o mesmo número de WhatsApp simultaneamente.
*   **Departamentalização:** Separe os atendimentos por setores (Comercial, Suporte, Financeiro).
*   **Transferência Inteligente:** Transfira chats entre agentes ou departamentos com histórico completo.
*   **Inbox Zero:** Organização automática de chats (Abas: A Fazer, Aguardando, Finalizados).

### 🤖 Inteligência e Automação
*   **IA Gemini (Google):** Sugestão de respostas inteligentes baseadas no contexto da conversa com um clique.
*   **Chatbot & Horários:** Defina horários de funcionamento e mensagens automáticas de ausência/saudação.
*   **Fluxos de Trabalho (SOP):** Crie checklists padronizados (ex: "Protocolo de Venda") para guiar os operadores passo-a-passo.

### 🛠️ Ferramentas de Produtividade
*   **Google Contacts Sync:** Sincronização bidirecional de contatos com sua conta Google.
*   **Respostas Rápidas:** Biblioteca de mensagens pré-definidas (atalhos).
*   **Multimídia Completa:** Envio de Áudio (gravador nativo), Imagens, Vídeos, Documentos e Stickers.
*   **Tags e Etiquetas:** Classifique clientes visualmente (VIP, Inadimplente, Novo Lead).

### 📊 Gestão e Dados
*   **Dashboard de Relatórios:** Métricas de volume, tempo médio de atendimento e SLA.
*   **Pesquisa de Satisfação (CSAT):** Envio automático de pesquisa ao finalizar atendimento.
*   **Exportação CSV:** Download de todos os dados de atendimento para BI externo.

---

## 🏗️ Arquitetura do Sistema

O sistema utiliza uma arquitetura moderna baseada em microsserviços containerizados, garantindo estabilidade e escalabilidade.

```mermaid
graph TD
    User[Cliente/Navegador] -->|HTTPS/WSS| Nginx[Proxy Reverso Nginx]
    Nginx -->|Porta 5173| Frontend[Zentria React App]
    Nginx -->|Porta 8080| Backend[Evolution API latest]
    
    subgraph "Docker Containers"
        Backend -->|Persistência| Postgres[PostgreSQL DB]
        Backend -->|Cache/Filas| Redis[Redis Cache]
        Backend -->|Sessão| Chrome[Chrome Headless]
    end
    
    Backend -->|Protocolo| WA[WhatsApp Servers]
    Frontend -->|API| Gemini[Google Gemini AI]
    Frontend -->|API| GPeople[Google People API]
```

### Stack Tecnológica
*   **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 3 (PostCSS), Socket.IO Client 4, Lucide Icons.
*   **Backend (Core):** Evolution API latest (Node.js/Baileys).
*   **Backend API:** Node.js/Express, PostgreSQL, JWT Authentication.
*   **Infraestrutura:** Docker, Docker Compose, PM2, Nginx.
*   **Banco de Dados:** PostgreSQL 15, Redis.
*   **Tempo Real:** Socket.IO (WebSocket com fallback para polling HTTP).

---

## 📚 Manuais de Implantação

### 🚀 Instalação Completa (Recomendado)
**📄 [INSTALACAO_COMPLETA.md](./INSTALACAO_COMPLETA.md)** - Guia completo com TODAS as funcionalidades implementadas

Este é o guia mais completo e atualizado, incluindo:
- ✅ Instalação passo a passo do backend (PostgreSQL + API)
- ✅ Instalação do frontend
- ✅ Configuração do Evolution API
- ✅ Todas as migrações do banco de dados
- ✅ Configurações avançadas (Gemini AI, Chatbot, etc.)
- ✅ Troubleshooting completo
- ✅ Checklist de instalação

### 📋 Outros Manuais Disponíveis

**Instalação Automática:**
- **[install/autoinstall.txt](./install/autoinstall.txt)** - Script automático para instalação rápida

**Instalação Manual:**
- **[install/manual_instalacao_completo.txt](./install/manual_instalacao_completo.txt)** - Instalação manual detalhada

**Backend:**
- **[INSTALACAO_BACKEND.md](./INSTALACAO_BACKEND.md)** - Guia específico do backend
- **[backend/README.md](./backend/README.md)** - Documentação da API

**Deploy:**
- **[install/deploy.txt](./install/deploy.txt)** - Deploy em produção com domínio e HTTPS
- **[install/deploy_hostgator.txt](./install/deploy_hostgator.txt)** - Deploy específico para HostGator
- **[docs/HTTPS_POR_IP_AUTOCONFIG.md](./docs/HTTPS_POR_IP_AUTOCONFIG.md)** - HTTPS mesmo acessando por IP (sem domínio) + autoconfig

**Segurança:**
- **[install/security_hostgator.txt](./install/security_hostgator.txt)** - Segurança avançada

---

## 🛠️ Scripts de Automação e Correção

Os scripts abaixo podem ser executados diretamente ou criados no servidor a partir dos arquivos .txt. Consulte o **[install/manual_instalacao_completo.txt](./install/manual_instalacao_completo.txt)** para instruções detalhadas.

### Scripts Shell (.sh)
*   **[scripts/upgrade_evolution.sh](./scripts/upgrade_evolution.sh)**: Atualiza Evolution API para a versão mais recente.
*   **[scripts/factory_reset_complete.sh](./scripts/factory_reset_complete.sh)**: **Cuidado!** Apaga tudo e reinicia a instalação (Factory Reset completo).
*   **[scripts/migrate_zapflow_to_zentria.sh](./scripts/migrate_zapflow_to_zentria.sh)**: Migração de instalações antigas (ZapFlow → Zentria).
*   **[scripts/setup_backend.sh](./scripts/setup_backend.sh)**: Instala e configura o backend PostgreSQL automaticamente (Linux/macOS).
*   **[scripts/setup_backend.ps1](./scripts/setup_backend.ps1)**: Instala e configura o backend PostgreSQL automaticamente (Windows).
*   **[scripts/migrate_zapflow_to_zentria.ps1](./scripts/migrate_zapflow_to_zentria.ps1)**: Migração de instalações antigas (ZapFlow → Zentria) no Windows.

### Scripts de Instalação (.txt - criar como .sh no servidor)
*   **[install/setup_evolution.txt](./install/setup_evolution.txt)**: Instala Docker, Banco de Dados e API do zero.
*   **[install/factory_reset.txt](./install/factory_reset.txt)**: **Cuidado!** Apaga tudo e reinicia a instalação (Factory Reset).
*   **[install/debug.txt](./install/debug.txt)**: Diagnóstico de rede e conexão.
*   **[install/fix_evolution_network.txt](./install/fix_evolution_network.txt)**: Corrige problemas de firewall do Docker (Erro de QR Code não gerado).

---

## 💾 Persistência de Dados

O Zentria agora suporta persistência segura de dados usando PostgreSQL:

### Backend API (Recomendado)

O sistema inclui um backend completo com:
- **PostgreSQL** para armazenamento seguro
- **Autenticação JWT** para segurança
- **API REST** para salvar/carregar dados
- **Sistema híbrido**: Usa API quando disponível, localStorage como fallback

#### Instalação Rápida do Backend

**Linux/macOS:**
```bash
./scripts/setup_backend.sh
```

**Windows:**
```powershell
.\scripts\setup_backend.ps1
```

Para instruções detalhadas, consulte:
- **[INSTALACAO_BACKEND.md](./INSTALACAO_BACKEND.md)** - Guia completo
- **[backend/README.md](./backend/README.md)** - Documentação da API

### Dados Persistidos

Com o backend configurado, os seguintes dados são salvos no PostgreSQL:
- ✅ Configurações da API
- ✅ Chats e mensagens
- ✅ Contatos
- ✅ Usuários
- ✅ Departamentos
- ✅ Respostas rápidas
- ✅ Workflows
- ✅ Configuração do chatbot
- ✅ Preferências de UI

**Sem backend:** Os dados são salvos no localStorage do navegador (específico por navegador).

---

## 📞 Suporte e Créditos

## 🔄 Atualizações Recentes (v1.3.0+)

### ✨ Novidades Principais
- ✅ **Atribuição Automática de Chats:** Chats são atribuídos automaticamente ao operador do departamento
- ✅ **Sistema de Notificações:** Notificações para operadores e administradores
- ✅ **Persistência Completa:** Todos os dados salvos no PostgreSQL (chats, usuários, departamentos, etc.)
- ✅ **Validação de Números:** Apenas números válidos (11+ dígitos) são processados
- ✅ **Status Persistente:** Status de chats mantido após reload da página
- ✅ **Socket.IO Client:** Mensagens em tempo real com reconexão automática
- ✅ **Google Gemini AI:** Integração completa para respostas inteligentes
- ✅ **Chatbot Avançado:** Mensagens automáticas de saudação/ausência com horários
- ✅ **CRUD Completo:** Departamentos, Contatos, Respostas Rápidas, Workflows, Usuários

### 🔧 Melhorias Técnicas
- **PostgreSQL:** Persistência completa de dados (sem dependência de localStorage)
- **Atribuição de Departamentos:** Usuários podem ser atribuídos a departamentos específicos
- **Distribuição de Chats:** Chats são atribuídos ao operador específico do departamento
- **Notificações:** Sistema completo de notificações do navegador
- **Validação:** Validação rigorosa de números de telefone e dados
- **Segurança:** Criptografia de dados sensíveis, JWT, Rate Limiting
- **Performance:** Otimizações de build, CSS minificado, logs filtrados
- **Migrações:** Scripts de migração para atualizar bancos existentes

### 📋 Funcionalidades Implementadas

#### Sistema de Atendimento
- Multi-agente com departamentalização
- Atribuição automática ao operador do departamento
- Transferência entre agentes e departamentos
- Inbox Zero (A Fazer, Aguardando, Finalizados)
- Status persistente no banco de dados

#### Inteligência Artificial
- Google Gemini AI para sugestões inteligentes
- Chatbot com horários de funcionamento
- Mensagens automáticas de saudação/ausência

#### Gestão de Dados
- Persistência PostgreSQL completa
- CRUD para todas as entidades
- Validação de números (11+ dígitos)
- Limpeza automática de chats inválidos

#### Notificações
- Notificações do navegador (som + visual)
- Notificação quando chat é atribuído
- Administradores recebem notificação de todos os departamentos

#### Tempo Real
- Socket.IO Client com reconexão automática
- Fallback para HTTP polling se WebSocket falhar
- Mensagens em tempo real sem delay

---

**Desenvolvido por:** Andrey Gheno Piekas  
**Versão Atual:** 1.3.0 (Stable)  
**Licença:** Proprietária
