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
exec nginx -g 'daemon off;'
