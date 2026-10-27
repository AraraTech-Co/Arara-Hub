#!/bin/sh
set -eu
export API_UPSTREAM="${API_UPSTREAM:-http://arara-platform-prd:4100}"
envsubst '${API_UPSTREAM}' < /etc/nginx/templates/spa.conf.template > /etc/nginx/conf.d/default.conf
# Os cabeçalhos de segurança ficam FORA do conf.d, que o nginx carrega inteiro
# por conta própria: ali eles também valeriam no nível `http`, e quem lê a
# configuração não saberia de onde vêm. Aqui entram só pelo `include` do
# template, nos três lugares em que ele aparece. Sem `envsubst`: não há variável
# neles, e passá-los pelo envsubst só criaria chance de expansão silenciosa.
cp /etc/nginx/templates/security-headers.conf /etc/nginx/security-headers.conf

# A política de conteúdo é POR FRONT: o que a página pode carregar depende do
# que aquela página carrega. Existindo `csp-<slug>.conf`, ele vence; não
# existindo, vale o `csp-default.conf`. O slug vem de `ARARA_APP_SLUG`, que a
# imagem grava a partir do mesmo argumento de build que o front usa.
#
# O padrão é o CAMINHO DE QUEDA de propósito: slug vazio, errado ou de front
# novo cai na política padrão, que é a mais fechada. O contêiner SOBE e serve
# com política; o risco é tipografia sem a fonte do Google, não front morto. Se
# o `include` apontasse para um arquivo que pode faltar, o nginx não subiria.
_csp="/etc/nginx/templates/csp-default.conf"
if [ -n "${ARARA_APP_SLUG:-}" ] && [ -f "/etc/nginx/templates/csp-${ARARA_APP_SLUG}.conf" ]; then
  _csp="/etc/nginx/templates/csp-${ARARA_APP_SLUG}.conf"
fi
cp "$_csp" /etc/nginx/csp.conf
echo "entrypoint: politica de conteudo de $_csp (slug='${ARARA_APP_SLUG:-}')"

exec nginx -g 'daemon off;'
