# ZapFlow Manager ⚡ v1.2.0

**Plataforma Profissional de Gestão de Atendimento para WhatsApp**

O **ZapFlow Manager** é um sistema completo para centralizar, organizar e automatizar o atendimento via WhatsApp da sua empresa. Ele transforma um único número de WhatsApp em uma central de atendimento multi-departamento, com suporte a múltiplos atendentes, inteligência artificial, fluxos de trabalho e métricas detalhadas.

---

## 🚀 Funcionalidades Principais

### 💬 Gestão de Atendimento (Chat)
*   **Multi-Atendentes:** Vários operadores utilizando o mesmo número.
*   **Inbox Zero:** Organização inteligente com abas "A Fazer", "Aguardando" e "Finalizados".
*   **Mídia Completa:** Envio e recebimento de Áudio (gravador nativo), Imagens, Vídeos e Arquivos.
*   **Stickers e Emojis:** Suporte nativo a figurinhas e seletor de emojis.
*   **Tags:** Categorização de clientes (ex: VIP, Inadimplente, Novo Lead).
*   **Busca Avançada:** Pesquise mensagens dentro da conversa.
*   **Transferência:** Encaminhe chats entre departamentos com histórico completo.

### 🤖 Automação e IA
*   **Chatbot Integrado:** Mensagens automáticas de saudação e ausência baseadas em horário de funcionamento.
*   **Sugestão de Respostas (IA):** Integração com **Google Gemini** para sugerir respostas inteligentes baseadas no histórico da conversa.
*   **Fluxos de Trabalho (SOPs):** Crie checklists padronizados (ex: "Protocolo de Venda", "Triagem") para guiar a equipe.

### 👥 Gestão de Contatos
*   **Sincronização Google:** Importe contatos da sua conta Google (Google People API) automaticamente.
*   **Identificação:** Atualiza o nome e foto dos chats com base na sua agenda.

### 📊 Gestão e Relatórios
*   **Dashboard Administrativo:** Visão geral de atendimentos ativos e filas.
*   **Relatórios Detalhados:** Métricas de SLA, CSAT (Satisfação), Volume por Departamento.
*   **Exportação CSV:** Baixe os dados para análise externa.
*   **Departamentos e Usuários:** Controle de acesso (Admin/Agente) e setores (Financeiro, Suporte, etc).

---

## 🛠️ Stack Tecnológico

*   **Frontend:** React 18, TypeScript, Vite.
*   **Estilização:** Tailwind CSS.
*   **Ícones:** Lucide React.
*   **Conexão WhatsApp:** Integração via API REST (Compatível com **Evolution API**).
*   **IA:** Google Generative AI SDK (Gemini).
*   **Auth:** Google Identity Services (OAuth 2.0).

---

## 📋 Pré-requisitos de Instalação

Para rodar o sistema em produção, você precisará de:

1.  **Node.js** (v18+) instalado.
2.  Uma instância da **Evolution API** rodando (Gateway de WhatsApp).
3.  Uma conta no **Google Cloud Platform** (para sincronização de contatos - opcional).
4.  Uma chave de API do **Google AI Studio** (para sugestões de IA - opcional).

---

## 🚀 Guia de Instalação (Passo a Passo)

### 1. Clonar e Instalar Dependências

```bash
git clone https://github.com/seu-usuario/zapflow-manager.git
cd zapflow-manager
npm install
```

### 2. Configurar Variáveis de Ambiente (IA)

Crie um arquivo `.env` na raiz do projeto para a IA do Google:

```env
VITE_API_KEY=sua_chave_gemini_aqui
```
*Obtenha a chave em: [aistudio.google.com](https://aistudio.google.com/)*

### 3. Rodar Localmente (Desenvolvimento)

```bash
npm run dev
```
Acesse `http://localhost:5173`.

---

## 🐳 Implantação em Servidor (VPS/Docker)

Para colocar o sistema no ar de forma profissional, recomendamos usar Docker para a API do WhatsApp e servir o Frontend estático.

### Passo 1: Subir a Evolution API (Backend WhatsApp)

Crie um arquivo `docker-compose.yml` no seu servidor:

```yaml
version: '3.3'
services:
  evolution-api:
    image: attias/evolution-api:v2.1.1
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_PORT=8080
      - AUTHENTICATION_API_KEY=sua_senha_secreta_api
      - DEL_INSTANCE=false
    volumes:
      - evolution_instances:/evolution/instances

volumes:
  evolution_instances:
```

Execute: `docker compose up -d`

### Passo 2: Build do Frontend

Gere os arquivos otimizados para produção:

```bash
npm run build
```

Isso criará a pasta `dist`. Você pode servir essa pasta usando Nginx, Apache ou um servidor Node simples como o `serve`:

```bash
npm install -g serve
serve -s dist -l 3000
```

---

## ⚙️ Configurações Pós-Instalação

Após acessar o sistema pela primeira vez (Login padrão: `admin@hostgator.com` / `123`):

1.  Vá em **Configurações**.
2.  Desmarque "Modo Demonstração".
3.  Preencha os dados da API:
    *   **URL:** `http://seu-servidor:8080`
    *   **API Key:** `sua_senha_secreta_api`
    *   **Instância:** Escolha um nome (ex: `atendimento01`).
4.  (Opcional) Preencha o **Google Client ID** para sincronizar contatos.
5.  Salve e vá para a tela **Conexões** para ler o QR Code com seu celular.

---

## ☁️ Como Configurar o Google Contacts (Sync)

Para que o botão "Sincronizar Google" funcione:

1.  Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2.  Crie um projeto e ative a **"People API"**.
3.  Vá em **Credenciais** > **Criar Credenciais** > **ID do Cliente OAuth**.
4.  Tipo de Aplicativo: **Aplicação Web**.
5.  Em "Origens JavaScript autorizadas", adicione a URL do seu sistema (ex: `http://localhost:5173` ou `https://seu-dominio.com`).
6.  Copie o **ID do Cliente** gerado e cole na tela de **Configurações** do ZapFlow.

---

## 📞 Suporte

Desenvolvido por **Andrey Gheno Piekas**.
Versão Atual: 1.2.0