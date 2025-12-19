# Atualização Rápida do docker-compose.yml na VM

## 🚀 Comando Rápido (Copie e Cole)

Execute na VM no diretório `/home/piekas/ZapFlow`:

```bash
# Opção 1: Editar diretamente (mais rápido)
sed -i 's|evoapicloud/evolution-api:2\.3\.4|evoapicloud/evolution-api:v2.3.4|g' docker-compose.yml

# Verificar se foi alterado corretamente
grep "evoapicloud/evolution-api" docker-compose.yml

# Depois execute
docker compose up -d
```

## 🔧 Ou Editar Manualmente

```bash
# 1. Abrir o arquivo para edição
nano docker-compose.yml
# ou
vi docker-compose.yml

# 2. Localizar a linha (deve estar na linha 3 ou 7):
image: evoapicloud/evolution-api:2.3.4

# 3. Alterar para:
image: evoapicloud/evolution-api:v2.3.4

# 4. Salvar:
# Nano: Ctrl+X, depois Y, depois Enter
# Vi: Esc, depois :wq, depois Enter

# 5. Executar
docker compose up -d
```

## ✅ Verificar

Depois de atualizar, verifique se está correto:

```bash
grep "image:" docker-compose.yml | grep evolution
```

Deve mostrar: `image: evoapicloud/evolution-api:v2.3.4`

## 📝 Alternativa: Baixar do GitHub

Se o diretório estiver vinculado ao Git:

```bash
cd /home/piekas/ZapFlow
git pull origin main
docker compose up -d
```

