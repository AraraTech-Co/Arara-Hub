#!/usr/bin/env python3
# =============================================================================
# A lista de conversas guarda a prévia das conversas abertas fora da janela
# (16/11/2026).
#
# Edita só o literal de `GET /whatsapp` (432) no routes.generated.ts. A conversa
# aberta cuja última mensagem ficou fora das 500 mais recentes tem a prévia
# buscada por uma leitura própria (laço `_faltam`). A tela consulta a lista a
# cada 10 s por pessoa, e cada consulta repetia essas leituras.
#
# Agora a prévia achada fica guardada na memória do processo, por conversa, e é
# reaproveitada enquanto o `updated_at` da conversa não muda, por até 10 min.
# Conversa fora da janela só ganha mensagem nova entrando na janela (aí a prévia
# vem dela, não da guarda); os 10 min limitam o atraso de uma reação ou edição na
# mensagem antiga.
#
#   python3 scripts/whatsapp-lista-guarda-previa.py            # simula
#   python3 scripts/whatsapp-lista-guarda-previa.py --gravar   # grava
# =============================================================================

import argparse
import importlib.util
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ = os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
ROTA = ("GET", "/whatsapp")

_spec = importlib.util.spec_from_file_location("_ds", os.path.join(RAIZ, "scripts", "desativado-sem-acesso.py"))
_ds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ds)

MARCA = "// Prévia guardada (16/11/2026)"

DECL_ANCORA = "async function lastMessagesByConv(Msg) {\n"
DECL_NOVA = (
    "// Prévia guardada (16/11/2026): prévia das conversas abertas fora da janela,\n"
    "// por conversa, entre uma consulta e outra (ver o laço `_faltam`).\n"
    "var _previaGuardada = {};\n"
    "var _PREVIA_VALIDADE_MS = 10 * 60 * 1000;\n"
    + DECL_ANCORA
)

LACO_ANTIGO = (
    "  for (var _q = 0; _q < _faltam.length && _q < 40; _q++) {\n"
    "    try {\n"
)
LACO_NOVO = (
    "  // A prévia achada vale enquanto a conversa não muda (`updated_at`), por até\n"
    "  // 10 min: conversa fora da janela só ganha mensagem nova entrando na janela, e\n"
    "  // os 10 min limitam o atraso de uma reação ou edição na mensagem antiga. A\n"
    "  // lista é consultada a cada 10 s por pessoa; sem a guarda, cada consulta\n"
    "  // repetia a leitura de cada uma destas conversas.\n"
    "  var _agoraPrevia = Date.now();\n"
    "  var _chavePrevia = {};\n"
    "  for (var _c0 = 0; _c0 < rows.length; _c0++) {\n"
    "    _chavePrevia[rows[_c0].id] = String(rows[_c0].updated_at || rows[_c0].updatedAt || \"\");\n"
    "  }\n"
    "  var _guardaNova = {};\n"
    "  for (var _q = 0; _q < _faltam.length && _q < 40; _q++) {\n"
    "    var _g = _previaGuardada[_faltam[_q]];\n"
    "    if (_g && _g.chave === _chavePrevia[_faltam[_q]] && _agoraPrevia - _g.em < _PREVIA_VALIDADE_MS) {\n"
    "      _guardaNova[_faltam[_q]] = _g;\n"
    "      if (_g.msg) {\n"
    "        deps.lastByConv[_faltam[_q]] = _g.msg;\n"
    "        _todasMsgs.push(_g.msg);\n"
    "      }\n"
    "      continue;\n"
    "    }\n"
    "    try {\n"
)

FIM_ANTIGO = (
    "      if (_ult) {\n"
    "        deps.lastByConv[_faltam[_q]] = _ult;\n"
    "        _todasMsgs.push(_ult);\n"
    "      }\n"
    "    } catch (e) {}\n"
    "  }\n"
)
FIM_NOVO = (
    "      if (_ult) {\n"
    "        deps.lastByConv[_faltam[_q]] = _ult;\n"
    "        _todasMsgs.push(_ult);\n"
    "      }\n"
    "      _guardaNova[_faltam[_q]] = { chave: _chavePrevia[_faltam[_q]], em: _agoraPrevia, msg: _ult };\n"
    "    } catch (e) {}\n"
    "  }\n"
    "  _previaGuardada = _guardaNova;\n"
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
    if MARCA in codigo:
        print("   já aplicado")
        return
    for de, _ in [(DECL_ANCORA, 0), (LACO_ANTIGO, 0), (FIM_ANTIGO, 0)]:
        if codigo.count(de) != 1:
            sys.exit("❌ âncora fora do formato esperado: " + de[:50] + " — nada foi gravado")
    if "_previaGuardada" in codigo or "_guardaNova" in codigo:
        sys.exit("❌ nome já usado no literal — nada foi gravado")
    asc = "\\u00" in enc or "\\u2" in enc
    novo, esperado = enc, codigo
    for de, para in [(DECL_ANCORA, DECL_NOVA), (LACO_ANTIGO, LACO_NOVO), (FIM_ANTIGO, FIM_NOVO)]:
        novo = _ds.troca_codificada(novo, de, para, asc)
        esperado = esperado.replace(de, para)
        if novo is None:
            sys.exit("❌ âncora codificada não casou: " + de[:60] + " — nada foi gravado")
    if json.loads('"' + novo + '"') != esperado:
        sys.exit("❌ a edição codificada não bate com a pretendida — nada foi gravado")
    print(f"   {' '.join(ROTA)}: prévia fora da janela guardada entre consultas")
    if not a.gravar:
        print("   (simulação — use --gravar)")
        return
    open(ARQ, "w", encoding="utf-8").write(texto[:m.start(2)] + novo + texto[m.end(2):])
    print("   gravado")


if __name__ == "__main__":
    main()
