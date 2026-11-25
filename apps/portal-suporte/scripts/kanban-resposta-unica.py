#!/usr/bin/env python3
# =============================================================================
# GET /tickets/kanban manda a lista de cards uma vez só (25/11/2026).
#
# A resposta levava os mesmos cards em três campos: `data` (por coluna),
# `columns` (o mesmo objeto) e `tickets` (lista corrida). Quem lê:
#   - quadro de Suporte (carga e atualização de 30 s), busca por pergunta e
#     scripts/inverter-severidade.py → `data`;
#   - Kanban Dev e o diálogo de vincular cards a projeto (`?quadro=dev`) → `tickets`;
#   - `columns` → ninguém.
# Agora o quadro Dev recebe só `tickets`, os outros só `data`. `count` e as
# contagens de ocultos continuam nos dois.
#
#   python3 scripts/kanban-resposta-unica.py            # simula
#   python3 scripts/kanban-resposta-unica.py --gravar   # grava
# =============================================================================

import argparse
import importlib.util
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ = os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
ROTA = ("GET", "/tickets/kanban")

_spec = importlib.util.spec_from_file_location("_ds", os.path.join(RAIZ, "scripts", "desativado-sem-acesso.py"))
_ds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ds)

ANTIGA = (
    "  return ctx.reply.send({ data: columns, tickets: lista, columns: columns, count: lista.length, "
    "fechados_ocultos: _fechadosOcultos, aplicados_ocultos: _aplicadosOcultos });\n"
)
NOVA = (
    "  // A lista vai UMA vez (25/11/2026): o quadro Dev lê `tickets`, os outros\n"
    "  // leitores leem `data` (por coluna). Antes iam os dois e mais `columns`, que\n"
    "  // ninguém lê — a mesma lista três vezes na resposta.\n"
    "  var _resposta = { count: lista.length, fechados_ocultos: _fechadosOcultos, aplicados_ocultos: _aplicadosOcultos };\n"
    "  if (_quadro === \"dev\") _resposta.tickets = lista;\n"
    "  else _resposta.data = columns;\n"
    "  return ctx.reply.send(_resposta);\n"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true")
    a = ap.parse_args()
    texto = open(ARQ, encoding="utf-8").read()
    alvos = []
    for m in _ds.RE_ENTRADA.finditer(texto):
        met = re.search(r'method:\s*"([^"]+)"', m.group(1))
        cam = re.search(r'path:\s*"([^"]+)"', m.group(1))
        if met and cam and (met.group(1), cam.group(1)) == ROTA:
            alvos.append(m)
    if len(alvos) != 1:
        sys.exit(f"❌ a rota aparece {len(alvos)} vez(es); nada foi gravado")
    m = alvos[0]
    enc = m.group(2)
    codigo = json.loads('"' + enc + '"')
    if NOVA in codigo:
        print("   já aplicado")
        return
    if codigo.count(ANTIGA) != 1 or "_resposta" in codigo:
        sys.exit("❌ resposta da rota fora do formato esperado — nada foi gravado")
    asc = "\\u00" in enc or "\\u2" in enc
    novo = _ds.troca_codificada(enc, ANTIGA, NOVA, asc)
    if novo is None or json.loads('"' + novo + '"') != codigo.replace(ANTIGA, NOVA):
        sys.exit("❌ a edição codificada não bate com a pretendida — nada foi gravado")
    print(f"   {' '.join(ROTA)}: a lista vai uma vez só")
    if not a.gravar:
        print("   (simulação — use --gravar)")
        return
    open(ARQ, "w", encoding="utf-8").write(texto[:m.start(2)] + novo + texto[m.end(2):])
    print("   gravado")


if __name__ == "__main__":
    main()
