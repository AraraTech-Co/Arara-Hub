#!/usr/bin/env python3
# =============================================================================
# Migração: cards Dev em `em_revisao` → `desenvolvimento_finalizado`.
#
# A coluna Em Revisão saiu do quadro (25/09/2026). Cards que estavam nela
# voltam para Dev Finalizado e, na próxima ida a Pronto p/ Teste, escolhem HML.
#
#   python3 scripts/kanban-dev-migrar-em-revisao.py            # simula
#   python3 scripts/kanban-dev-migrar-em-revisao.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/kanban-dev-migrar-em-revisao.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
APP = f"{API}/v1/apps/portal-suporte"


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
        return e.code, e.read().decode("utf-8", "replace")[:400]


def main():
    aplicar = "--aplicar" in sys.argv
    c, d = req(f"{APP}/models/Ticket/records?limit=5000")
    if c >= 300:
        # fallback listagem genérica
        c, d = req(f"{APP}/data/Ticket?limit=5000")
    if c >= 300:
        print(f"❌ listar tickets HTTP {c} {d}")
        sys.exit(1)

    rows = d.get("data") or d.get("records") or d.get("items") or []
    if isinstance(d, list):
        rows = d
    alvos = [
        t for t in rows
        if str(t.get("quadro") or "suporte") == "dev"
        and str(t.get("status") or "") == "em_revisao"
    ]
    print(f"   {len(alvos)} card(s) em em_revisao")
    if not alvos:
        return
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    for t in alvos:
        tid = t.get("id")
        num = t.get("ticket_number") or tid
        print(f"   {'→' if aplicar else ' '} {num} → desenvolvimento_finalizado")
        if not aplicar:
            continue
        cc, resp = req(f"{APP}/models/Ticket/records/{tid}", "PATCH", {
            "status": "desenvolvimento_finalizado",
            "updated_at": now,
        })
        if cc >= 300:
            cc, resp = req(f"{APP}/data/Ticket/{tid}", "PATCH", {
                "status": "desenvolvimento_finalizado",
                "updated_at": now,
            })
        if cc >= 300:
            print(f"      ❌ {num}: HTTP {cc} {resp}")
            sys.exit(1)
    if not aplicar:
        print("\n   (simulação — use --aplicar)")


if __name__ == "__main__":
    main()
