#!/usr/bin/env python3
# =============================================================================
# Carimbo de autor no POST de mensagens — a raiz do "Sistema".
#
# O GET /tickets/:id/messages JÁ resolve autor (join com Profile), mas o POST
# gravava só o que o front mandasse — e o front nunca mandou `user_id`. Toda
# mensagem nova nascia SEM autor; o join não tinha o que resolver e as telas
# caíam no "Sistema"/"?". O carimbo é do SERVIDOR: quem escreve é quem está
# autenticado (JWT ou sessão do portal), não quem o corpo disser.
#
#   python3 scripts/mensagens-carimbo-autor.py            # simula
#   python3 scripts/mensagens-carimbo-autor.py --aplicar
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/mensagens-carimbo-autor.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/tickets"

VELHO = """  const body = Object.assign({}, ctx.body || {});
  if (!body.ticket_id) body.ticket_id = ctx.params.id;"""
NOVO = """  const body = Object.assign({}, ctx.body || {});
  if (!body.ticket_id) body.ticket_id = ctx.params.id;
  // ── Carimbo de autor (%s) ──
  // Quem escreve é quem está AUTENTICADO — JWT ou sessão do portal —, não o
  // que o corpo disser. Sem isto, toda mensagem nascia sem user_id e as telas
  // mostravam "Sistema" no lugar da pessoa.
  try {
    var _u = ctx.user || {};
    var _quem = _u.id || _u.userId || (await _sessaoDoPortal(ctx));
    if (_quem) body.user_id = String(_quem);
    else delete body.user_id;
  } catch (e) {}
  if (!body.created_at) body.created_at = new Date().toISOString();""" % MARCA


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=240) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    rota = [r for r in d["routes"] if r["path"] == "/tickets/:id/messages" and r["method"] == "POST"][0]
    cod = rota["controllerCode"]
    if MARCA in cod:
        print("= já aplicado")
        return
    if cod.count(VELHO) != 1:
        print(f"! âncora {cod.count(VELHO)}x"); sys.exit(1)
    novo = cod.replace(VELHO, NOVO, 1)
    open("/tmp/msg_carimbo.js", "w").write(novo)
    if subprocess.run(["node", "--check", "/tmp/msg_carimbo.js"]).returncode != 0:
        sys.exit(1)
    print(f"→ POST messages: +carimbo de autor ({len(cod)} → {len(novo)})")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return
    corpo = {"method": "POST", "path": "/tickets/:id/messages", "controllerCode": novo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    c, r = req(f"{MOD}/routes", "PUT", corpo)
    print(f"→ gravar: HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
