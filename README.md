# ZapFlow Manager ⚡

Plataforma profissional de gestão de atendimento via WhatsApp, com suporte a múltiplos departamentos, sistema de tickets (Kanban/Lista), respostas rápidas, fluxos de trabalho (SOP) e Inteligência Artificial (Google Gemini) para sugestão de respostas.

---

## 📋 Pré-requisitos

Para rodar este projeto, você precisará ter instalado em sua máquina:

1.  **Node.js** (Versão 18 ou superior) - O ambiente de execução.
2.  **Git** - Para baixar o código.
3.  **Evolution API** (Necessário para a conexão real com WhatsApp).

---

## 🪟 Instalação Básica (Desenvolvimento)

### Windows

1.  **Baixe as ferramentas:**
    *   Node.js LTS: [nodejs.org](https://nodejs.org/)
    *   Git: [git-scm.com](https://git-scm.com/)

2.  **No PowerShell, execute:**

```powershell
# 1. Clone o repositório
git clone https://github.com/seu-usuario/zapflow-manager.git
cd zapflow-manager

# 2. Instale as dependências
npm install

# 3. Inicie o servidor local
npm run dev
```
O sistema abrirá em `http://localhost:5173`.

---

### Linux (Ubuntu/Debian)

```bash
# 1. Instalar Node.js e Git
sudo apt update
sudo apt install git curl -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Clonar e Rodar
git clone https://github.com/seu-usuario/zapflow-manager.git
cd zapflow-manager
npm install
npm run dev
```

---

## 🏢 Implantação Completa em VM / Servidor Local (Full Stack)

Se você deseja rodar tudo (Sistema + API do WhatsApp) dentro de uma Máquina Virtual (VM) ou servidor local, siga este guia. Recomendamos usar **Docker** para a API.

### 1. Preparar a VM (Ubuntu 20.04/22.04)

```bash
# Atualizar sistema e instalar Docker
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Instalar Docker Compose
sudo apt install docker-compose-plugin -y
```

### 2. Subir a API do WhatsApp (Evolution API)

Crie uma pasta para a API e um arquivo `docker-compose.yml`:

```bash
mkdir evolution-api && cd evolution-api
nano docker-compose.yml
```

**Cole o conteúdo abaixo no arquivo:**

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
      - AUTHENTICATION_API_KEY=sua_senha_segura_aqui
      - DEL_INSTANCE=false
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store

volumes:
  evolution_instances:
  evolution_store:
```

**Inicie a API:**
```bash
sudo docker compose up -d
```
*Sua API estará rodando em: `http://SEU_IP_DA_VM:8080`*
*Sua chave (API Key) será: `sua_senha_segura_aqui`*

### 3. Subir o ZapFlow Manager (Frontend)

Volte para a raiz e clone o projeto do painel:

```bash
cd ~
git clone https://github.com/seu-usuario/zapflow-manager.git
cd zapflow-manager
npm install
```

**Gerar Build de Produção (Otimizado):**
Não use `npm run dev` em produção. Gere os arquivos estáticos:

```bash
npm run build
```

**Servir a Aplicação:**
Vamos usar um servidor leve para rodar o site na porta 3000 (ou 80).

```bash
# Instala o servidor estático globalmente
sudo npm install -g serve

# Roda o projeto em background (usando nohup ou PM2)
# Opção simples com serve na porta 3000:
nohup serve -s dist -l 3000 &
```

### 4. Conectar o Sistema

1. Acesse `http://SEU_IP_DA_VM:3000` no navegador.
2. Faça login (Admin / 123).
3. Vá em **Configurações**.
4. Desmarque "Modo Demonstração".
5. Preencha:
   * **URL:** `http://SEU_IP_DA_VM:8080`
   * **API Key:** `sua_senha_segura_aqui`
   * **Instância:** `atendimento01`
6. Salve e vá em **Conexões** para ler o QR Code.

---

## 🧠 Configuração da Inteligência Artificial (Google Gemini)

O sistema utiliza a IA do Google para sugerir respostas. Esta configuração é feita no código antes do build ou via variáveis de ambiente.

1.  Obtenha sua chave gratuitamente em: [Google AI Studio](https://aistudio.google.com/app/apikey)
2.  Crie um arquivo `.env` na raiz do projeto:

```env
VITE_API_KEY=sua_chave_gemini_aqui
```

---

## 🛠️ Comandos Úteis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Roda o projeto localmente para testes |
| `npm run build` | Gera a pasta `dist` otimizada para produção |
| `sudo docker compose up -d` | Sobe a API do WhatsApp em background |
| `sudo docker compose logs -f` | Vê os logs da API do WhatsApp |

---

**Desenvolvido por Andrey Gheno Piekas**