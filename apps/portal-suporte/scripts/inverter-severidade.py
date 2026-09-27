#!/usr/bin/env python3
# =============================================================================
# Inverte a escala de severidade dos chamados: P0 passa a ser o mais grave.
#
# POR QUÊ. Hoje `P0 = "Informação"` e `P3 = "Crítico"` — invertido em relação a
# toda convenção de operação E ao `SLASeverity` (P1..P4) que vive no MESMO
# repositório. Alguém que trabalha com suporte lê "P0" como "sistema parado";
# aqui significa o oposto, num selo de 10px, numa tela usada o dia inteiro. É
# risco de triagem, não questão de gosto.
#
# O QUE MUDA. As duas coisas juntas, e é isso que preserva o significado:
#
#   1. o VALOR gravado de cada chamado  (P0<->P3, P1<->P2)
#   2. o RÓTULO em lib/ticket-priority.ts (P0 passa a dizer "Crítico")
#
# Fazer só (2) inverteria o sentido de 427 chamados já classificados. Fazer só
# (1) mostraria "Crítico" onde a pessoa escolheu "Informação". Por isso o script
# recusa rodar se o rótulo do código não estiver no estado esperado.
#
# SEGURANÇA. Grava um backup com o id e a severidade anterior de cada chamado
# ANTES de escrever, e sabe desfazer a partir dele. A troca é sua própria
# inversa, então rodar duas vezes volta ao início — mas o backup existe para
# não depender disso.
#
#   python3 scripts/inverter-severidade.py             # simula
#   python3 scripts/inverter-severidade.py --aplicar   # inverte
#   python3 scripts/inverter-severidade.py --desfazer backups/<arquivo>.json
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TROCA = {"P0": "P3", "P1": "P2", "P2": "P1", "P3": "P0"}
ROTULOS_ESPERADOS = "P0: 'P0 — Informação'"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
RT = f"{API}/v1/r/portal-suporte"


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:200]


def carregar():
    _, d = req(f"{RT}/tickets/kanban")
    data = d.get("data")
    linhas = (
        [t for col in data.values() for t in col]
        if isinstance(data, dict)
        else (data or [])
    )
    return [t for t in linhas if str(t.get("severity") or "").upper() in TROCA]


def escrever(par):
    tid, nova = par
    c, r = req(f"{RT}/tickets/{tid}", "PUT", {"severity": nova})
    return tid, c, r


def main():
    acao = sys.argv[1] if len(sys.argv) > 1 else ""

    # ── Desfazer ──────────────────────────────────────────────────────────────
    if acao == "--desfazer":
        arq = sys.argv[2]
        antigo = json.load(open(arq))
        print(f"→ restaurando {len(antigo)} chamados de {arq}")
        with ThreadPoolExecutor(6) as ex:
            falhas = [
                (i, c, r)
                for i, c, r in ex.map(escrever, [(t["id"], t["severity"]) for t in antigo])
                if c >= 300
            ]
        print(f"   {len(antigo) - len(falhas)} restaurados, {len(falhas)} com falha")
        for f in falhas[:5]:
            print("   ❌", f)
        return

    linhas = carregar()
    from collections import Counter

    antes = Counter(str(t["severity"]).upper() for t in linhas)
    print("→ severidade hoje:", dict(sorted(antes.items())))
    print("→ depois        :", dict(sorted(Counter(TROCA[k] for k, n in antes.items() for _ in range(n)).items())))
    print(f"→ chamados afetados: {len(linhas)}")

    # Guarda de estado: se o rótulo já foi invertido antes, rodar de novo
    # desfaria em silêncio o trabalho anterior.
    fonte = open(os.path.join(RAIZ, "app/lib/ticket-priority.ts"), encoding="utf-8").read()
    if ROTULOS_ESPERADOS not in fonte:
        sys.exit(
            "❌ os rótulos em lib/ticket-priority.ts não estão no estado original.\n"
            "   A inversão provavelmente já foi aplicada — abortando para não desfazê-la."
        )

    if acao != "--aplicar":
        print("\n   (simulação — use --aplicar)")
        return

    os.makedirs(os.path.join(RAIZ, "backups"), exist_ok=True)
    destino = os.path.join(RAIZ, "backups", f"severidade-antes-{len(linhas)}.json")
    json.dump(
        [{"id": t["id"], "severity": str(t["severity"]).upper()} for t in linhas],
        open(destino, "w"),
        indent=1,
    )
    print(f"→ backup: {destino}")

    pares = [(t["id"], TROCA[str(t["severity"]).upper()]) for t in linhas]
    with ThreadPoolExecutor(6) as ex:
        resultados = list(ex.map(escrever, pares))
    falhas = [r for r in resultados if r[1] >= 300]
    print(f"→ {len(resultados) - len(falhas)} atualizados, {len(falhas)} com falha")
    for f in falhas[:5]:
        print("   ❌", f)
    if falhas:
        print(f"   desfazer:  python3 scripts/inverter-severidade.py --desfazer {destino}")
        sys.exit(1)

    depois = Counter(str(t["severity"]).upper() for t in carregar())
    print("→ conferência:", dict(sorted(depois.items())))


if __name__ == "__main__":
    main()
