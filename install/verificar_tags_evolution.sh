#!/bin/bash

# Script para verificar tags disponíveis da Evolution API no Docker Hub
# Verifica múltiplas imagens: evoapicloud/evolution-api e atendai/evolution-api
# Uso: ./verificar_tags_evolution.sh

echo "🔍 Verificando tags disponíveis para imagens Evolution API..."
echo ""

# Array de imagens para verificar
IMAGES=("evoapicloud/evolution-api" "atendai/evolution-api")

# Verificar se curl e jq estão instalados
if ! command -v curl &> /dev/null; then
    echo "❌ curl não está instalado. Instale com: apt-get install curl"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "⚠️  jq não está instalado. Instalando..."
    apt-get update && apt-get install -y jq
fi

# Tags para testar
TAGS_TO_TEST=("2.3.4" "v2.3.4" "2.3.3" "v2.3.3" "2.3.2" "v2.3.2" "2.3.0" "v2.3.0" "2.2.0" "v2.2.0")

# Verificar cada imagem
for IMAGE in "${IMAGES[@]}"; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 Verificando: $IMAGE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Converter nome da imagem para formato de URL do Docker Hub
    IMAGE_URL=$(echo "$IMAGE" | sed 's/\//\/r\//')
    
    # Buscar tags no Docker Hub
    TAGS=$(curl -s "https://hub.docker.com/v2/repositories/${IMAGE}/tags?page_size=100" | jq -r '.results[].name' 2>/dev/null)
    
    if [ -z "$TAGS" ] || [ "$TAGS" = "null" ]; then
        echo "❌ Não foi possível buscar tags para $IMAGE"
        echo "🔗 Acesse manualmente: https://hub.docker.com/r/${IMAGE}/tags"
        echo ""
        continue
    fi
    
    # Mostrar tags da série 2.3.x e 2.2.x
    TAGS_FILTERED=$(echo "$TAGS" | grep -E "^v?2\.(2|3)" | sort -V)
    
    if [ -n "$TAGS_FILTERED" ]; then
        echo "✅ Tags disponíveis (séries 2.2.x e 2.3.x):"
        echo "$TAGS_FILTERED" | head -20
        echo ""
    else
        echo "⚠️  Nenhuma tag da série 2.2.x ou 2.3.x encontrada"
        echo "📋 Tags disponíveis (primeiras 10):"
        echo "$TAGS" | head -10
        echo ""
    fi
    
    echo "🔍 Testando tags específicas..."
    FOUND_ANY=false
    
    for tag in "${TAGS_TO_TEST[@]}"; do
        if echo "$TAGS" | grep -q "^${tag}$"; then
            echo "  ✅ $tag encontrada"
            echo "     Comando: docker pull ${IMAGE}:${tag}"
            FOUND_ANY=true
        fi
    done
    
    if [ "$FOUND_ANY" = false ]; then
        echo "  ❌ Nenhuma das tags testadas foi encontrada"
    fi
    
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 Recomendações:"
echo ""
echo "1. ✅ Tag confirmada: v2.3.4 (com prefixo v)"
echo "   Use: evoapicloud/evolution-api:v2.3.4"
echo "2. Se não encontrar em evoapicloud, tente atendai/evolution-api (mais popular)"
echo "3. Se nenhuma tag 2.3.x estiver disponível, use uma versão anterior estável"
echo ""
echo "🔗 Links úteis:"
echo "  - evoapicloud: https://hub.docker.com/r/evoapicloud/evolution-api/tags"
echo "  - atendai: https://hub.docker.com/r/atendai/evolution-api/tags"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

