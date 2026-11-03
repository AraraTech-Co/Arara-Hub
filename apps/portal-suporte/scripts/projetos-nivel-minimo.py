#!/usr/bin/env python3
# =============================================================================
# As caixas de permissão do módulo `projetos` valem a partir de `support`.
#
# `user` é o nível de CLIENTE no portal, e `vendedor` é apelido dele. Projeto
# interno é coisa da equipe: abaixo de `support`, nenhuma caixa marcada abre o
# módulo nem deixa planejar. Adm e master seguem entrando por nível, e quem tem
# `planejamento` sendo da equipe segue planejando.
#
# O piso mora numa função só (`_daEquipe`) e as três portas do módulo
# (`_podeVer`, `_podePlanejar`, `_podeMexerNoCard`) a consultam: piso repetido
# em três lugares é piso que vai ficar em dois na próxima correção.
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
}
function _podePlanejar(eu) {
  return eu.servico || eu.nivel >= _RANK.admin || eu.grants.indexOf("planejamento") >= 0;
}
function _podeMexerNoCard(eu) {
  return eu.servico || eu.nivel >= _RANK.developer || eu.grants.indexOf("planejamento") >= 0;
}"""

NOVO = """// O piso do módulo: as caixas de permissão de Projetos valem a partir de
// `support`. `user` é o nível de CLIENTE no portal (e `vendedor` é apelido
// dele), e projeto interno é coisa da equipe. Adm e master entram por nível;
// abaixo de `support`, nenhuma caixa abre o módulo nem deixa planejar.
//
// O piso mora aqui e as três portas o consultam: repetido em três lugares,
// ficaria em dois na próxima correção.
function _daEquipe(eu) {
  return eu.nivel >= _RANK.support;
}
function _podeVer(eu) {
  if (eu.servico) return true;
  if (eu.nivel >= _RANK.admin) return true;
  if (!_daEquipe(eu)) return false;
  if (eu.grants.indexOf("projetos") >= 0) return true;
  return eu.grants.indexOf("planejamento") >= 0;
}
function _podePlanejar(eu) {
  if (eu.servico) return true;
  if (eu.nivel >= _RANK.admin) return true;
  if (!_daEquipe(eu)) return false;
  return eu.grants.indexOf("planejamento") >= 0;
}
function _podeMexerNoCard(eu) {
  if (eu.servico) return true;
  if (eu.nivel >= _RANK.developer) return true;
  if (!_daEquipe(eu)) return false;
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
                f"{chave}: as três portas não estão no formato esperado "
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
