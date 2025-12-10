# 🚀 Guia Completo de Instalação - Zentria Manager

Este guia contém **TODAS** as funcionalidades implementadas até agora e instruções completas para instalação em uma nova máquina.

## 📋 Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Instalação do Backend (PostgreSQL + API)](#instalação-do-backend)
3. [Instalação do Frontend](#instalação-do-frontend)
4. [Configuração do Evolution API](#configuração-do-evolution-api)
5. [Migrações do Banco de Dados](#migrações-do-banco-de-dados)
6. [Configurações Avançadas](#configurações-avançadas)
7. [Funcionalidades Implementadas](#funcionalidades-implementadas)
8. [Troubleshooting](#troubleshooting)

---

## 📦 Pré-requisitos

### Servidor/Computador
- **Sistema Operacional:** Ubuntu 20.04+ / Debian 11+ / Windows Server 2019+ / macOS 12+
- **RAM:** Mínimo 2GB (recomendado 4GB+)
- **Disco:** Mínimo 10GB livres
- **Rede:** Acesso à internet e porta 3001, 5173, 8080 disponíveis

### Software Necessário
- **Node.js:** 18.0.0 ou superior
- **PostgreSQL:** 12.0 ou superior
- **npm:** 9.0.0 ou superior (vem com Node.js)
- **Docker:** 20.10+ (para Evolution API)
- **Docker Compose:** 2.0+ (para Evolution API)
- **Git:** Para clonar o repositório

### Verificar Instalações
```bash
# Node.js
node --version  # Deve ser v18.0.0 ou superior

# PostgreSQL
psql --version  # Deve ser 12.0 ou superior

# Docker
docker --version  # Deve ser 20.10 ou superior

# Git
git --version
```

---

## 🗄️ Instalação do Backend

### 1. Instalar PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:**
- Baixe e instale do site oficial: https://www.postgresql.org/download/windows/
- Durante a instalação, anote a senha do usuário `postgres`

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

### 2. Criar Banco de Dados

```bash
# Acesse o PostgreSQL
sudo -u postgres psql

# Crie o banco de dados
CREATE DATABASE zentria;

# Crie um usuário (opcional, pode usar postgres)
CREATE USER zentria_user WITH PASSWORD 'sua_senha_super_segura_aqui';
GRANT ALL PRIVILEGES ON DATABASE zentria TO zentria_user;

# Saia
\q
```

### 3. Configurar Backend

```bash
# Entre na pasta do backend
cd backend

# Instale as dependências
npm install

# Copie o arquivo de configuração
cp config.example.env .env

# Edite o .env com suas configurações
nano .env  # ou use seu editor preferido
```

**Configure o `.env` com:**
```env
# PostgreSQL
DATABASE_URL=postgresql://zentria_user:sua_senha_super_segura_aqui@localhost:5432/zentria
# ou use variáveis individuais:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zentria
DB_USER=zentria_user
DB_PASSWORD=sua_senha_super_segura_aqui

# JWT Secret (GERE UMA SENHA ALEATÓRIA SEGURA!)
JWT_SECRET=seu_jwt_secret_super_seguro_aqui_mude_em_producao

# Porta do servidor
PORT=3001

# CORS - URLs permitidas (use o IP do servidor, não localhost)
# Para descobrir o IP do servidor:
# hostname -I | awk '{print $1}'  (Linux)
# ipconfig  (Windows)
CORS_ORIGIN=http://SEU_IP_SERVIDOR:5173,http://localhost:5173

# Rate Limiting (opcional, valores padrão)
RATE_LIMIT_WINDOW_MS=15
RATE_LIMIT_MAX=100
LOGIN_RATE_LIMIT_WINDOW_MS=15
LOGIN_RATE_LIMIT_MAX=5
DATA_RATE_LIMIT_WINDOW_MS=1
DATA_RATE_LIMIT_MAX=200
```

**⚠️ IMPORTANTE:**
- Substitua `SEU_IP_SERVIDOR` pelo IP real do servidor
- Gere um `JWT_SECRET` aleatório e seguro (pode usar: `openssl rand -base64 32`)
- **NUNCA** commite o arquivo `.env` no Git!

### 4. Executar Migração do Banco de Dados

```bash
# Execute a migração (cria tabelas e usuário admin)
npm run migrate
```

Isso criará:
- ✅ Tabela `users` (com campo `department_id`)
- ✅ Tabela `user_data` (dados genéricos)
- ✅ Tabela `departments`
- ✅ Tabela `contacts`
- ✅ Tabela `quick_replies`
- ✅ Tabela `workflows`
- ✅ Usuário admin padrão:
  - **Username:** `admin@piekas.com`
  - **Password:** `123`
  - **Role:** `ADMIN`

**⚠️ IMPORTANTE: Altere a senha do admin em produção!**

### 5. Executar Migrações Adicionais (se necessário)

Se você está atualizando um banco existente, execute:

```bash
# Adicionar campo department_id na tabela users (se não existir)
node scripts/add-department-id-to-users.js

# Corrigir data_keys de chats (se necessário)
node scripts/fix-chat-data-keys.js

# Limpar chats inválidos (números com menos de 11 dígitos)
node scripts/clean-invalid-chats.js
```

### 6. Iniciar Servidor Backend

**Desenvolvimento:**
```bash
npm run dev
```

**Produção (com PM2):**
```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar servidor
pm2 start server.js --name zapflow-backend

# Salvar configuração
pm2 save

# Configurar para iniciar automaticamente
pm2 startup
```

O servidor estará rodando em `http://SEU_IP_SERVIDOR:3001`

### 7. Verificar Backend

```bash
# Health Check
curl http://SEU_IP_SERVIDOR:3001/api/health

# Deve retornar:
# {"status":"ok","message":"Backend is running"}

# Teste de Login
curl -X POST http://SEU_IP_SERVIDOR:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@piekas.com","password":"123"}'
```

---

## 🎨 Instalação do Frontend

### 1. Instalar Dependências

```bash
# Na raiz do projeto
npm install
```

### 2. Configurar Variáveis de Ambiente (Opcional)

Crie um arquivo `.env` na raiz (se necessário):

```env
VITE_API_URL=http://SEU_IP_SERVIDOR:3001/api
```

### 3. Build de Produção

```bash
npm run build
```

Isso criará a pasta `dist/` com os arquivos otimizados.

### 4. Servir Frontend

**Desenvolvimento:**
```bash
npm run dev
```

**Produção (com PM2):**
```bash
# Instalar serve globalmente
npm install -g serve

# Iniciar servidor
pm2 start serve --name zapflow-front -- -s dist -l 5173
pm2 save
```

**Ou usar Nginx:**
```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    root /caminho/para/ZapFlow/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 🔌 Configuração do Evolution API

### 1. Instalar Docker e Docker Compose

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
# Faça logout e login novamente
```

**Windows/macOS:**
- Baixe Docker Desktop: https://www.docker.com/products/docker-desktop

### 2. Configurar Evolution API

Siga as instruções em `install/setup_evolution.txt` ou use o script automático:

```bash
bash install/autoinstall.sh
```

### 3. Verificar Evolution API

```bash
# Verificar se está rodando
docker ps

# Verificar logs
docker logs evolution-api
```

---

## 🔄 Migrações do Banco de Dados

### Migrações Disponíveis

1. **Migração Principal** (`migrate.js`)
   - Cria todas as tabelas necessárias
   - Cria usuário admin padrão
   - Permite `user_id NULL` para configurações globais
   - Cria índice único funcional para permitir configurações globais
   - **Execute:** `npm run migrate`

2. **Adicionar department_id** (`add-department-id-to-users.js`)
   - Adiciona campo `department_id` na tabela `users`
   
3. **Migrar Configurações para Globais** (`migrate-config-to-global.js`)
   - Migra configurações de usuários específicos para globais (user_id = NULL)
   - Atualiza constraint da tabela para permitir configurações globais
   - **Execute:** `node scripts/migrate-config-to-global.js`
   
4. **Corrigir data_keys de Chats** (`fix-chat-data-keys.js`)
   - Corrige chats com data_key NULL ou inválido
   - Extrai ID do chat do data_value e atualiza data_key
   - **Execute:** `node scripts/fix-chat-data-keys.js`
   
4. **Corrigir data_keys de Chats** (`fix-chat-data-keys.js`)
   - Corrige chats com data_key NULL ou inválido
   - Extrai ID do chat do data_value e atualiza data_key
   - **Execute:** `node scripts/fix-chat-data-keys.js`

5. **Limpar Chats Inválidos** (`clean-invalid-chats.js`)
   - Remove chats com números inválidos (menos de 11 dígitos)
   - Corrige data_keys de chats com contactNumber válido
   - **Execute:** `node scripts/clean-invalid-chats.js`
   - **Nota:** Esta limpeza também é executada automaticamente pelo backend a cada 6 horas

### Executar Todas as Migrações

```bash
cd backend

# Migração principal
npm run migrate

# Migrações adicionais (executadas automaticamente pelo autoinstall)
node scripts/add-department-id-to-users.js
node scripts/migrate-config-to-global.js
node scripts/fix-chat-data-keys.js
node scripts/clean-invalid-chats.js
```

---

## ⚙️ Configurações Avançadas

### 1. Configurar Google Gemini AI

1. Acesse: https://makersuite.google.com/app/apikey
2. Crie uma API Key
3. No Zentria, vá em **Configurações > Integração Google**
4. Cole a API Key do Gemini
5. Salve

**⚠️ IMPORTANTE:** A API Key é salva no PostgreSQL (criptografada) e usada para gerar respostas inteligentes.

### 2. Configurar Departamentos e Usuários

1. **Criar Departamentos:**
   - Acesse **Configurações > Departamentos**
   - Clique em **Adicionar Departamento**
   - Preencha nome, descrição e cor

2. **Criar Usuários:**
   - Acesse **Configurações > Usuários**
   - Clique em **Adicionar Usuário**
   - Preencha nome, email, senha
   - **Selecione o Departamento** (obrigatório para operadores)
   - Role: `AGENT` (operador) ou `ADMIN` (administrador)

3. **Atribuir Departamento a Usuário:**
   - Ao criar/editar usuário, selecione o departamento
   - Isso salva `department_id` no PostgreSQL
   - Chats do departamento serão atribuídos automaticamente a esse usuário

### 3. Configurar Chatbot

1. Acesse **Configurações > Chatbot**
2. Configure:
   - **Horário de Funcionamento:** Início e fim
   - **Mensagem de Saudação:** Enviada quando cliente entra em contato
   - **Mensagem de Ausência:** Enviada fora do horário
   - **Ativar Chatbot:** Liga/desliga

### 4. Configurar Evolution API

1. Acesse **Configurações > Conexão**
2. Configure:
   - **URL da API:** `http://SEU_IP_SERVIDOR:8080`
   - **Nome da Instância:** Ex: `Zentria`
   - **API Key:** Obtida automaticamente ou manualmente

---

## ✨ Funcionalidades Implementadas

### 🎯 Sistema de Atendimento

- ✅ **Multi-Agente:** Vários atendentes no mesmo número
- ✅ **Departamentalização:** Separação por setores
- ✅ **Atribuição Automática:** Chats atribuídos ao operador do departamento
- ✅ **Transferência:** Entre agentes e departamentos
- ✅ **Inbox Zero:** Organização automática (A Fazer, Aguardando, Finalizados)

### 🤖 Inteligência Artificial

- ✅ **Google Gemini AI:** Sugestão de respostas inteligentes
- ✅ **Chatbot:** Mensagens automáticas de saudação/ausência
- ✅ **Horários de Funcionamento:** Configurável por departamento

### 📊 Gestão de Dados

- ✅ **Persistência PostgreSQL:** Todos os dados salvos no banco
- ✅ **CRUD Completo:** Departamentos, Contatos, Respostas Rápidas, Workflows
- ✅ **Validação de Números:** Apenas números válidos (11+ dígitos)
- ✅ **Status Persistente:** Status de chats mantido após reload

### 🔔 Notificações

- ✅ **Notificações do Navegador:** Som e notificação visual
- ✅ **Notificação por Departamento:** Operador recebe quando chat é atribuído
- ✅ **Notificação para Admins:** Administradores recebem notificação de todos os departamentos

### 🔄 Tempo Real

- ✅ **Socket.IO Client:** Mensagens em tempo real
- ✅ **Reconexão Automática:** Reconecta automaticamente se desconectar
- ✅ **Fallback para Polling:** Se WebSocket falhar, usa HTTP polling

### 🔒 Segurança

- ✅ **Autenticação JWT:** Tokens seguros
- ✅ **Criptografia:** Dados sensíveis criptografados no localStorage
- ✅ **Rate Limiting:** Proteção contra brute force e DDoS
- ✅ **Validação de Entrada:** Validação rigorosa de dados

### 🛠️ Ferramentas

- ✅ **Respostas Rápidas:** Biblioteca de mensagens pré-definidas
- ✅ **Workflows:** Checklists padronizados (SOP)
- ✅ **Tags:** Classificação visual de clientes
- ✅ **Multimídia:** Áudio, Imagens, Vídeos, Documentos, Stickers
- ✅ **Exportação CSV:** Download de dados para BI

---

## 🐛 Troubleshooting

### Backend não inicia

**Erro: "Porta 3001 já está em uso"**
```bash
# Encontrar processo usando a porta
lsof -ti:3001 | xargs kill  # Linux/macOS
netstat -ano | findstr :3001  # Windows
```

**Erro: "Connection refused" (PostgreSQL)**
```bash
# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql  # Linux
# Reiniciar se necessário
sudo systemctl restart postgresql
```

**Erro: "Token inválido"**
- Verifique se o `JWT_SECRET` está configurado no `.env`
- Verifique se o token está sendo enviado no header `Authorization: Bearer <token>`

### Frontend não conecta ao Backend

**Erro: "CORS policy"**
- Adicione a URL do frontend em `CORS_ORIGIN` no `.env` do backend
- Use o IP do servidor, não `localhost`

**Erro: "ERR_CONNECTION_REFUSED"**
- Verifique se o backend está rodando: `curl http://SEU_IP:3001/api/health`
- Verifique firewall: `sudo ufw allow 3001` (Linux)

### Chats não aparecem

**Problema: "Chats inválidos"**
- Execute: `node backend/scripts/clean-invalid-chats.js`
- Verifique se os números têm pelo menos 11 dígitos

**Problema: "Status não persiste"**
- Verifique se o backend está rodando
- Verifique se a migração foi executada: `npm run migrate`
- Verifique logs do backend para erros

### Evolution API não conecta

**Erro: "QR Code não aparece"**
- Verifique se Docker está rodando: `docker ps`
- Verifique logs: `docker logs evolution-api`
- Verifique firewall: `sudo ufw allow 8080` (Linux)

**Erro: "WebSocket connection failed"**
- Isso é normal! O Socket.IO tenta WebSocket primeiro e faz fallback para polling
- A conexão funciona mesmo com esse erro no console

### Departamento não atribui chat

**Problema: "Chat não vai para operador"**
- Verifique se o usuário tem `department_id` configurado
- Verifique se a migração `add-department-id-to-users.js` foi executada
- Verifique se o departamento existe e tem usuários atribuídos

---

## 📝 Checklist de Instalação

Use este checklist para garantir que tudo está configurado:

- [ ] PostgreSQL instalado e rodando
- [ ] Banco de dados `zentria` criado
- [ ] Backend configurado (`.env` criado)
- [ ] Migração principal executada (`npm run migrate`)
- [ ] Migração `department_id` executada (`node scripts/add-department-id-to-users.js`)
- [ ] Migração de configurações globais executada (`node scripts/migrate-config-to-global.js`)
- [ ] Correção de data_keys de chats executada (`node scripts/fix-chat-data-keys.js`)
- [ ] Limpeza de chats inválidos executada (`node scripts/clean-invalid-chats.js`)
- [ ] Backend rodando (`npm run dev` ou `pm2 start`)
- [ ] Health check funcionando (`/api/health`)
- [ ] Frontend instalado (`npm install`)
- [ ] Frontend rodando (`npm run dev`)
- [ ] Evolution API configurada (Docker)
- [ ] Evolution API rodando (`docker ps`)
- [ ] Login funcionando (admin@piekas.com / 123)
- [ ] Departamento criado
- [ ] Usuário criado e atribuído a departamento
- [ ] Gemini API Key configurada (opcional)
- [ ] Chatbot configurado (opcional)

---

## 🔗 Links Úteis

- **Documentação Técnica:** `docs/TECHNICAL.md`
- **API Endpoints:** `backend/README.md`
- **Guia de Upgrade:** `docs/README_UPGRADE.md`
- **Factory Reset:** `docs/README_FACTORY_RESET.md`

---

## 📞 Suporte

**Desenvolvido por:** Andrey Gheno Piekas  
**Versão:** 1.3.0+ (Stable)  
**Última Atualização:** 2024

---

**⚠️ IMPORTANTE:** Sempre altere as senhas padrão em produção e mantenha o `.env` seguro!

