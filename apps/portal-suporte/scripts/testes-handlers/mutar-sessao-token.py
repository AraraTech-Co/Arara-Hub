#!/usr/bin/env python3
# =============================================================================
# Mutação de sessao-token-forjado.test.js.
#
# Cada defeito é plantado no INVÓLUCRO da rota guardada, dentro do literal, e
# tem de reprovar numa asserção nomeada. O literal é reescrito inteiro: no
# arquivo os acentos e as aspas vão escapados.
#
#   python3 apps/portal-suporte/scripts/testes-handlers/mutar-sessao-token.py
# =============================================================================

import json
import os
import re
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
ROTAS = os.path.abspath(os.path.join(
    AQUI, "..", "..", "..", "..", "packages", "api", "src", "apps",
    "portal-suporte", "routes.generated.ts"))
TESTE = os.path.join(AQUI, "sessao-token-forjado.test.js")
ROTA = "GET /admin/teams"

RE_ENTRADA = re.compile(
    r'\{\s*\n((?:(?!handler:)[\s\S]){0,900}?)handler: compileController\("((?:[^"\\]|\\.)*)"\)')

MUTANTES = [
    # O ataque: aceitar qualquer verificador para um id que existe.
    ("o-verificador-deixa-de-ser-comparado",
     'if (String(linha.verificador || "") !== partes[1]) return null;', "",
     "verificador-errado-recusa"),
    ("a-comparacao-do-verificador-vira-prefixo",
     'if (String(linha.verificador || "") !== partes[1]) return null;',
     'if (String(linha.verificador || "").indexOf(partes[1]) !== 0) return null;',
     "pedaco-do-verificador-tambem-recusa:1"),
    ("a-comparacao-do-verificador-vira-sufixo",
     'if (String(linha.verificador || "") !== partes[1]) return null;',
     'if (String(linha.verificador || "").indexOf(partes[1]) < 0) return null;',
     "sufixo-do-verificador-tambem-recusa"),
    ("sessao-revogada-passa a valer",
     "if (!linha || linha.revogada === true) return null;", "if (!linha) return null;",
     "sessao-revogada-recusa"),
    ("sessao-vencida-passa a valer",
     "if (linha.expira_em && new Date(linha.expira_em).getTime() < Date.now()) return null;",
     "", "sessao-vencida-recusa"),
    # O formato: sem a conferência, `<id>` sozinho viraria uma busca por
    # "ses_<id>" com verificador `undefined`.
    ("o-formato-do-cabecalho-deixa-de-ser-conferido",
     "if (partes.length !== 2 || !partes[0] || !partes[1]) return null;", "",
     "malformado-nem-consulta-a-tabela:sem-ponto"),
    ("a-busca-perde-o-prefixo",
     'var linha = await S.findById("ses_" + partes[0]);',
     "var linha = await S.findById(partes[0]);",
     "a-busca-usa-o-prefixo-ses_"),
    # O contraste desarmado: um invólucro que recusa tudo passaria em todos os
    # casos de 401 acima.
    ("o-involucro-recusa-ate-a-sessao-boa",
     "return linha.user_id || null;", "return null;",
     "sessao-boa-entra"),
    ("o-nivel-deixa-de-valer-com-sessao-boa",
     'if (eu.nivel < _gsRANK["developer"]) {', "if (false) {",
     "sessao-boa-de-quem-nao-alcanca-o-piso-da-403"),
]


def literal(texto):
    for m in RE_ENTRADA.finditer(texto):
        met = re.search(r'method:\s*"([^"]+)"', m.group(1))
        pth = re.search(r'path:\s*"([^"]+)"', m.group(1))
        if met and pth and f"{met.group(1)} {pth.group(1)}" == ROTA:
            return m, json.loads('"' + m.group(2) + '"')
    raise SystemExit("rota não encontrada: " + ROTA)


def main():
    original = open(ROTAS, encoding="utf8").read()
    m, codigo = literal(original)
    mortos, vivos = 0, []
    for nome, de, para, esperada in MUTANTES:
        if codigo.count(de) != 1:
            vivos.append(f"{nome}: âncora aparece {codigo.count(de)}× (precisa ser 1)")
            continue
        novo = codigo.replace(de, para, 1)
        try:
            open(ROTAS, "w", encoding="utf8").write(
                original[:m.start(2)] + json.dumps(novo)[1:-1] + original[m.end(2):])
            r = subprocess.run(["node", TESTE], capture_output=True, text=True, cwd=AQUI)
            linhas = [l for l in (r.stdout + r.stderr).splitlines() if l.startswith("FALHA")]
            if r.returncode == 0:
                vivos.append(f"{nome}: VIVO (o teste passou com o defeito)")
            elif not linhas:
                vivos.append(f"{nome}: reprovou SEM asserção -> {r.stderr[-200:]}")
            elif not any(esperada in l for l in linhas):
                vivos.append(f"{nome}: reprovou na asserção errada -> {linhas[:3]}")
            else:
                mortos += 1
                print(f"   ✓ morto: {nome}  -> {esperada}")
        finally:
            open(ROTAS, "w", encoding="utf8").write(original)

    assert open(ROTAS, encoding="utf8").read() == original, "rotas não restauradas"
    print(f"\n   {mortos}/{len(MUTANTES)} mortos; arquivo restaurado byte a byte")
    if vivos:
        print("\n   SOBREVIVENTES:")
        for v in vivos:
            print(f"      {v}")
        sys.exit(1)


if __name__ == "__main__":
    main()
