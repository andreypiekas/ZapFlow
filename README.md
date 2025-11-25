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

## 📋 Pré-requisitos Gerais

Para rodar o sistema, você precisará de:

1.  **Node.js** (v18+) instalado.
2.  Uma instância da **Evolution API** rodando (Gateway de WhatsApp).
3.  Uma conta no **Google Cloud Platform** (para sincronização de contatos - opcional).
4.  Uma chave de API do **Google AI Studio** (para sugestões de IA - opcional).

---

## 🚀 Guia de Instalação (Local)

### 1. Clonar o Repositório

```bash
git clone https://github.com/andreypiekas/ZapFlow.git
cd ZapFlow
```

### 2. Instalação por Sistema Operacional

#### 🐧 Ubuntu / Linux (Debian-based)

1.  **Atualize o sistema e instale dependências básicas:**
    ```bash
    sudo apt update && sudo apt install -y curl git
    ```

2.  **Instale o Node.js (versão 18.x):**
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    ```

3.  **Instale as dependências do projeto:**
    ```bash
    npm install
    ```

4.  **Configure o ambiente:**
    Crie o arquivo `.env` na raiz do projeto:
    ```bash
    echo "VITE_API_KEY=sua_chave_gemini_aqui" > .env
    ```

5.  **Execute o projeto:**
    ```bash
    npm run dev
    ```

#### 🪟 Windows

1.  **Instale o Node.js:**
    *   Baixe e instale a versão LTS do site oficial: [https://nodejs.org/](https://nodejs.org/).
    *   Durante a instalação, certifique-se de marcar a opção para adicionar ao PATH.

2.  **Instale o Git (Opcional, se não tiver):**
    *   Baixe em: [https://git-scm.com/download/win](https://git-scm.com/download/win).

3.  **Abra o terminal (PowerShell ou CMD):**
    *   Navegue até a pasta onde clonou o projeto.

4.  **Instale as dependências:**
    ```powershell
    npm install
    ```

5.  **Configure o ambiente:**
    *   Crie um arquivo chamado `.env` na raiz do projeto.
    *   Adicione sua chave de IA: `VITE_API_KEY=sua_chave_gemini_aqui`

6.  **Execute o projeto:**
    ```powershell
    npm run dev
    ```
    *   O navegador abrirá automaticamente em `http://localhost:5173`.

---

## 🐳 Implantação em Servidor (VPS Produção)

Para colocar o sistema no ar de forma profissional, utilize Docker para o backend (WhatsApp) e Nginx/Serve para o frontend.

### Passo 1: Subir a Evolution API (Backend WhatsApp)

No seu servidor Ubuntu/Linux com Docker instalado:

Crie um arquivo `docker-compose.yml`:

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

No diretório do ZapFlow:

```bash
# Gere os arquivos estáticos otimizados
npm run build
```

Isso criará a pasta `dist`. Você pode servir essa pasta usando um servidor web simples:

```bash
# Instale o servidor estático globalmente
sudo npm install -g serve

# Rode o site na porta 3000 (em background use pm2 ou nohup)
serve -s dist -l 3000
```

---

## ⚙️ Configurações Pós-Instalação

Após acessar o sistema pela primeira vez (Login padrão: `admin@hostgator.com` / `123`):

1.  Vá em **Configurações**.
2.  Desmarque "Modo Demonstração".
3.  Preencha os dados da API:
    *   **URL:** `http://seu-ip-servidor:8080`
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