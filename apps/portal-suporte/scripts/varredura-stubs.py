#!/usr/bin/env python3
# =============================================================================
# Procura controllers que ainda são o esqueleto gerado na integração.
#
# Em 08/09/2026 três defeitos do mesmo tipo apareceram no mesmo dia:
#
#   POST /tickets/bulk-action   fazia `model.create(body)` — cada ação em lote
#                               criava um chamado sem título, e a tela dizia
#                               "N atualizados" porque conta o que ENVIOU.
#   PATCH /tickets/:id/archive  recebe corpo vazio da tela e faz `update(id, {})`
#   POST /cron/worker           devolve 501 e ninguém sabia
#
# O que une os três: **falham em silêncio**. A tela confirma sucesso, o servidor
# não fez nada, e ninguém percebe até o efeito colateral aparecer semanas
# depois — no caso do bulk-action, trinta cards em branco no quadro.
#
# Três assinaturas procuradas:
#
#   501     o esqueleto que se declara não implementado
#   VERBO   caminho termina em AÇÃO mas o corpo faz CRUD genérico — o caso do
#           bulk-action, e o mais perigoso, porque responde 200
#   MODELO  CRUD genérico lendo um model sem relação com o caminho (a rota
#           /uptime devolvendo lista de Ticket, por exemplo)
#
# Não conserta e não decide: aponta onde olhar. Falso positivo aqui é barato;
# falso negativo custou trinta cards.
#
#   python3 scripts/varredura-stubs.py            # resumo
#   python3 scripts/varredura-stubs.py --detalhe  # com a primeira linha do corpo
# =============================================================================

import json
import os
import re
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


API, KEY = env()
APP = f"{API}/v1/apps/portal-suporte"

ACOES = {
    "action", "bulk-action", "assign", "escalate", "escalar-dev", "move", "reorder",
    "archive", "restore", "approve", "reject", "start", "complete", "fail",
    "schedule", "submit", "cancel", "send", "sync", "test", "enable", "disable",
    "execute", "restart", "stop", "reboot", "connect", "train", "triage",
    "embed-all", "impersonate", "resolve", "close", "reopen", "mover",
}


def modelos_usados(codigo):
    return set(re.findall(r"ctx\.models\.(\w+)", codigo))


def sem_comentarios(codigo):
    """Tira comentários antes de analisar.

    Sem isto a varredura acusa o que ela mesma ajudou a consertar: o comentário
    que explica "isto ANTES fazia model.create(body)" casa com o padrão que
    procura `model.create(body)`. Gritar lobo tira a credibilidade da lista, e
    lista sem credibilidade ninguém lê.
    """
    codigo = re.sub(r"/\*.*?\*/", "", codigo, flags=re.S)
    return "\n".join(l for l in codigo.splitlines() if not l.strip().startswith("//"))


def crud_generico(corpo):
    return bool(re.search(r"findMany\(\s*filter\s*\)", corpo)) and "reply.send({ data" in corpo


def req(url):
    r = urllib.request.Request(url, headers={"x-api-key": KEY})
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, None


def main():
    detalhe = "--detalhe" in sys.argv
    c, d = req(f"{APP}/modules")
    if c >= 300:
        print(f"HTTP {c}")
        sys.exit(1)

    achados = {"501": [], "MODELO": [], "VERBO": []}
    total = 0
    for m in d["modules"]:
        mod = m["name"]
        c, dd = req(f"{APP}/modules/{mod}/routes")
        if c >= 300 or not dd:
            continue
        for r in dd.get("routes", []):
            total += 1
            codigo = r.get("controllerCode") or ""
            corpo = sem_comentarios(codigo.split("// ── Guarda de sessão")[0])
            onde = f"{mod:28} {r['method']:6} {r['path']}"

            if "status(501" in corpo or "não implementada" in corpo:
                achados["501"].append((onde, corpo))
                continue

            ultimo = r["path"].rstrip("/").split("/")[-1]
            if ultimo in ACOES and (crud_generico(corpo) or re.search(r"\.create\(\s*body\s*\)", corpo)):
                achados["VERBO"].append((onde, corpo))
                continue

            if crud_generico(corpo):
                usados = modelos_usados(corpo)
                partes = r["path"].split("/")
                seg = re.sub(r"[^a-z]", "", partes[1].lower()) if len(partes) > 1 else ""
                if usados and len(seg) >= 4 and not any(seg[:4] in u.lower() for u in usados):
                    achados["MODELO"].append((onde, corpo))

    print(f"\n   {total} rotas varridas\n")
    titulos = {
        "501": "Declaram-se NAO IMPLEMENTADAS (501)",
        "VERBO": "Caminho e ACAO, corpo e CRUD generico - o caso do bulk-action",
        "MODELO": "CRUD generico lendo model sem relacao com o caminho",
    }
    for chave in ("VERBO", "501", "MODELO"):
        lista = achados[chave]
        print(f"-- {titulos[chave]}: {len(lista)}")
        for onde, corpo in lista:
            print(f"     {onde}")
            if detalhe:
                for l in corpo.splitlines():
                    t = l.strip()
                    if t and not t.startswith("//") and "async function" not in t:
                        print(f"        {t[:100]}")
                        break
        print()


if __name__ == "__main__":
    main()
