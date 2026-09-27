#!/usr/bin/env bash
# =============================================================================
# Aplica controle de acesso nas 44 rotas do módulo `whatsapp` da plataforma.
#
# Hoje NENHUMA delas exige nível: `requiredPermissions` está vazio em todas e
# os controllers usam `ctx.user` só para saber o nome de quem enviou. Quem tiver
# uma credencial aceita pelo app lê as conversas todas, apaga fluxo, publica
# fluxo e apaga motivos de encerramento.
#
# A plataforma não resolve isso por fora: o RBAC dela é por papel de PLATAFORMA,
# e o nível que a Arara administra vive em `portal-suporte-Profile.role`. O
# padrão da própria API (ver Horas no /readme) é checar dentro do controller.
# É o que este script injeta.
#
#   bash scripts/wa-permissoes.sh             → mostra o plano (não escreve)
#   bash scripts/wa-permissoes.sh --aplicar   → aplica e verifica
#   bash scripts/wa-permissoes.sh --restaurar <backup.json>
#
# Escrever rota exige JWT (chave de API não publica módulo):
#   export ARARA_JWT="$(bash scripts/jwt.sh --mostrar)"
#
# Toda execução salva antes um backup completo das rotas em backups/.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
[[ -f .env.local ]] || { echo "❌ .env.local não encontrado"; exit 1; }
set -a; . ./.env.local; set +a

API="${NEXT_PUBLIC_ARARA_API_URL:?}"
KEY="${ARARA_API_KEY:?defina ARARA_API_KEY no .env.local}"
MOD="$API/v1/apps/portal-suporte/modules/whatsapp"
ACAO="${1:-}"

mkdir -p backups

# ── Restauração ──────────────────────────────────────────────────────────────
if [[ "$ACAO" == "--restaurar" ]]; then
  ARQ="${2:?informe o arquivo de backup}"
  [[ -f "$ARQ" ]] || { echo "❌ backup não encontrado: $ARQ"; exit 1; }
  echo "→ Restaurando rotas a partir de $ARQ"
  python3 - "$ARQ" > /tmp/_wa_restore.json <<'PY'
import json, sys
rs = json.load(open(sys.argv[1]))['routes']
print(json.dumps({"routes": [
    {"method": r["method"], "path": r["path"], "controllerCode": r["controllerCode"]} for r in rs
]}))
PY
  code=$(curl -s -o /tmp/_wa_r.json -w "%{http_code}" -X PUT --max-time 120 \
    -H "x-api-key: $KEY" -H "Content-Type: application/json" \
    -d @/tmp/_wa_restore.json "$MOD/routes")
  echo "   HTTP $code"; head -c 300 /tmp/_wa_r.json; echo
  exit 0
fi

# ── Backup ───────────────────────────────────────────────────────────────────
CARIMBO="$(date +%Y%m%d-%H%M%S)"
BACKUP="backups/wa-routes-$CARIMBO.json"
curl -s --max-time 60 -H "x-api-key: $KEY" "$MOD/routes" -o "$BACKUP"
TOTAL=$(python3 -c "import json;print(len(json.load(open('$BACKUP'))['routes']))")
echo "→ Backup: $BACKUP ($TOTAL rotas)"
[[ "$TOTAL" -ge 40 ]] || { echo "❌ backup parece incompleto — abortando"; exit 1; }
echo

# ── Monta o payload com a guarda injetada ────────────────────────────────────
python3 - "$BACKUP" > /tmp/_wa_novo.json <<'PY'
import json, sys

rotas = json.load(open(sys.argv[1]))['routes']

# admin+ para o que muda configuração compartilhada pela equipe; support+ para
# operar conversa — atender é o trabalho do agente, e exigir `developer` ali
# trancaria o time de atendimento fora da própria inbox. Cliente (`user`) não
# entra em nada do WhatsApp.
ADMIN = {
    ('POST',   '/whatsapp/flows'),
    ('PATCH',  '/whatsapp/flows/:id'),
    ('DELETE', '/whatsapp/flows/:id'),
    ('POST',   '/whatsapp/flows/:id/publish'),
    ('PATCH',  '/whatsapp/flows/:id/settings'),
    ('POST',   '/whatsapp/close-reasons'),
    ('PATCH',  '/whatsapp/close-reasons/:id'),
    ('DELETE', '/whatsapp/close-reasons/:id'),
    ('POST',   '/whatsapp/departments'),
    ('POST',   '/whatsapp/tags'),
    ('POST',   '/whatsapp/automations'),
    ('PATCH',  '/whatsapp/automations/:id'),
}
# Webhook do provedor: chega sem pessoa por natureza, guarda não se aplica.
SEM_GUARDA = {('POST', '/whatsapp/inbound')}

GUARDA = '''
// ── Controle de acesso (injetado por scripts/wa-permissoes.sh) ───────────────
// A chave de API não carrega pessoa: quando `ctx.user` não tem id, a chamada
// é de serviço e segue como antes. Com JWT, o nível vem de
// portal-suporte-Profile.role — o mesmo que a tela de Equipe administra.
var _NIVEL_MIN = "%s";
// Escala canônica da plataforma (readme, seção 8). `support` é o agente de
// suporte; `admin` absorveu `master`, que segue como apelido.
var _RANK = { user: 10, support: 20, developer: 30, admin: 40 };
var _APELIDOS = { master: "admin", gerente: "admin", member: "support", agent: "support", vendedor: "user" };
function _canonico(cru) {
  var v = String(cru || "").trim().toLowerCase();
  if (_RANK[v] !== undefined) return v;
  return _APELIDOS[v] || "";
}
var _handlerOriginal = handler;
async function _comControleDeAcesso(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || null;
  if (quem && ctx.models && ctx.models.Profile) {
    var perfil = await ctx.models.Profile.findById(quem);
    var nivel = _canonico(perfil ? perfil.role : "");
    // Nível irreconhecível cai em 0 e é barrado.
    if ((_RANK[nivel] || 0) < _RANK[_NIVEL_MIN]) {
      return ctx.reply.status(403).send({
        success: false,
        error: "Sem permissão para esta operação",
      });
    }
  }
  return _handlerOriginal(ctx);
}
module.exports = { handler: _comControleDeAcesso };
'''

saida, plano = [], []
for r in rotas:
    chave = (r['method'], r['path'])
    codigo = r['controllerCode'] or ''
    if chave in SEM_GUARDA:
        plano.append((r['method'], r['path'], '— (webhook)'))
    elif 'wa-permissoes.sh' in codigo:
        plano.append((r['method'], r['path'], 'já tem guarda'))
    else:
        minimo = 'admin' if chave in ADMIN else 'support'
        alvo = 'module.exports = { handler };'
        if alvo not in codigo:
            raise SystemExit(f"❌ {r['method']} {r['path']}: assinatura inesperada, abortando")
        codigo = codigo.replace(alvo, GUARDA % minimo)
        plano.append((r['method'], r['path'], minimo))
    # Preserva o modo de autenticação: /whatsapp/inbound usa
    # authMode=webhook_secret para a Avisa alcançá-lo sem header. Um PUT sem
    # esse campo devolveria a rota ao padrão e quebraria o recebimento.
    rota = {"method": r['method'], "path": r['path'], "controllerCode": codigo}
    for extra in ('authMode', 'webhookSecretName'):
        if r.get(extra): rota[extra] = r[extra]
    rota['_mudou'] = codigo != (r['controllerCode'] or '')
    saida.append(rota)

json.dump({"routes": saida}, open('/tmp/_wa_novo.json.tmp', 'w'))
with open('/tmp/_wa_plano.tsv', 'w') as f:
    for m, p, n in sorted(plano, key=lambda x: (x[2], x[1])):
        f.write(f"{m}\t{p}\t{n}\n")
print(open('/tmp/_wa_novo.json.tmp').read())
PY

echo "── Plano"
awk -F'\t' '{printf "   %-6s %-34s → %s\n", $1, $2, $3}' /tmp/_wa_plano.tsv
echo
awk -F'\t' '{print $3}' /tmp/_wa_plano.tsv | sort | uniq -c | awk '{printf "   %s rotas: %s\n", $1, $2}'
echo

if [[ "$ACAO" != "--aplicar" ]]; then
  echo "   (simulação — use --aplicar para escrever na plataforma)"
  exit 0
fi

# ── Aplica ───────────────────────────────────────────────────────────────────
# Uma rota por requisição: o PUT recusa lista (400 "method/path/controllerCode
# Required"). Escrever no rascunho não afeta o runtime até o publish.
echo "── Escrevendo as rotas (uma a uma)"
[[ -n "${ARARA_JWT:-}" ]] || { echo "   ❌ defina ARARA_JWT (bash scripts/jwt.sh --mostrar)"; exit 1; }
total=$(python3 -c "import json;print(len(json.load(open('/tmp/_wa_novo.json'))['routes']))")
falhas=0
for i in $(seq 0 $((total-1))); do
  mudou=$(python3 -c "
import json
r=json.load(open('/tmp/_wa_novo.json'))['routes'][$i]
if not r.get('_mudou'): print('nao'); raise SystemExit
d={k:v for k,v in r.items() if k != '_mudou'}
json.dump(d, open('/tmp/_wa_r1.json','w')); print('sim')")
  [[ "$mudou" == "sim" ]] || continue
  c=$(curl -s -o /tmp/_wa_put.json -w "%{http_code}" -X PUT --max-time 60 \
    -H "Authorization: Bearer $ARARA_JWT" -H "Content-Type: application/json" \
    -d @/tmp/_wa_r1.json "$MOD/routes")
  [[ "$c" == 2* ]] || { falhas=$((falhas+1)); echo "   ❌ rota $i: HTTP $c $(head -c 120 /tmp/_wa_put.json)"; }
done
echo "   $((total-falhas))/$total escritas"
if [[ "$falhas" -gt 0 ]]; then
  echo "   ❌ houve falha — NÃO vou publicar. Backup em $BACKUP"
  exit 1
fi

# Se a escrita cair no rascunho, é preciso publicar para valer no runtime.
echo "── Publicando o módulo"
pc=$(curl -s -o /tmp/_wa_pub.json -w "%{http_code}" -X PATCH --max-time 60 \
  -H "Authorization: Bearer $ARARA_JWT" -H "Content-Type: application/json" \
  -d '{"status":"published"}' "$MOD")
echo "   HTTP $pc"

# ── Verificação ──────────────────────────────────────────────────────────────
echo "── Verificando o runtime"
RT="$API/v1/r/portal-suporte"
for p in /whatsapp /whatsapp/agents /whatsapp/flows /whatsapp/close-reasons; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 -H "x-api-key: $KEY" "$RT$p")
  printf "   %-24s HTTP %s %s\n" "$p" "$c" "$([[ "$c" == 200 ]] && echo ✅ || echo ❌)"
done
echo
echo "   Se algo acima não for 200:"
echo "     bash scripts/wa-permissoes.sh --restaurar $BACKUP"
