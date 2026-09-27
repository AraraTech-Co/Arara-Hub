#!/bin/sh
set -eu
export API_UPSTREAM="${API_UPSTREAM:-http://arara-platform-prd:4100}"
envsubst '${API_UPSTREAM}' < /etc/nginx/templates/spa.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
