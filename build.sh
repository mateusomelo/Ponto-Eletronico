#!/bin/sh
# build.sh — Executado pelo Netlify antes de cada deploy
# Gera o arquivo _redirects com a URL real do backend no Railway
# Requer: BACKEND_URL definida em Site settings > Environment variables no Netlify

set -e

if [ -z "$BACKEND_URL" ]; then
  echo ""
  echo "ERRO: Variavel de ambiente BACKEND_URL nao esta definida."
  echo "Acesse: Netlify > Site settings > Environment variables"
  echo "Adicione: BACKEND_URL = https://seu-backend.up.railway.app"
  echo ""
  exit 1
fi

# Remove barra final da URL se houver
BACKEND="${BACKEND_URL%/}"

REDIRECTS="frontend/public/_redirects"

cat > "$REDIRECTS" << HEREDOC
# Gerado automaticamente por build.sh - nao edite manualmente
# Backend: ${BACKEND}

/api/*       ${BACKEND}/api/:splat      200
/uploads/*   ${BACKEND}/uploads/:splat  200
HEREDOC

echo "Redirects gerados: $REDIRECTS"
echo "Backend: $BACKEND"
