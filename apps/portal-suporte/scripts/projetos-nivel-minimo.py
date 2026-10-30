#!/usr/bin/env python3
# =============================================================================
# O campo "Projetos" deixa de valer abaixo de `support`.
#
# `_podeVer` olhava o grant sem olhar o nível: um perfil de CLIENTE (`user`,
# e o apelido `vendedor`) com a caixa marcada entrava no módulo inteiro de
# projetos internos. A caixa continua sendo a porta — mas só para quem é da
# equipe. Adm e master seguem entrando por nível.
#
# A troca é feita nos 25 handlers do módulo de uma vez: régua que mora em 25
# cópias e se muda à mão é régua que vai divergir na próxima rota.
#
# A edição é feita no literal DECODIFICADO e o literal é reescrito inteiro: no
# arquivo os acentos vão escapados.
#
#   python3 apps/portal-suporte/scripts/projetos-nivel-minimo.py          # confere
#   python3 apps/portal-suporte/scripts/projetos-nivel-minimo.py --gravar # aplica
# =============================================================================

import argparse
import json
import os
import re

AQUI = os.path.dirname(os.path.abspath(__file__))
ROTAS = os.path.abspath(os.path.join(
    AQUI, "..", "..", "..", "packages", "api", "src", "apps", "portal-suporte",
    "routes.generated.ts"))
COMUM = os.path.join(AQUI, "_projetos_comum.py")

ANTIGO = """function _podeVer(eu) {
  if (eu.servico) return true;
  if (eu.nivel >= _RANK.admin) return true;
  if (eu.grants.indexOf("projetos") >= 0) return true;
  return eu.grants.indexOf("planejamento") >= 0;
}"""

NOVO = """function _podeVer(eu) {
  if (eu.servico) return true;
  if (eu.nivel >= _RANK.admin) return true;
  // O campo "Projetos" é a porta, mas não vale abaixo de `support`: `user` é o
  // nível do CLIENTE (e `vendedor` é apelido dele), e projeto interno não é
  // coisa de cliente. Sem esta linha, a caixa marcada num perfil de cliente
  // abria o módulo inteiro.
  if (eu.nivel < _RANK.support) return false;
  if (eu.grants.indexOf("projetos") >= 0) return true;
  return eu.grants.indexOf("planejamento") >= 0;
}"""

RE_ENTRADA = re.compile(
    r'\{\s*\n((?:(?!handler:)[\s\S]){0,900}?)handler: compileController\("((?:[^"\\]|\\.)*)"\)')


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--gravar", action="store_true")
    a = p.parse_args()

    texto = open(ROTAS, encoding="utf8").read()
    trocadas, ja, partes, fim = [], [], [], 0

    for m in RE_ENTRADA.finditer(texto):
        met = re.search(r'method:\s*"([^"]+)"', m.group(1))
        pth = re.search(r'path:\s*"([^"]+)"', m.group(1))
        if not met or not pth:
            continue
        chave = f"{met.group(1)} {pth.group(1)}"
        codigo = json.loads('"' + m.group(2) + '"')
        if "function _podeVer(eu)" not in codigo:
            continue
        if NOVO in codigo:
            ja.append(chave)
            continue
        # Âncora que não casa exatamente é rota que ficaria com a régua velha,
        # e o módulo passaria a ter duas portas. Para tudo.
        if codigo.count(ANTIGO) != 1:
            raise SystemExit(
                f"{chave}: o corpo de _podeVer não é o esperado "
                f"({codigo.count(ANTIGO)} ocorrências) — nada foi gravado")
        partes.append(texto[fim:m.start(2)])
        partes.append(json.dumps(codigo.replace(ANTIGO, NOVO))[1:-1])
        fim = m.end(2)
        trocadas.append(chave)
    partes.append(texto[fim:])

    print(f"   {len(trocadas)} rota(s) a trocar, {len(ja)} já no formato novo")
    for c in trocadas:
        print(f"      {c}")
    if not a.gravar:
        print("\n   (conferência; use --gravar para aplicar)")
        return
    if trocadas:
        open(ROTAS, "w", encoding="utf8").write("".join(partes))

    # A régua da tela e a do gerador andam juntas: deixar só o servidor novo
    # faria a tela oferecer um módulo que o servidor recusa.
    comum = open(COMUM, encoding="utf8").read()
    if ANTIGO in comum:
        open(COMUM, "w", encoding="utf8").write(comum.replace(ANTIGO, NOVO, 1))
        print("   ✓ _projetos_comum.py alinhado")
    print("   ✓ gravado")


if __name__ == "__main__":
    main()
