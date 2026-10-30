#!/usr/bin/env python3
# =============================================================================
# A porta do módulo `projetos` passa a ser só o campo "Projetos" em Editar
# membro — nos 21 handlers do módulo.
#
# Decisão do Leonardo (30/10/2026): "libera projetos para todos os membros, mas
# quem vai ter acesso aos projetos é na área de membros que eu decido,
# selecionando as caixas e dando permissão".
#
# É o dia da troca que a etapa 3 deixou preparado: `_PORTA_ANTIGA_DE_PROJETOS`
# some junto com a porta antiga (developer+ por cargo, ou o grant `qa` como
# passe). Quem entrava por cargo e ainda não tem o campo marcado perde o módulo
# no deploy — é o combinado.
#
# O corpo novo é lido do `_projetos_comum.py`, que é a fonte. O corpo ANTIGO é
# recortado do próprio arquivo de rotas, não copiado para cá: copiá-lo à mão já
# falhou uma vez, porque o corpo no ar carrega os comentários dentro da função e
# a cópia sem eles não casava nada. O que o script exige é que o corpo recortado
# seja mesmo o anterior — ele tem de falar da porta de transição — e que apareça
# nos 21 handlers. Trocar parte do módulo deixaria rotas do mesmo módulo com
# portas diferentes, que é pior do que não mexer.
#
#   python3 scripts/projetos-porta-so-pelo-campo.py            # simula
#   python3 scripts/projetos-porta-so-pelo-campo.py --aplicar
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

ABRE = "function _podeVer(eu) {"
QUANTOS = 21


def comum():
    arvore = ast.parse(open(COMUM_PY, encoding="utf-8").read())
    for no in arvore.body:
        if isinstance(no, ast.Assign) and getattr(no.targets[0], "id", "") == "COMUM":
            return no.value.value
    raise SystemExit("! COMUM não encontrado em _projetos_comum.py")


def funcao(texto, abre):
    if texto.count(abre) != 1:
        raise SystemExit(f"! {abre!r} aparece {texto.count(abre)}x")
    i = texto.index(abre)
    bloco = texto[i:texto.index("\n}", i) + 2]
    if bloco.count("function") != 1:
        raise SystemExit(f"! o recorte pegou mais de uma função:\n{bloco}")
    return bloco


def literais(texto):
    """(rota, código) de cada handler, pelo cabeçalho logo acima dele."""
    saida = []
    i = 0
    while True:
        i = texto.find("compileController(", i)
        if i < 0:
            return saida
        a = texto.index('"', i)
        b = a + 1
        while True:
            if texto[b] == "\\":
                b += 2
                continue
            if texto[b] == '"':
                break
            b += 1
        cab = texto.rfind("\n  // ", 0, a)
        saida.append((texto[cab + 5:texto.index("\n", cab + 5)].strip(),
                      a, b + 1, json.loads(texto[a:b + 1])))
        i = b


def regiao(texto, inicio_do_comentario):
    """Do primeiro `//` do comentário que abre a porta até o fim de `_podeVer`.

    A constante da transição mora numa linha PRÓPRIA, fora da função, e o
    comentário que a explica está acima dela. Trocar só a função deixaria a
    constante como código morto com cara de porta — foi o que a conferência de
    sobra pegou na primeira tentativa.
    """
    i = texto.index(inicio_do_comentario)
    if ABRE not in texto[i:]:
        raise SystemExit("! `_podeVer` não vem depois do comentário da porta")
    j = texto.index(ABRE, i)
    return texto[i:texto.index("\n}", j) + 2]


def corpo_novo(bloco):
    novo = regiao(bloco, '// Ver o módulo: o campo "Projetos"')
    if 'eu.grants.indexOf("projetos")' not in novo:
        raise SystemExit(f"! o corpo novo não olha o campo `projetos`:\n{novo}")
    if 'eu.grants.indexOf("planejamento")' not in novo:
        raise SystemExit(f"! o corpo novo tiraria quem planeja:\n{novo}")
    # A porta antiga tem de ter saído: é disto que a mudança trata.
    for proibido in ("_PORTA_ANTIGA", "_RANK.developer", 'indexOf("qa")'):
        if proibido in novo:
            raise SystemExit(f"! o corpo novo ainda fala de {proibido!r}:\n{novo}")
    return novo


def regiao_antiga(codigo, rota):
    """A porta antiga INTEIRA de um handler: comentário, constante e `_podeVer`.

    Calculada por handler, não uma vez só: os 18 handlers escritos à mão têm um
    comentário curto acima da constante e os 3 de atividades têm o comentário
    longo. Uma região só casava 18 e deixava 3 rotas do mesmo módulo com a porta
    velha — que é exatamente o que este script existe para impedir.
    """
    k = codigo.index("var _PORTA_ANTIGA_DE_PROJETOS = true;")
    linhas = codigo[:k].splitlines(True)
    n = 0
    while n < len(linhas) and linhas[-1 - n].lstrip().startswith("//"):
        n += 1
    if n == 0:
        raise SystemExit(f"! {rota}: a constante da transição não tem comentário acima")
    inicio = k - sum(len(l) for l in linhas[len(linhas) - n:])
    if ABRE not in codigo[k:]:
        raise SystemExit(f"! {rota}: `_podeVer` não vem depois da constante")
    j = codigo.index(ABRE, k)
    bloco = codigo[inicio:codigo.index("\n}", j) + 2]
    for exigido in ("_PORTA_ANTIGA_DE_PROJETOS", "_RANK.developer", 'indexOf("qa")'):
        if exigido not in bloco:
            raise SystemExit(f"! {rota}: a região antiga não tem {exigido!r}:\n{bloco}")
    if bloco.count("function") != 1:
        raise SystemExit(f"! {rota}: a região antiga pegou mais de uma função")
    return bloco


def main():
    aplicar = "--aplicar" in sys.argv
    novo = corpo_novo(comum())
    texto = open(ROTAS, encoding="utf-8").read()

    # A troca é feita no literal DECODIFICADO e ele é reescrito inteiro: no
    # arquivo de rotas os acentos vão escapados (`\u00e1`), e procurar o texto
    # com acento no arquivo cru não casa nada.
    ja = [r for r, _, _, c in literais(texto) if novo in c]
    if len(ja) == QUANTOS:
        print(f"   = já aplicado nos {QUANTOS} handlers")
        return

    trocados, alheios = [], []
    for rota, ini, fim, codigo in reversed(literais(texto)):
        if "_PORTA_ANTIGA_DE_PROJETOS" not in codigo:
            continue
        if " projetos " not in f" {rota} ":
            alheios.append(rota)
            continue
        antigo = regiao_antiga(codigo, rota)
        if codigo.count(antigo) != 1:
            raise SystemExit(f"! {rota}: a porta antiga aparece {codigo.count(antigo)}x")
        texto = texto[:ini] + json.dumps(codigo.replace(antigo, novo)) + texto[fim:]
        trocados.append(rota)

    if alheios:
        raise SystemExit(f"! a porta antiga aparece fora do módulo projetos: {alheios}")
    if len(trocados) != QUANTOS:
        raise SystemExit(f"! troquei {len(trocados)}, esperado {QUANTOS}")

    com_porta = [r for r, _, _, c in literais(texto) if novo in c]
    if len(com_porta) != QUANTOS:
        raise SystemExit(f"! {len(com_porta)} handlers com a porta nova, esperado {QUANTOS}")
    # A constante da transição não pode sobrar: ela era lida só por `_podeVer`,
    # e uma sobra seria código morto com cara de porta.
    sobras = [r for r, _, _, c in literais(texto) if "_PORTA_ANTIGA_DE_PROJETOS" in c]
    if sobras:
        raise SystemExit(f"! a constante da transição sobrou em: {sobras}")

    if not aplicar:
        print(f"   → a porta vira o campo 'Projetos' em {QUANTOS} handlers")
        print("\n   (simulação — use --aplicar)")
        return
    open(ROTAS, "w", encoding="utf-8").write(texto)
    print(f"→ porta trocada em {QUANTOS} handlers do módulo projetos")


if __name__ == "__main__":
    main()
