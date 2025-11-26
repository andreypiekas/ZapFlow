# ZapFlow Manager ⚡ v1.2.0 (Produção)

**Plataforma Profissional de Gestão de Atendimento para WhatsApp**

O **ZapFlow Manager** centraliza, organiza e automatiza o atendimento via WhatsApp. Com suporte a múltiplos atendentes, IA (Gemini), fluxos de trabalho (SOP) e métricas detalhadas. Compatível com **Evolution API v2.2.3**.

---

## 📋 Pré-requisitos (Servidor Ubuntu)

*   **OS:** Ubuntu 20.04 ou superior.
*   **Recursos:** Mínimo 2GB RAM (4GB Recomendado) / 2 vCPU.
*   **Portas:** 8080 (API), 5173 (Frontend) liberadas no Firewall.

---

## ⚡ Instalação Automática

Disponibilizamos scripts prontos para configurar a API e o Banco de Dados automaticamente.

### 1. Clonar o Repositório

```bash
git clone https://github.com/andreypiekas/ZapFlow.git
cd ZapFlow
```

### 2. Configurar a Evolution API (Backend)

Utilize o arquivo `setup_evolution.txt` para criar o ambiente Docker:

1.  Crie o arquivo de script:
    ```bash
    nano setup.sh
    ```
2.  **Copie e cole** o conteúdo do arquivo `setup_evolution.txt` disponível neste repositório.
3.  Salve (CTRL+O) e saia (CTRL+X).
4.  Execute:
    ```bash
    chmod +x setup.sh
    ./setup.sh
    ```

> O script irá gerar automaticamente o `docker-compose.yml` configurado com seu IP, limpar volumes antigos e iniciar a API.

### 3. Build e Deploy do Frontend (ZapFlow)

Para rodar o site em modo produção:

```bash
# 1. Instale dependências
npm install

# 2. Gere o build otimizado
npm run build

# 3. Instale o PM2 (Gerenciador de Processos) e Serve
sudo npm install -g pm2 serve

# 4. Inicie o servidor
pm2 start "serve -s dist -l 5173" --name zapflow-front
pm2 save
pm2 startup
```

Acesse o sistema em: `http://SEU_IP_SERVIDOR:5173`

---

## 🔧 Solução de Problemas (Troubleshooting)

### Problema: QR Code não gera / Loop de Reinicialização

Se a API subir mas o QR Code não aparecer na tela de Conexão, siga estes passos:

#### 1. Diagnóstico
Utilize o script `debug.txt` para verificar a saúde dos containers.

1.  Crie o script: `nano debug.sh`
2.  Cole o conteúdo de `debug.txt`.
3.  Execute: `chmod +x debug.sh && ./debug.sh`

#### 2. Correção de Rede (Firewall/Docker)
Se o diagnóstico apontar erro de internet ou se o QR Code continuar falhando, é provável que o firewall do Docker esteja bloqueando o WebSocket.

1.  Crie o script de correção: `nano fix_network.sh`
2.  Cole o conteúdo de `fix_evolution_network.txt`.
3.  Execute: `chmod +x fix_network.sh && sudo ./fix_network.sh`

Isso limpará regras restritivas do iptables e testará a conexão com o WhatsApp Web.

---

## ⚙️ Configuração Pós-Instalação

1.  Acesse o ZapFlow (`http://SEU_IP:5173`).
2.  Faça login (`admin@hostgator.com` / `123`).
3.  Vá em **Configurações**.
4.  Preencha os dados (baseados na saída do `setup.sh`):
    *   **URL da API:** `http://SEU_IP:8080`
    *   **API Key:** `B8349283-F143-429D-B6C2-9386E8016558` (Padrão do script)
    *   **Instância:** `zapflow_main`
5.  Salve e vá em **Conexões** para escanear o QR Code.

---

## 📞 Suporte

Desenvolvido por **Andrey Gheno Piekas**.
