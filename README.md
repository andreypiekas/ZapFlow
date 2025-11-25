# ZapFlow Manager ⚡

Plataforma profissional de gestão de atendimento via WhatsApp, com suporte a múltiplos departamentos, sistema de tickets (Kanban/Lista), respostas rápidas, fluxos de trabalho (SOP) e Inteligência Artificial (Google Gemini) para sugestão de respostas.

---

## 📋 Pré-requisitos

Para rodar este projeto, você precisará ter instalado em sua máquina:

1.  **Node.js** (Versão 18 ou superior) - O ambiente de execução.
2.  **Git** - Para baixar o código.
3.  **Evolution API** (Opcional para testes, Obrigatório para produção) - Gateway para conexão com WhatsApp.

---

## 🪟 Instalação no Windows

### Passo 1: Downloads Necessários
1.  **Node.js**: [Baixe aqui (Versão LTS)](https://nodejs.org/en/download/)
2.  **Git**: [Baixe aqui](https://git-scm.com/download/win)
3.  **VS Code** (Recomendado para editar código): [Baixe aqui](https://code.visualstudio.com/)

### Passo 2: Instalação
1.  Instale o Node.js e o Git seguindo o assistente de instalação (Next, Next, Finish).
2.  Abra o **PowerShell** ou **CMD** do Windows.

### Passo 3: Rodando o Projeto
Digite os seguintes comandos no terminal, um por um:

```powershell
# 1. Clone o repositório (ou baixe o ZIP e extraia)
git clone https://github.com/seu-usuario/zapflow-manager.git

# 2. Entre na pasta do projeto
cd zapflow-manager

# 3. Instale as dependências do projeto
npm install

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

O sistema estará acessível em: `http://localhost:5173`

---

## 🐧 Instalação no Linux (Ubuntu/Debian)

### Passo 1: Instalar Dependências
Abra o terminal e execute:

```bash
# Atualiza os pacotes
sudo apt update

# Instala Git e Curl
sudo apt install git curl -y

# Instala o Node.js (via NVM ou NodeSource recomendados, mas aqui via apt direto para simplificar)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### Passo 2: Rodando o Projeto

```bash
# 1. Clone o projeto
git clone https://github.com/seu-usuario/zapflow-manager.git

# 2. Entre na pasta
cd zapflow-manager

# 3. Instale as bibliotecas
npm install

# 4. Rode a aplicação
npm run dev
```

---

## ⚙️ Configuração do WhatsApp (Evolution API)

Para que o sistema envie mensagens reais e gere o QR Code, você precisa conectar a uma instância da **Evolution API**.

1.  **Instalação da API:** Recomendamos instalar a Evolution API em um servidor VPS (Hostgator, DigitalOcean, etc) usando Docker.
    *   [Documentação Oficial da Evolution API](https://doc.evolution-api.com/v2/kB/Installation/docker)
2.  **No ZapFlow:**
    *   Acesse o menu **Configurações**.
    *   Desmarque a opção "Modo Demonstração".
    *   Insira a **URL da API** (ex: `https://api.seudominio.com`)
    *   Insira a **Global API Key** (definida na instalação da Evolution).
    *   Defina um nome para a instância (ex: `atendimento01`).
    *   Salve e vá para o menu **Conexões** para ler o QR Code.

---

## 🧠 Configuração da Inteligência Artificial (Google Gemini)

O sistema utiliza a IA do Google para sugerir respostas.

1.  Obtenha sua chave gratuitamente em: [Google AI Studio](https://aistudio.google.com/app/apikey)
2.  Crie um arquivo `.env` na raiz do projeto (copie do `.env.example` se existir).
3.  Adicione sua chave:

```env
VITE_API_KEY=sua_chave_gemini_aqui
```

---

## 🛠️ Comandos Úteis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Roda o projeto localmente para testes |
| `npm run build` | Gera os arquivos otimizados para colocar em hospedagem (cPanel/Vercel) |
| `npm run preview` | Visualiza a versão de produção localmente |

---

**Desenvolvido por Andrey Gheno Piekas**
