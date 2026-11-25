#!/usr/bin/env python3
# =============================================================================
# Kanban Dev: card em "Aplicado no cliente" há mais de uma semana sai do quadro
# (25/11/2026).
#
# Edita só o literal de GET /tickets/kanban. Com `?quadro=dev`, o card em
# `aplicado_no_cliente` cuja aplicação (`resolved_at`, gravado na entrada da
# coluna; sem ele, `updated_at`) tem mais de 7 dias não vai na resposta; o total
# sai em `aplicados_ocultos`. `?arquivados=1` devolve todos, para o botão
# "Arquivados" da tela.
#
# Nada é gravado: é a mesma ideia do teto nos fechados do quadro de Suporte, logo
# acima na rota. O quadro de Suporte, que lê os cards Dev para mostrar quem
# assumiu e o prazo, usa a leitura de antes do filtro por quadro e não muda.
#
#   python3 scripts/kanban-dev-aplicados-arquivados.py            # simula
#   python3 scripts/kanban-dev-aplicados-arquivados.py --gravar   # grava
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

MARCA = "// ── Aplicados arquivados (25/11/2026) ──"

ANCORA_FILTRO = "\n\n  // ── Pessoas ────"
BLOCO = (
    "\n\n  " + MARCA + "\n"
    "  // No quadro Dev, o card aplicado no cliente há mais de uma semana sai do\n"
    "  // quadro: a coluna só cresce e pesava a resposta e a tela. Conta pela data\n"
    "  // da aplicação (`resolved_at`, gravado ao entrar na coluna); sem ela, pela\n"
    "  // última mudança. Sem data legível, o card fica. `?arquivados=1` devolve\n"
    "  // todos (botão \"Arquivados\" da tela). Nada é gravado.\n"
    "  var _aplicadosOcultos = 0;\n"
    "  var _UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;\n"
    "  if (_quadro === \"dev\" && String((ctx.query && ctx.query.arquivados) || \"\") !== \"1\") {\n"
    "    var _corteAplicados = Date.now() - _UMA_SEMANA_MS;\n"
    "    rows = rows.filter(function (t) {\n"
    "      if (String(t.status) !== \"aplicado_no_cliente\") return true;\n"
    "      var _quando = new Date(t.resolved_at || t.resolvedAt || t.updated_at || t.updatedAt || \"\").getTime();\n"
    "      if (!isFinite(_quando) || _quando >= _corteAplicados) return true;\n"
    "      _aplicadosOcultos++;\n"
    "      return false;\n"
    "    });\n"
    "  }"
)

RESPOSTA_ANTIGA = "fechados_ocultos: _fechadosOcultos })"
RESPOSTA_NOVA = "fechados_ocultos: _fechadosOcultos, aplicados_ocultos: _aplicadosOcultos })"


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
    if MARCA in codigo:
        print("   já aplicado")
        return
    # O bloco entra depois do teto dos fechados e antes de "Pessoas": `rows` já
    # está filtrado pelo quadro ali.
    if codigo.count(ANCORA_FILTRO) != 1 or codigo.index(ANCORA_FILTRO) < codigo.find("_fechadosOcultos = _fechados.length - 50"):
        sys.exit("❌ âncora do filtro fora do formato esperado — nada foi gravado")
    if codigo.count(RESPOSTA_ANTIGA) != 1:
        sys.exit("❌ resposta da rota fora do formato esperado — nada foi gravado")
    if "_aplicadosOcultos" in codigo or "_UMA_SEMANA_MS" in codigo:
        sys.exit("❌ nome já usado no literal — nada foi gravado")
    asc = "\\u00" in enc or "\\u2" in enc
    novo, esperado = enc, codigo
    for de, para in [(ANCORA_FILTRO, BLOCO + ANCORA_FILTRO), (RESPOSTA_ANTIGA, RESPOSTA_NOVA)]:
        novo = _ds.troca_codificada(novo, de, para, asc)
        esperado = esperado.replace(de, para)
        if novo is None:
            sys.exit("❌ âncora codificada não casou: " + de[:60] + " — nada foi gravado")
    if json.loads('"' + novo + '"') != esperado:
        sys.exit("❌ a edição codificada não bate com a pretendida — nada foi gravado")
    print(f"   {' '.join(ROTA)}: aplicados há mais de uma semana fora do quadro Dev")
    if not a.gravar:
        print("   (simulação — use --gravar)")
        return
    open(ARQ, "w", encoding="utf-8").write(texto[:m.start(2)] + novo + texto[m.end(2):])
    print("   gravado")


if __name__ == "__main__":
    main()
