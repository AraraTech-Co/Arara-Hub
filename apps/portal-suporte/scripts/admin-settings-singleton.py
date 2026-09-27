#!/usr/bin/env python3
# =============================================================================
# `/admin/settings` passa a se comportar como o registro ÚNICO que ele é.
#
# Sintoma: ligar o interruptor "Menu" (e também "Bot" e "Rodízio") na inbox
# devolvia erro. A causa são dois stubs gerados na integração:
#
#   PUT  respondia **400 "Missing id"** SEMPRE. O controller lê `ctx.params.id`,
#        mas o caminho é `/admin/settings`, sem `:id` — o parâmetro nunca
#        existe. Nenhuma configuração jamais foi salva por essa rota.
#   GET  devolvia `{data: [linha]}` (LISTA), enquanto toda a interface lê
#        `res.data.waMenuEnabled`. Num array isso é `undefined`, então o
#        interruptor aparecia desligado mesmo se estivesse ligado — e o
#        operador não tinha como perceber a diferença.
#
# Configuração do sistema é registro único: agora GET devolve o OBJETO (o
# primeiro registro, ou `{}` se não houver) e PUT atualiza esse registro,
# criando-o na primeira vez. Corpo parcial é mesclado, não substitui.
#
#   python3 scripts/admin-settings-singleton.py            # simula
#   python3 scripts/admin-settings-singleton.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/admin-settings-singleton.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/admin_settings"

GET_NOVO = """// Configuração do sistema é registro ÚNICO — devolver lista fazia a
// interface ler `data.waMenuEnabled` de dentro de um array e receber
// `undefined`, mostrando tudo desligado. Ver %s.
async function handler(ctx) {
  const model = ctx.models.SystemSettings;
  if (!model) return ctx.reply.status(500).send({ error: "Model SystemSettings missing" });
  const rows = (await model.findMany({})) || [];
  return ctx.reply.send({ data: rows[0] || {} });
}
module.exports = { handler };
""" % MARCA

PUT_NOVO = """// PUT do registro único. O stub anterior lia `ctx.params.id` num caminho que
// não tem `:id` e respondia 400 "Missing id" em toda chamada — nenhuma
// configuração era salva. Ver %s.
async function handler(ctx) {
  const model = ctx.models.SystemSettings;
  if (!model) return ctx.reply.status(500).send({ error: "Model SystemSettings missing" });
  const body = ctx.body || {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return ctx.reply.status(400).send({ error: "Corpo inválido" });
  }
  const agora = new Date().toISOString();
  const rows = (await model.findMany({})) || [];
  var row;
  if (rows[0]) {
    // Mescla: o corpo é PARCIAL (um interruptor por vez), e substituir o
    // registro apagaria logo, cor e nome da empresa a cada clique.
    var patch = Object.assign({}, body, { updated_at: agora });
    delete patch.id;
    row = await model.update(rows[0].id, patch);
  } else {
    row = await model.create(Object.assign({}, body, { created_at: agora, updated_at: agora }));
  }
  return ctx.reply.send({ data: row });
}
module.exports = { handler };
""" % MARCA


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    atual = {(r["method"], r["path"]): r for r in d["routes"]}
    alvos = [("GET", "/admin/settings", GET_NOVO), ("PUT", "/admin/settings", PUT_NOVO)]

    mudou = False
    for metodo, caminho, codigo in alvos:
        rota = atual.get((metodo, caminho))
        if not rota:
            print(f"   ! {metodo} {caminho}: não existe")
            continue
        if MARCA in (rota["controllerCode"] or ""):
            print(f"   = {metodo} {caminho}: já aplicado")
            continue
        print(f"   {'→' if aplicar else ' '} {metodo} {caminho}: reescrito")
        if not aplicar:
            continue
        corpo = {"method": metodo, "path": caminho, "controllerCode": codigo}
        for extra in ("authMode", "webhookSecretName"):
            if rota.get(extra):
                corpo[extra] = rota[extra]
        c, r = req(f"{MOD}/routes", "PUT", corpo)
        if c >= 300:
            print(f"      ❌ HTTP {c} {r}")
            sys.exit(1)
        mudou = True

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    if mudou:
        c, r = req(MOD, "PATCH", {"status": "published"})
        print(f"→ publicar: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
