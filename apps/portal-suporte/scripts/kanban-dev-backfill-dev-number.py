#!/usr/bin/env python3
# One-shot: preenche dev_ticket_number em cards Dev que só tinham TCK (legado).
#   python3 scripts/kanban-dev-backfill-dev-number.py            # simula
#   python3 scripts/kanban-dev-backfill-dev-number.py --aplicar  # grava via API
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


def req(url, key, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": key}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]


def dev_from_tck(tn):
    tn = str(tn or "")
    if tn.startswith("DEV-"):
        return tn
    if tn.startswith("TCK"):
        n = int(tn[3:])
        return "DEV-" + str(n).zfill(5)
    return None


def main():
    aplicar = "--aplicar" in sys.argv
    api, key = env()
    _, d = req(f"{api}/v1/r/portal-suporte/tickets", key)
    rows = d.get("data", d) if isinstance(d, dict) else d
    if not isinstance(rows, list):
        print("! lista de tickets inesperada")
        sys.exit(1)
    alvos = []
    for t in rows:
        if str(t.get("quadro") or "") != "dev":
            continue
        if t.get("dev_ticket_number") or t.get("devTicketNumber"):
            continue
        dev = dev_from_tck(t.get("ticket_number") or t.get("ticketNumber"))
        if not dev:
            continue
        alvos.append((t["id"], dev, t.get("ticket_number")))
    print(f"cards Dev sem dev_ticket_number: {len(alvos)}")
    for tid, dev, tn in alvos[:20]:
        print(f"  {'→' if aplicar else ' '} {tn} → {dev} ({tid})")
    if len(alvos) > 20:
        print(f"  … +{len(alvos) - 20}")
    if not aplicar or not alvos:
        return
    ok = 0
    for tid, dev, _ in alvos:
        c, _ = req(f"{api}/v1/r/portal-suporte/tickets/{tid}", key, "PATCH", {"dev_ticket_number": dev})
        if c < 300:
            ok += 1
    print(f"✓ atualizados {ok}/{len(alvos)}")


if __name__ == "__main__":
    main()
