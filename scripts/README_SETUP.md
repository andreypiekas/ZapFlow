# Scripts de Instalação do Backend

Scripts automatizados para instalação e configuração do backend Zentria.

## Como Usar

### Linux/macOS

```bash
# Torne o script executável (se necessário)
chmod +x scripts/setup_backend.sh

# Execute o script
./scripts/setup_backend.sh
```

### Windows (PowerShell)

```powershell
# Execute o script PowerShell
.\scripts\setup_backend.ps1
```

**Nota:** Se você receber um erro de política de execução, execute:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## O que o script faz

1. ✅ Verifica se Node.js 18+ está instalado
2. ✅ Verifica/instala PostgreSQL
3. ✅ Cria o banco de dados `zentria`
4. ✅ Instala dependências do backend (`npm install`)
5. ✅ Cria arquivo `.env` com configurações
6. ✅ Executa migração do banco de dados
7. ✅ Cria usuário admin padrão

## Requisitos

- Node.js 18 ou superior
- PostgreSQL 12 ou superior
- npm ou yarn

## Após a instalação

1. **Inicie o servidor:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Teste a API:**
   ```bash
   # Substitua SEU_IP_SERVIDOR pelo IP real do servidor
   curl http://SEU_IP_SERVIDOR:3001/api/health
   
   # Para descobrir o IP do servidor:
   hostname -I | awk '{print $1}'
   ```

3. **Faça login:**
   - Username: `admin@piekas.com`
   - Password: `123`
   - ⚠️ **ALTERE A SENHA EM PRODUÇÃO!**

## Configuração Manual (Alternativa)

Se preferir configurar manualmente, siga as instruções em `../INSTALACAO_BACKEND.md`

