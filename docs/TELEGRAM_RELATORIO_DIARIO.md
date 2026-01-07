# 📲 Relatório Diário via Telegram (Zentria)

Este guia mostra como configurar o **relatório diário automático** do Zentria no **Telegram** (via Bot), incluindo **token**, **chatId** e como testar.

---

## ✅ Pré‑requisitos

- Zentria Backend rodando e com acesso à internet (para chamar a API do Telegram).
- Você precisa ser **ADMIN** no Zentria para acessar a configuração.

---

## 1) Criar um Bot no Telegram (BotFather)

1. Abra o Telegram e procure por **@BotFather**.
2. Envie `/newbot`.
3. Escolha um nome e um username (ex.: `ZentriaReportsBot`).
4. O BotFather vai retornar um **BOT TOKEN** no formato:
   - `1234567890:AA...`

Guarde esse token.

---

## 2) Obter o Chat ID (para onde o relatório será enviado)

Você pode enviar o relatório para:
- **Chat privado** (você mesmo)
- **Grupo**
- **Canal** (se aplicável)

### Opção A — Chat privado (mais simples)

1. Abra o bot que você criou e envie qualquer mensagem (ex.: `oi`).
2. No navegador, abra:
   - `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
3. Procure no JSON por:
   - `"chat":{"id": ... }`

Esse número é o seu **chatId**.

### Opção B — Grupo (recomendado para equipe)

1. Crie/abra um grupo e **adicione o bot**.
2. Envie uma mensagem qualquer no grupo (ex.: `teste`).
3. Abra novamente:
   - `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
4. Procure por `"chat":{"id": ... }`

Observações:
- Em grupos/supergrupos, o `chatId` geralmente é **negativo** e pode começar com `-100...`.

---

## 3) Configurar no Zentria (tela de Configurações)

1. Vá em **Configurações → Integrações → Telegram**.
2. Preencha:
   - **Chat ID**: o `id` encontrado no `getUpdates`
   - **Bot Token**: token do BotFather  
     - **Segurança**: o token **não é exibido depois**. Para trocar, basta inserir um novo e salvar.
   - **Horário**: formato `HH:MM`
   - **Timezone**: ex.: `America/Sao_Paulo`
3. Clique em **Salvar Telegram**.

### Testes

- **Enviar teste**: envia uma mensagem simples usando o token digitado (não salva).
- **Enviar agora**: envia o relatório completo usando o token armazenado.

---

## 4) O que vai no relatório

O relatório é curto (para caber no limite do Telegram) e inclui, quando disponível:
- Tamanho do banco (`pg_database_size`)
- Contagem de usuários/contatos/setores/workflows/respostas rápidas
- Total de linhas em `user_data`
- Top `data_types` (ex.: `messages`, `chats`, etc.)
- Status da quota do Gemini (tabela `gemini_quota_control`, se existir)

---

## Troubleshooting rápido

- **“Telegram não configurado (token/chatId ausentes)”**
  - Salve o token e o chatId na aba do Telegram.

- **“Falha ao enviar Telegram: ... chat not found”**
  - Verifique se você enviou mensagem para o bot (ou se o bot foi adicionado ao grupo).
  - Confirme o `chatId` no `getUpdates`.

- **Não chegou no horário**
  - Confirme `timezone` e `horário`.
  - O backend precisa estar rodando no momento do envio.


