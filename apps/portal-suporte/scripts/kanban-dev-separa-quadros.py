#!/usr/bin/env python3
# =============================================================================
# Fase 3 (servidor) — separar os quadros na leitura.
#
# `GET /tickets/kanban` devolvia TODOS os tickets. Com o quadro Dev existindo,
# os cards Dev (status `no_status`, `backlog`…) vazariam para o quadro de
# Suporte e para tudo que consome a rota. Agora:
#
#   GET /tickets/kanban              → só quadro suporte (o padrão de sempre)
#   GET /tickets/kanban?quadro=dev   → só quadro dev
#
# Ausência de `quadro` no ticket lê como "suporte" — os 471 existentes não têm
# o campo e continuam onde sempre estiveram, sem update em massa.
#
#   python3 scripts/kanban-dev-separa-quadros.py            # simula
#   python3 scripts/kanban-dev-separa-quadros.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/kanban-dev-separa-quadros.py"


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

VELHO = """  const rows = (await Ticket.findMany({})) || [];
"""
NOVO = """  // ── Separação de quadros (%s) ──
  // Sem isto, os cards do Kanban Dev (no_status, backlog…) vazavam para o
  // quadro de Suporte. Ausência de `quadro` lê como "suporte": os tickets
  // antigos não têm o campo e continuam onde sempre estiveram.
  var _quadro = String((ctx.query && ctx.query.quadro) || "suporte");
  const rows = ((await Ticket.findMany({})) || []).filter(function (t) {
    return String(t.quadro || "suporte") === _quadro;
  });
""" % MARCA


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
        return e.code, e.read().decode("utf-8", "replace")[:400]


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    rota = [r for r in d["routes"] if r["path"] == "/tickets/kanban" and r["method"] == "GET"][0]
    codigo = rota["controllerCode"]
    if MARCA in codigo:
        print("= já aplicado")
        return
    if codigo.count(VELHO) != 1:
        print(f"! âncora aparece {codigo.count(VELHO)}x; revise")
        sys.exit(1)
    novo = codigo.replace(VELHO, NOVO, 1)
    open("/tmp/kanban_quadros.js", "w").write(novo)
    print(f"→ kanban: {len(codigo)} → {len(novo)} caracteres")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return
    corpo = {"method": "GET", "path": "/tickets/kanban", "controllerCode": novo}
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
