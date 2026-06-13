#!/bin/sh
# build.sh — Executado pelo Netlify antes de cada deploy
# Gera o arquivo _redirects com a URL real do backend no Railway
# Requer a variável de ambiente BACKEND_URL definida no painel do Netlify

set -e

if [ -z "$BACKEND_URL" ]; then
  echo ""
  echo "ERRO: Variável de ambiente BACKEND_URL não está definida."
  echo "Acesse: Netlify > Site settings > Environment variables"
  echo "Adicione: BACKEND_URL = https://seu-backend.up.railway.app"
  echo ""
  exit 1
fi

# Remove barra final da URL se houver
BACKEND="${BACKEND_URL%/}"

REDIRECTS="frontend/public/_redirects"

cat > "$REDIRECTS" << HEREDOC
# Gerado automaticamente por build.sh — não edite manualmente
# Backend: ${BACKEND}

/api/*       ${BACKEND}/api/:splat       200
/uploads/*   ${BACKEND}/uploads/:splat   200
/fa/*        ${BACKEND}/fa/:splat        200
/leaflet/*   ${BACKEND}/leaflet/:splat   200
/chartjs/*   ${BACKEND}/chartjs/:splat   200
HEREDOC

echo ""
echo "Redirects gerados com sucesso em: $REDIRECTS"
echo "Backend configurado: $BACKEND"
echo ""
