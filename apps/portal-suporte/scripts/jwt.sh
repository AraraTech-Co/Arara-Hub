#!/usr/bin/env bash
# =============================================================================
# Pega um JWT da plataforma com o seu login.
#
# A senha é lida com o eco desligado e vai direto para o corpo da requisição:
# não aparece na tela, não entra no histórico do shell e não fica em variável
# de ambiente. O JWT que sai expira sozinho — por isso ele é o que se
# compartilha, nunca a senha.
#
#   bash scripts/jwt.sh                → copia o JWT para a área de transferência
#   bash scripts/jwt.sh --mostrar      → imprime o JWT na tela
#   bash scripts/jwt.sh --curl "<...>" → usa o JWT numa chamada, sem exibi-lo
#   bash scripts/jwt.sh --arquivo      → grava em /tmp/.arara-jwt (modo 600)
#
# O modo --arquivo existe porque a área de transferência é volátil: basta
# copiar outra coisa no meio de uma sequência e o token some. O arquivo dura
# o que o token durar; apague com `rm /tmp/.arara-jwt` quando terminar.
#
# Exemplo do terceiro modo — criar o app da documentação:
#   bash scripts/jwt.sh --curl "-X POST \
#     https://api.arara-tech.com/v1/apps \
#     -H 'Content-Type: application/json' \
#     -d '{\"slug\":\"doc-apoio\",\"name\":\"Doc de Apoio\"}'"
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
API="https://api.arara-tech.com"
[[ -f .env.local ]] && API="$(grep '^NEXT_PUBLIC_ARARA_API_URL=' .env.local | cut -d= -f2- || echo "$API")"

MODO="${1:-}"

printf 'E-mail: '
read -r EMAIL
printf 'Senha: '
read -rs SENHA          # -s: não ecoa o que você digita
printf '\n'

# jq faria isto em uma linha, mas nem toda máquina tem. python3 tem.
CORPO=$(EMAIL="$EMAIL" SENHA="$SENHA" python3 -c '
import json, os
print(json.dumps({"email": os.environ["EMAIL"], "password": os.environ["SENHA"]}))')
unset SENHA

RESP=$(printf '%s' "$CORPO" | curl -s --max-time 30 -X POST "$API/v1/auth/login" \
  -H 'Content-Type: application/json' --data-binary @-)
unset CORPO

TOKEN=$(printf '%s' "$RESP" | python3 -c '
import json, sys
try: d = json.load(sys.stdin)
except Exception: sys.exit(1)
t = d.get("token") or (d.get("data") or {}).get("token")
if not t:
    print("ERRO:", d.get("error") or d.get("message") or d, file=sys.stderr); sys.exit(1)
print(t)') || { echo "❌ login falhou"; exit 1; }

case "$MODO" in
  --arquivo)
    umask 077
    printf '%s' "$TOKEN" > /tmp/.arara-jwt
    echo "✅ JWT em /tmp/.arara-jwt (só você lê; expira em algumas horas)"
    ;;
  --mostrar)
    echo "$TOKEN"
    ;;
  --curl)
    # O JWT entra na chamada sem passar pela tela nem pelo histórico.
    eval "curl -s -H 'Authorization: Bearer $TOKEN' ${2:?informe os argumentos do curl}" \
      | python3 -m json.tool 2>/dev/null || true
    ;;
  *)
    printf '%s' "$TOKEN" | pbcopy 2>/dev/null \
      && echo "✅ JWT copiado para a área de transferência (expira em algumas horas)" \
      || { echo "⚠️ pbcopy indisponível; use --mostrar"; exit 1; }
    ;;
esac
