#!/usr/bin/env python3
# =============================================================================
# Confere o perímetro: varre TODAS as rotas publicadas e diz quantas exigem
# sessão de pessoa, quantas ficaram de fora e por quê.
#
# É o contraponto do scripts/guarda-sessao.py — um aplica, o outro audita. Vale
# rodar depois de criar rota nova: rota sem guarda volta a aparecer aqui.
#
#   python3 scripts/conferir-guarda.py
#   python3 scripts/conferir-guarda.py --detalhe    # lista rota a rota
# =============================================================================

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/guarda-sessao.py"
FORA = {"auth", "health", "uptime", "rate", "cron", "webhooks", "external", "api"}


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


def get(url):
    r = urllib.request.Request(url, headers={"x-api-key": KEY})
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--detalhe", action="store_true")
    a = p.parse_args()

    c, d = get(f"{APP}/modules")
    if c >= 300:
        print(f"❌ HTTP {c} ao listar módulos")
        sys.exit(1)

    cnt = Counter()
    abertas = defaultdict(list)
    for m in d["modules"]:
        mod = m["name"]
        c, dd = get(f"{APP}/modules/{mod}/routes")
        if c >= 300:
            print(f"   ❌ {mod}: HTTP {c}")
            continue
        for r in dd.get("routes", []):
            codigo = r.get("controllerCode") or ""
            if r.get("authMode") == "webhook_secret":
                cnt["público deliberado (webhook_secret)"] += 1
            elif MARCA in codigo:
                cnt["exige sessão"] += 1
            elif mod in FORA:
                cnt["fora da política (máquina/porta de entrada)"] += 1
            else:
                cnt["SEM GUARDA"] += 1
                abertas[mod].append(f"{r.get('method')} {r.get('path')}")

    total = sum(cnt.values())
    print(f"\n   {total} rotas publicadas\n")
    for k, n in cnt.most_common():
        print(f"   {n:5}  {k}")

    if abertas:
        print("\n   ⚠ rotas sem guarda:")
        for mod, rotas in sorted(abertas.items()):
            print(f"      {mod} ({len(rotas)})")
            if a.detalhe:
                for x in rotas:
                    print(f"         {x}")
        sys.exit(1)
    print("\n   ✓ nenhuma rota de negócio responde sem sessão")


if __name__ == "__main__":
    main()
