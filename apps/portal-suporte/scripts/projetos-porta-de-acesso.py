#!/usr/bin/env python3
# =============================================================================
# Módulo de Projetos — a porta de VER o módulo.
#
# Decisão do Leonardo (28/10/2026): o acesso ao módulo é o campo "Projetos" em
# Editar membro — sem concessão automática por cargo e sem o grant de QA
# valendo como passe. Adm e master continuam vendo tudo por nível.
#
# POR QUE ESTE SCRIPT EXISTE, E NÃO UMA REGENERAÇÃO INTEIRA:
# `routes.generated.ts` nasce do codegen a partir de
# `packages/api/data/exports/<slug>/routes.json`, que é gitignored — não dá para
# regenerar aqui. E `projetos-regras.py --aplicar` reescreve TODOS os handlers
# do módulo a partir do bloco comum, o que hoje removeria `em_revisao` do `_PCT`
# que produção tem (divergência conhecida, conserto próprio). Então a troca é
# cirúrgica: o corpo ANTIGO de `_podeVer`, que é idêntico nos 21 handlers do
# módulo, dá lugar ao corpo NOVO, lido do próprio `_projetos_comum.py`.
#
# O corpo novo não é escrito aqui de propósito: duas cópias da mesma régua
# divergem no dia em que uma delas vira. A fonte é o arquivo comum.
#
#   python3 scripts/projetos-porta-de-acesso.py            # simula
#   python3 scripts/projetos-porta-de-acesso.py --aplicar   # grava o arquivo
#
# (`--aplicar` aqui grava APENAS o arquivo do repositório. Não fala com a
# plataforma, não publica nada: quem publica é o deploy, pelo merge em master.)
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

# O corpo que sai. Escrito por extenso porque é o que se procura: se um dia ele
# não casar mais 21 vezes, o script tem de parar, não adivinhar.
ANTIGO = (
    'function _podeVer(eu) {\n'
    '  return eu.servico || eu.nivel >= _RANK.developer'
    ' || eu.grants.indexOf("qa") >= 0;\n'
    '}'
)
QUANTOS = 21  # os 21 handlers do módulo `projetos` (287–304 e 507–509)


def comum():
    arvore = ast.parse(open(COMUM_PY, encoding="utf-8").read())
    for no in arvore.body:
        if isinstance(no, ast.Assign) and getattr(no.targets[0], "id", "") == "COMUM":
            return no.value.value
    raise SystemExit("! COMUM não encontrado em _projetos_comum.py")


def novo_corpo(texto):
    """Do `var _PORTA_ANTIGA_DE_PROJETOS` até o fecho de `_podeVer`.

    Recorte por âncora de ocorrência única nas duas pontas. O fecho é o
    primeiro `\\n}` depois da abertura da função — o corpo não tem bloco
    aninhado, e se algum dia tiver, a conferência abaixo reprova.
    """
    abre = "var _PORTA_ANTIGA_DE_PROJETOS = true;"
    assina = "function _podeVer(eu) {"
    for a in (abre, assina):
        if texto.count(a) != 1:
            raise SystemExit(f"! âncora não é única no COMUM: {a!r} ({texto.count(a)}x)")
    i = texto.index(abre)
    j = texto.index(assina, i)
    fecho = texto.index("\n}", j)
    bloco = texto[i:fecho + 2]
    # O que se promete sobre o bloco recortado, conferido e não suposto.
    exigidos = [
        '_RANK.admin',
        'eu.grants.indexOf("projetos") >= 0',
        'if (!_PORTA_ANTIGA_DE_PROJETOS) return false;',
        '_RANK.developer',
        'eu.grants.indexOf("qa") >= 0',
    ]
    for e in exigidos:
        if e not in bloco:
            raise SystemExit(f"! o bloco recortado não tem {e!r}:\n{bloco}")
    if bloco.count("function") != 1:
        raise SystemExit(f"! o recorte pegou mais de uma função:\n{bloco}")
    return bloco


def entradas_do_arquivo(texto):
    """(marca, trecho) de cada handler, pela linha de comentário numerada."""
    fora = []
    partes = texto.split("\n  // ")
    for parte in partes[1:]:
        fora.append((parte.split("\n", 1)[0], parte))
    return fora


def main():
    aplicar = "--aplicar" in sys.argv
    bloco = novo_corpo(comum())
    # No arquivo gerado o handler é uma STRING: o corpo aparece escapado.
    de = json.dumps(ANTIGO)[1:-1]
    para = json.dumps(bloco)[1:-1]

    texto = open(ROTAS, encoding="utf-8").read()
    tem_antigo = texto.count(de)
    tem_novo = texto.count(para)

    if tem_antigo == 0 and tem_novo == QUANTOS:
        print(f"   = porta já trocada nos {QUANTOS} handlers — nada a fazer")
        return
    if tem_antigo != QUANTOS:
        raise SystemExit(
            f"! o corpo antigo aparece {tem_antigo}x, esperado {QUANTOS}. "
            "Parando: trocar menos (ou mais) que o módulo inteiro deixaria "
            "rotas do mesmo módulo com portas diferentes.")
    if tem_novo:
        raise SystemExit(f"! o corpo novo já aparece {tem_novo}x com o antigo presente")

    # Só os handlers do módulo `projetos` podem ter o corpo antigo. Outros
    # módulos têm `_podeVer` próprio, com outro corpo — se um deles casar, o
    # script para em vez de mudar a permissão de um módulo que não é este.
    alheios = [m for m, t in entradas_do_arquivo(texto)
               if de in t and " projetos " not in f" {m} "]
    if alheios:
        raise SystemExit(f"! o corpo antigo aparece fora do módulo projetos: {alheios}")

    novo = texto.replace(de, para)
    if novo.count(para) != QUANTOS or de in novo:
        raise SystemExit("! a troca não fechou a conta")

    if not aplicar:
        print(f"   → trocaria a porta em {QUANTOS} handlers do módulo projetos")
        print("\n   (simulação — use --aplicar)")
        return
    open(ROTAS, "w", encoding="utf-8").write(novo)
    print(f"→ porta trocada em {QUANTOS} handlers")


if __name__ == "__main__":
    main()
