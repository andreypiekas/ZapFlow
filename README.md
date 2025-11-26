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
    cp setup_evolution.txt setup.sh && chmod +x setup.sh
    ```
2.  Execute:
    ```bash
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

### Problema: Erro 500 no Log / Loop de Reinicialização / Instância Travada

Se o log mostrar `"error in handling message"` ou a instância ficar reiniciando, é necessário limpar o banco de dados corrompido.

1.  Crie o script de reset: 
```bash
cp setup_evolution.txt setup.sh && chmod +x setup.sh && cp factory_reset.txt reset.sh && chmod +x reset.sh
```
2.  Execute: 
```bash
sudo ./reset.sh
```

Automático: 

1. Ajusta e executa  
```bash
`cp setup_evolution.txt setup.sh && chmod +x setup.sh && cp factory_reset.txt reset.sh && chmod +x reset.sh && ./reset.sh`
```

### Problema: QR Code não gera

1.  Verifique se o `SERVER_URL` no `docker-compose.yml` está com o IP correto (não use localhost).
2.  Execute o diagnóstico: 
```bash
chmod +x debug.sh && ./debug.sh
```
3.  Ajuste o arquivo de correção de rede 
```bash
cp fix_evolution_networ.txt fix_network.sh && chmod +x fix_network.sh
```
4.  Execute a correção de rede: 
```bash
sudo ./fix_network.sh
```

---

## ⚙️ Configuração Pós-Instalação

1.  Acesse o ZapFlow (`http://SEU_IP:5173`).
2.  Faça login (`admin@hopiekas.com` / `123`).
3.  Vá em **Configurações**.
4.  Preencha os dados (baseados na saída do `setup.sh`):
    *   **URL da API:** `http://SEU_IP:8080`
    *   **API Key:** `B8349283-F143-429D-B6C2-9386E8016558` (Padrão do script)
    *   **Instância:** `zapflow`
5.  Salve e vá em **Conexões** para escanear o QR Code.

---

## 📞 Suporte

Desenvolvido por **Andrey Gheno Piekas**.