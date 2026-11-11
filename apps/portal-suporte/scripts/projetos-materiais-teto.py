#!/usr/bin/env python3
# =============================================================================
# Teto dos materiais do projeto: 100 MB (11/11/2026, pedido do Leonardo).
#
# Edita só o literal de `POST /projetos/:id/materiais` no routes.generated.ts:
# o teto e a mensagem de recusa, que passa a ser montada a partir do teto. O
# scripts/projetos-materiais.py já gera com o teto novo, mas regenerar as
# quatro rotas de materiais passaria por cima do que outros scripts gravaram
# nelas depois (a guarda de sessão, a regra do desativado).
#
#   python3 scripts/projetos-materiais-teto.py            # simula
#   python3 scripts/projetos-materiais-teto.py --gravar   # grava
# =============================================================================

import argparse
import importlib.util
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ = os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
ROTA = ("POST", "/projetos/:id/materiais")

_spec = importlib.util.spec_from_file_location("_ds", os.path.join(RAIZ, "scripts", "desativado-sem-acesso.py"))
_ds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ds)

_pm_src = open(os.path.join(RAIZ, "scripts", "projetos-materiais.py"), encoding="utf-8").read()
# O mesmo texto que o gerador põe, lido dele: uma cópia aqui ficaria para trás.
TETO = re.search(r'TETO_MATERIAIS = \(\n((?:    ".*"\n)+)\)', _pm_src)
if not TETO:
    sys.exit("❌ não achei TETO_MATERIAIS no projetos-materiais.py")
TETO_MATERIAIS = "".join(json.loads(l.strip()) for l in TETO.group(1).splitlines())

TROCAS = [
    ("var MAX_BYTES = 10 * 1024 * 1024;", TETO_MATERIAIS),
    ('      error: "Material acima do limite de 10 MB (este tem " + (Math.round(bytes / 104857.6) / 10) + " MB).",',
     '      error: "Material acima do limite de " + Math.round(MAX_BYTES / 1048576) + " MB (este tem " + (Math.round(bytes / 104857.6) / 10) + " MB).",'),
]


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
    if "var MAX_BYTES = 100 * 1024 * 1024;" in codigo:
        print("   já aplicado")
        return
    asc = "\\u00" in enc or "\\u2" in enc
    novo, esperado = enc, codigo
    for de, para in TROCAS:
        if esperado.count(de) != 1:
            sys.exit("❌ âncora fora do formato esperado: " + de[:60] + " — nada foi gravado")
        novo = _ds.troca_codificada(novo, de, para, asc)
        esperado = esperado.replace(de, para)
        if novo is None:
            sys.exit("❌ âncora codificada não casou: " + de[:60] + " — nada foi gravado")
    if json.loads('"' + novo + '"') != esperado:
        sys.exit("❌ a edição codificada não bate com a pretendida — nada foi gravado")
    print(f"   {' '.join(ROTA)}: {len(TROCAS)} trocas")
    if not a.gravar:
        print("   (simulação — use --gravar)")
        return
    open(ARQ, "w", encoding="utf-8").write(texto[:m.start(2)] + novo + texto[m.end(2):])
    print("   gravado")


if __name__ == "__main__":
    main()
