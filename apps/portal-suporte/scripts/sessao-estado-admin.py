#!/usr/bin/env python3
# =============================================================================
# `GET /auth/sessao/estado` passa a exigir pessoa de nível admin.
#
# A rota é a telemetria das sessões do portal: quem usou, quando, de qual
# aparelho. Não é dado público, e ninguém no front a chama.
#
# O invólucro NÃO é escrito aqui: é recortado do literal de uma rota que já o
# tem, no próprio arquivo de rotas, e só o nível mínimo é trocado. Copiar o
# bloco à mão foi o erro que fez uma correção anterior não casar — o que está
# publicado tem comentários dentro das funções, e cópia de memória diverge.
#
# A edição é feita no literal DECODIFICADO e o literal é reescrito inteiro: no
# arquivo os acentos vão escapados, e procurar texto com acento no arquivo cru
# não casa nada.
#
#   python3 apps/portal-suporte/scripts/sessao-estado-admin.py          # confere
#   python3 apps/portal-suporte/scripts/sessao-estado-admin.py --gravar # aplica
# =============================================================================

import argparse
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
ROTAS = os.path.abspath(os.path.join(
    AQUI, "..", "..", "..", "packages", "api", "src", "apps", "portal-suporte",
    "routes.generated.ts"))

ALVO = "GET /auth/sessao/estado"
DOADORA = "GET /admin/teams"          # qualquer rota já envolvida serve
ABRE = "// ── Guarda de sessão (scripts/guarda-sessao.py) ──"
FECHA = "module.exports = { handler: _gsComSessao };"
SEM_GUARDA = "module.exports = { handler };"

RE_ENTRADA = re.compile(
    r'\{\s*\n((?:(?!handler:)[\s\S]){0,900}?)handler: compileController\("((?:[^"\\]|\\.)*)"\)')


def entradas(texto):
    for m in RE_ENTRADA.finditer(texto):
        met = re.search(r'method:\s*"([^"]+)"', m.group(1))
        pth = re.search(r'path:\s*"([^"]+)"', m.group(1))
        if met and pth:
            yield f"{met.group(1)} {pth.group(1)}", m


def literal(texto, chave):
    for k, m in entradas(texto):
        if k == chave:
            return m, json.loads('"' + m.group(2) + '"')
    raise SystemExit(f"rota não encontrada: {chave}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--gravar", action="store_true")
    a = p.parse_args()

    texto = open(ROTAS, encoding="utf8").read()
    _, doadora = literal(texto, DOADORA)
    m_alvo, alvo = literal(texto, ALVO)

    if FECHA in alvo:
        print("   = a rota já exige sessão; nada a fazer")
        return

    i, j = doadora.index(ABRE), doadora.index(FECHA) + len(FECHA)
    bloco = doadora[i:j]
    if bloco.count('_gsRANK["') != 1:
        raise SystemExit("o bloco doador mudou de forma: nível mínimo não é único")
    bloco = bloco.replace('_gsRANK["developer"]', '_gsRANK["admin"]')
    if '_gsRANK["admin"]' not in bloco:
        raise SystemExit("o nível mínimo do bloco doador não era developer")

    if alvo.count(SEM_GUARDA) != 1:
        raise SystemExit(f"exportação da rota alvo não é única: {alvo.count(SEM_GUARDA)}×")
    novo = alvo.replace(SEM_GUARDA, bloco)

    # O comentário de topo dizia que a rota "fica" aberta. Fica, mas para quem
    # tem nível para ver.
    novo = novo.replace(
        "// Conta sessões SEM expor token: só metadados. Fica: é a telemetria do recurso.",
        "// Conta sessões SEM expor token: só metadados — mas metadados de QUEM usou o\n"
        "// portal, quando e de qual aparelho. Exige pessoa de nível admin.")

    print(f"   rota: {ALVO}")
    print(f"   bloco recortado de: {DOADORA} ({len(bloco)} caracteres)")
    print(f"   nível mínimo: admin")
    if not a.gravar:
        print("\n   (conferência; use --gravar para aplicar)")
        return

    saida = texto[:m_alvo.start(2)] + json.dumps(novo)[1:-1] + texto[m_alvo.end(2):]
    open(ROTAS, "w", encoding="utf8").write(saida)
    print("   ✓ gravado")


if __name__ == "__main__":
    main()
