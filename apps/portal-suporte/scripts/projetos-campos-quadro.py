#!/usr/bin/env python3
# =============================================================================
# Módulo de Projetos — Entrega 1, passo 3: os campos novos na resposta do quadro.
#
# A rota GET /tickets/kanban devolve uma lista ENXUTA de campos desde 24/08
# (2,7 MB → 625 KB, ~2,7 s → ~1,3 s). Campo que não estiver nessa lista
# simplesmente não chega à tela — então os cinco campos de planejamento
# precisam entrar explicitamente. É também a razão de o ganho não se perder:
# nada entra na resposta por acidente.
#
# MEDIDO ANTES (25/08, 3 chamadas, melhor tempo):
#   GET /tickets/kanban            1,25 s · 625 KB
#   GET /tickets/kanban?quadro=dev 0,84 s ·  43 KB
#
#   python3 scripts/projetos-campos-quadro.py            # simula
#   python3 scripts/projetos-campos-quadro.py --aplicar
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/projetos-campos-quadro.py"


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

VELHO = '"previsao_entrega","esforco_entrega","declaracoes","unit_id","attachment_count","resolved_at"];'
# Aceita também a âncora com environment (HML) já na lista do performance script.
VELHO_COM_ENV = (
    '"pull_request_url","quadro","origem_ticket_id","migrado","version","environment",\n'
    '  "previsao_entrega","esforco_entrega","declaracoes","unit_id","attachment_count","resolved_at"];'
)
NOVO = ('"previsao_entrega","esforco_entrega","declaracoes","unit_id","attachment_count","resolved_at",\n'
        '  // Planejamento (%s): `previsao_entrega`, logo acima, JÁ é o fim planejado.\n'
        '  "projeto_id","fase_id","inicio_planejado","estimativa_min","progresso"];' % MARCA)
NOVO_COM_ENV = (
    '"pull_request_url","quadro","origem_ticket_id","migrado","version","environment",\n'
    '  "previsao_entrega","esforco_entrega","declaracoes","unit_id","attachment_count","resolved_at",\n'
    '  // Planejamento (%s): `previsao_entrega`, logo acima, JÁ é o fim planejado.\n'
    '  "projeto_id","fase_id","inicio_planejado","estimativa_min","progresso"];' % MARCA
)


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
    cod = rota["controllerCode"]
    if MARCA in cod:
        print("= já aplicado")
        return
    if cod.count(VELHO_COM_ENV) == 1:
        velho, novo = VELHO_COM_ENV, NOVO_COM_ENV
    elif cod.count(VELHO) == 1:
        velho, novo = VELHO, NOVO
    else:
        print(f"! âncora não achada (VELHO={cod.count(VELHO)}x, VELHO_COM_ENV={cod.count(VELHO_COM_ENV)}x)")
        sys.exit(1)
    novo_cod = cod.replace(velho, novo, 1)
    open("/tmp/kanban_campos_projeto.js", "w").write(novo_cod)
    if subprocess.run(["node", "--check", "/tmp/kanban_campos_projeto.js"]).returncode != 0:
        sys.exit(1)
    print(f"→ /tickets/kanban: +5 campos de planejamento ({len(cod)} → {len(novo_cod)} chars)")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return
    corpo = {"method": "GET", "path": "/tickets/kanban", "controllerCode": novo_cod}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    c, r = req(f"{MOD}/routes", "PUT", corpo)
    print(f"→ gravar: HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar tickets: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
