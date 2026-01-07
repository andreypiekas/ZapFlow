# 🔒 HTTPS por IP (sem domínio) + Autoconfig (Zentria)

Este guia habilita acesso via **`https://<IP>`** mesmo sem domínio, usando **certificado self‑signed** (com **SAN para IP**) e **Nginx** como proxy reverso.

> **Importante:** Por ser self‑signed, o navegador exibirá aviso até você **confiar no certificado** no Windows/Android.

---

## ✅ O que este modo resolve

- Evita **mixed content** (frontend em https chamando APIs em http).
- Permite **WebSocket (Socket.IO)** funcionar como **WSS**.
- Mantém tudo em um único endereço: `https://<IP>`

---

## 1) No servidor (Ubuntu/Debian) — autoconfig

No servidor onde o Zentria está rodando:

```bash
cd /caminho/do/projeto/ZapFlow
chmod +x install/https_autoconfig.sh
./install/https_autoconfig.sh
```

O script:
- Detecta o IP automaticamente
- Gera `zentria-ip.crt`/`zentria-ip.key` com SAN do IP
- Configura Nginx com:
  - `80 -> 443` (redirect)
  - `/` → frontend (porta 5173)
  - `/api/` → backend Node/Express (porta 3001)
  - `/instance/`, `/message/`, `/chat/`, `/socket.io/` → Evolution (porta 8080)

### Pré‑requisito operacional

Certifique-se de ter estes serviços rodando:
- Frontend em `:5173` (ex.: `serve -s dist -l 5173` via PM2)
- Backend em `:3001` (PM2)
- Evolution em `:8080` (Docker)

---

## 2) No Zentria (Configurações → Evolution API)

Depois de habilitar HTTPS por IP:

- **URL da API (Evolution)**: `https://<IP>`
- **AUTHENTICATION_API_KEY (Servidor)**: conforme seu `docker-compose.yml`
- **Token da Instância**: conforme sua instância

> Dica: não use porta nem `/api`. O Nginx faz o roteamento.

---

## 3) Confiar no certificado (remover aviso do navegador)

O script salva o certificado público em:
- `certs/zentria-ip.crt` (no diretório do projeto)

### Windows (recomendado)

1. Copie o arquivo `zentria-ip.crt` para seu PC.
2. Abra PowerShell **como Administrador** e execute:

```powershell
.\install\https_autoconfig.ps1 -CertPath .\zentria-ip.crt
```

Isso importa o certificado em:
- **Autoridades de Certificação Raiz Confiáveis** (`LocalMachine\Root`)

### Android (varia por fabricante)

Em geral:
- Configurações → Segurança → Instalar certificado → **CA**

Observações:
- O Android pode marcar CA do usuário como “não confiável” para alguns apps.
- Para navegadores (Chrome), costuma funcionar para remover o aviso.

---

## Troubleshooting

- **WebSocket não conecta**
  - Verifique se o Nginx está proxyando `/socket.io/` com `Upgrade` e `Connection`.
  - Verifique se a Evolution está rodando em `:8080`.

- **Tela abre em HTTPS mas a Evolution está em HTTP**
  - No Zentria, ajuste a **URL da API** para `https://<IP>` (sem `:8080`).

- **Uploads/arquivos falham**
  - O Nginx do autoconfig define `client_max_body_size 60m`.


