
# ZapFlow Manager ⚡ v1.2.0 (Produção)

**Plataforma Profissional de Gestão de Atendimento para WhatsApp**

O **ZapFlow Manager** centraliza, organiza e automatiza o atendimento via WhatsApp. Com suporte a múltiplos atendentes, IA (Gemini), fluxos de trabalho (SOP), métricas detalhadas e sincronização de contatos Google. Compatível com **Evolution API v2.2.3**.

---

## 📋 Pré-requisitos

*   **Servidor:** Ubuntu 20.04 ou 22.04 LTS.
*   **Hardware Mínimo:** 2GB RAM (4GB Recomendado) / 2 vCPU.
*   **Dependências:** Node.js v20+, Docker, Docker Compose.

---

## 🚀 Instalação Rápida (Scripts Automatizados)

Para facilitar a implantação, incluímos scripts que configuram todo o ambiente backend automaticamente.

### 1. Backend (Evolution API)

1.  **Prepare o script de instalação:**
    Copie o conteúdo do arquivo `setup_evolution.txt` para um arquivo `setup.sh` no servidor e dê permissão de execução:
    ```bash
    cp setup_evolution.txt setup.sh && chmod +x setup.sh
    ```

2.  **Execute a instalação:**
    ```bash
    ./setup.sh
    ```
    *Este script irá instalar o Docker (se necessário), criar o `docker-compose.yml` com seu IP real, configurar o Postgres/Redis e iniciar a API na porta 8080.*

### 2. Frontend (ZapFlow Web)

1.  **Instale as dependências e faça o Build:**
    ```bash
    npm install
    npm run build
    ```

2.  **Coloque em produção (PM2):**
    ```bash
    sudo npm install -g pm2 serve
    pm2 start "serve -s dist -l 5173" --name zapflow-front
    pm2 save
    pm2 startup
    ```

Acesse: `http://SEU_IP_SERVIDOR:5173`

---

## 🌐 Colocando em Produção (VPS / HostGator)

Para configurar um domínio profissional (ex: `app.suaempresa.com.br`), ativar SSL e proteger seu servidor:

*   📄 **[deploy.txt](./deploy.txt)** - Guia Genérico para VPS (DigitalOcean, AWS, etc).
*   📄 **[deploy_hostgator.txt](./deploy_hostgator.txt)** - Guia Específico para **HostGator VPS** (Troca de OS, Subdiretórios).
*   📄 **[security_hostgator.txt](./security_hostgator.txt)** - 🔒 **Guia de Segurança** (Firewall, Anti-DDoS, SSH Hardening).

---

## 🛠️ Ferramentas de Manutenção

Na raiz do projeto, você encontrará arquivos `.txt` que podem ser convertidos em scripts `.sh` para manutenção:

| Arquivo Original | Comando Sugerido | Função |
| :--- | :--- | :--- |
| `setup_evolution.txt` | `./setup.sh` | Instalação limpa, atualização e recriação do docker-compose. |
| `debug.txt` | `./debug.sh` | Testa conectividade interna (Ping, DNS, WhatsApp Web) para diagnosticar erros. |
| `fix_evolution_network.txt` | `./fix_network.sh` | Corrige regras de Firewall/IPTables que bloqueiam o QR Code. |
| `factory_reset.txt` | `./reset.sh` | **PERIGO:** Apaga todos os dados do banco e reinicia a instalação do zero. |
| `deploy.txt` | - | Manual de configuração de Nginx e HTTPS. |

---

## ⚙️ Configuração Inicial no Painel

1.  Acesse o ZapFlow (`http://SEU_IP:5173`).
2.  Login padrão: `admin@hostgator.com` / `123456`.
3.  Vá em **Configurações** no menu lateral.
4.  Preencha os dados (baseados na saída do `setup.sh`):
    *   **URL da API:** `http://SEU_IP:8080`
    *   **API Key:** `B8349283-F143-429D-B6C2-9386E8016558`
    *   **Nome da Instância:** `zapflow`
5.  Salve e vá em **Conexões**.
6.  Se houver divergência de nome, clique no botão "Corrigir Nome" que aparecerá. Escaneie o QR Code.

---

## 🐛 Solução de Problemas Comuns

### 1. Loop Infinito / QR Code não carrega
Geralmente causado por falta de memória ou bloqueio de rede.
*   **Solução A:** Crie Memória SWAP (Veja `manual_instalacao_completo.txt`).
*   **Solução B:** Rode `./fix_network.sh` para liberar o tráfego do Docker.

### 2. Erro "Internal Server Error" ao conectar
Causado por tentativa de baixar histórico antigo gigante.
*   **Solução:** Rode `./reset.sh` para limpar o banco corrompido. O sistema já está configurado para **NÃO** baixar histórico antigo (`CONFIG_SESSION_PHONE_SYNC_FULL_HISTORY=false`) nas novas instalações.

### 3. Tela Branca ao acessar o site
Ocorre se o arquivo `.env` não for lido corretamente ou erro de build.
*   **Solução:** Rode `npm run build` novamente e reinicie o PM2. Verifique o console do navegador (F12).

---

## 📞 Suporte

Desenvolvido por **Andrey Gheno Piekas**.
