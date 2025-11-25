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

## ⚡ Instalação Automática (Ubuntu 20.04/22.04+)

Se você possui um servidor VPS (Hostgator, DigitalOcean, AWS) com Ubuntu, use este método para instalar tudo (Frontend + Backend + Banco) de uma vez.

1.  **Baixe o repositório:**
    ```bash
    git clone https://github.com/andreypiekas/ZapFlow.git
    cd ZapFlow
    ```

2.  **Dê permissão e execute o instalador:**
    ```bash
    chmod +x install.sh
    sudo ./install.sh
    ```

3.  **Siga as instruções na tela.**
    O script irá instalar Node.js, Docker, configurar a API e colocar o site no ar. Ao final, ele exibirá o IP e a Senha da API.

---

## 🚀 Guia de Instalação Manual (Local / Windows)

### 1. Clonar o Repositório

```bash
git clone https://github.com/andreypiekas/ZapFlow.git
cd ZapFlow
```

### 2. Instalação por Sistema Operacional

#### 🐧 Ubuntu / Linux (Manual)

1.  **Atualize o sistema e instale dependências básicas:**
    ```bash
    sudo apt update && sudo apt install -y curl git
    ```

2.  **Instale o Node.js (Versão 20 LTS):**
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    ```

3.  **Instale as dependências do projeto:**
    ```bash
    npm install
    ```

4.  **Execute o projeto:**
    ```bash
    npm run dev
    ```

#### 🪟 Windows

1.  **Instale o Node.js:**
    *   Baixe e instale a versão **LTS (v20+)** do site oficial: [https://nodejs.org/](https://nodejs.org/).
    
2.  **Instale o Git (Opcional):**
    *   Baixe em: [https://git-scm.com/download/win](https://git-scm.com/download/win).

3.  **Abra o terminal (PowerShell ou CMD):**
    *   Navegue até a pasta onde clonou o projeto.

4.  **Instale as dependências:**
    ```powershell
    npm install
    ```

5.  **Execute o projeto:**
    ```powershell
    npm run dev
    ```
    *   O navegador abrirá automaticamente em `http://localhost:5173`.

---

## ⚙️ Configurações Pós-Instalação

Após acessar o sistema pela primeira vez (Login padrão: `admin@hostgator.com` / `123`):

1.  Vá em **Configurações**.
2.  Desmarque "Modo Demonstração".
3.  Preencha os dados da API (Se usou o script automático, verifique o output do terminal):
    *   **URL:** `http://seu-ip-servidor:8080`
    *   **API Key:** (A senha que você definiu na instalação)
    *   **Instância:** Escolha um nome (ex: `atendimento01`).
4.  (Opcional) Preencha o **Google Client ID** para sincronizar contatos.
5.  Salve e vá para a tela **Conexões** para ler o QR Code com seu celular.

---

## 📞 Suporte

Desenvolvido por **Andrey Gheno Piekas**.
Versão Atual: 1.2.0