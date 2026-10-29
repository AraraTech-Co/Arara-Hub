#!/usr/bin/env python3
# =============================================================================
# Quem planeja vê — nos 21 handlers do módulo `projetos`.
#
# Decisão do Leonardo (29/10/2026): "libera a lista". O grant `planejamento`
# abria o POST e o PATCH de atividade e NÃO abria a listagem, porque a 507 passa
# só por `_podeVer`. A pessoa criava atividade e não conseguia ver nenhuma.
#
# Mesmo caminho da troca de porta da etapa 3: o corpo novo é lido do
# `_projetos_comum.py`, que é a fonte, e trocado nos 21 handlers por âncora de
# ocorrência única. O script recusa se não encontrar exatamente os 21 — trocar
# parte do módulo deixaria rotas do mesmo módulo com portas diferentes.
#
#   python3 scripts/projetos-planejar-implica-ver.py            # simula
#   python3 scripts/projetos-planejar-implica-ver.py --aplicar
# =============================================================================

import ast
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
COMUM_PY = os.path.join(AQUI, "_projetos_comum.py")
ROTAS = os.path.abspath(os.path.join(
    AQUI, "..", "..", "..", "packages", "api", "src", "apps", "portal-suporte",
    "routes.generated.ts"))

# O corpo que SAI, escrito por extenso: é o que se procura, e se um dia não
# casar mais 21 vezes o script tem de parar em vez de adivinhar.
ANTIGO = (
    'function _podeVer(eu) {\n'
    '  if (eu.servico) return true;\n'
    '  if (eu.nivel >= _RANK.admin) return true;\n'
    '  if (eu.grants.indexOf("projetos") >= 0) return true;\n'
    '  if (!_PORTA_ANTIGA_DE_PROJETOS) return false;\n'
    '  return eu.nivel >= _RANK.developer || eu.grants.indexOf("qa") >= 0;\n'
    '}'
)
QUANTOS = 21


def comum():
    arvore = ast.parse(open(COMUM_PY, encoding="utf-8").read())
    for no in arvore.body:
        if isinstance(no, ast.Assign) and getattr(no.targets[0], "id", "") == "COMUM":
            return no.value.value
    raise SystemExit("! COMUM não encontrado em _projetos_comum.py")


def novo_corpo(texto):
    """A função `_podeVer` inteira, recortada do bloco comum."""
    abre = "function _podeVer(eu) {"
    if texto.count(abre) != 1:
        raise SystemExit(f"! `_podeVer` aparece {texto.count(abre)}x no COMUM")
    i = texto.index(abre)
    fecho = texto.index("\n}", i)
    bloco = texto[i:fecho + 2]
    for exigido in ('eu.grants.indexOf("planejamento") >= 0',
                    '_PORTA_ANTIGA_DE_PROJETOS',
                    'eu.grants.indexOf("qa") >= 0'):
        if exigido not in bloco:
            raise SystemExit(f"! o corpo novo não tem {exigido!r}:\n{bloco}")
    # A liberação de quem planeja TEM de vir antes da conferência da transição,
    # senão ela deixa de valer no dia em que a porta antiga for desligada.
    if bloco.index('indexOf("planejamento")') > bloco.index("_PORTA_ANTIGA_DE_PROJETOS"):
        raise SystemExit("! `planejamento` ficaria depois da conferência da transição")
    if bloco.count("function") != 1:
        raise SystemExit(f"! o recorte pegou mais de uma função:\n{bloco}")
    return bloco


def entradas(texto):
    fora = []
    for parte in texto.split("\n  // ")[1:]:
        fora.append((parte.split("\n", 1)[0], parte))
    return fora


def main():
    aplicar = "--aplicar" in sys.argv
    bloco = novo_corpo(comum())
    de = json.dumps(ANTIGO)[1:-1]
    para = json.dumps(bloco)[1:-1]

    texto = open(ROTAS, encoding="utf-8").read()
    if texto.count(de) == 0 and texto.count(para) == QUANTOS:
        print(f"   = já aplicado nos {QUANTOS} handlers")
        return
    if texto.count(de) != QUANTOS:
        raise SystemExit(
            f"! o corpo antigo aparece {texto.count(de)}x, esperado {QUANTOS}")
    if texto.count(para):
        raise SystemExit(f"! o corpo novo já aparece {texto.count(para)}x com o antigo presente")

    alheios = [m for m, t in entradas(texto) if de in t and " projetos " not in f" {m} "]
    if alheios:
        raise SystemExit(f"! o corpo antigo aparece fora do módulo projetos: {alheios}")

    novo = texto.replace(de, para)
    if novo.count(para) != QUANTOS or de in novo:
        raise SystemExit("! a troca não fechou a conta")

    if not aplicar:
        print(f"   → liberaria a listagem em {QUANTOS} handlers do módulo projetos")
        print("\n   (simulação — use --aplicar)")
        return
    open(ROTAS, "w", encoding="utf-8").write(novo)
    print(f"→ quem planeja vê, em {QUANTOS} handlers")


if __name__ == "__main__":
    main()
