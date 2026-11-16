#!/usr/bin/env python3
# =============================================================================
# O detalhe da conversa deixa de buscar a última mensagem (16/11/2026).
#
# Edita só o literal de `GET /whatsapp/:id` (433) no routes.generated.ts:
#   - `loadDepsDaConversa` passa a montar `lastByConv` vazio, e a resposta
#     segue com `last_message: null`;
#   - o auxiliar `lastMessagesByConv`, que fica sem chamador, sai do literal.
#
# Quem chama esta rota é o painel lateral da inbox (crm-context-panel.tsx), que
# não lê `last_message`. O `PATCH /whatsapp/:id` tem a própria cópia do
# auxiliar e devolve a prévia para a lista da inbox: NÃO é tocado aqui.
#
#   python3 scripts/whatsapp-detalhe-sem-ultima-mensagem.py            # simula
#   python3 scripts/whatsapp-detalhe-sem-ultima-mensagem.py --gravar   # grava
# =============================================================================

import argparse
import importlib.util
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ = os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
ROTA = ("GET", "/whatsapp/:id")

_spec = importlib.util.spec_from_file_location("_ds", os.path.join(RAIZ, "scripts", "desativado-sem-acesso.py"))
_ds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ds)

CHAMADA = "  var lastByConv = await lastMessagesByConv(m.Msg, c.id);\n"
SEM_CHAMADA = (
    "  // Sem a última mensagem: o painel lateral, único chamador desta rota, não lê\n"
    "  // `last_message`, e achá-la custava uma varredura das mensagens por conversa\n"
    "  // aberta. A resposta segue com `last_message: null`.\n"
    "  var lastByConv = {};\n"
)
INICIO_AUX = "async function lastMessagesByConv(Msg, conversaId) {"
FIM_AUX = "  return best;\n}\n"
MARCA = "  // Sem a última mensagem: o painel lateral, único chamador desta rota, não lê\n"


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
    if codigo.count(CHAMADA) != 1 or codigo.count(INICIO_AUX) != 1:
        sys.exit("❌ âncoras fora do formato esperado — nada foi gravado")
    i = codigo.index(INICIO_AUX)
    j = codigo.index(FIM_AUX, i) + len(FIM_AUX)
    aux = codigo[i:j]
    if codigo.count("lastMessagesByConv(") != 2:
        sys.exit("❌ o auxiliar tem outro chamador neste literal — nada foi gravado")
    asc = "\\u00" in enc or "\\u2" in enc
    novo, esperado = enc, codigo
    for de, para in [(CHAMADA, SEM_CHAMADA), (aux, "")]:
        novo = _ds.troca_codificada(novo, de, para, asc)
        esperado = esperado.replace(de, para)
        if novo is None:
            sys.exit("❌ âncora codificada não casou: " + de[:60] + " — nada foi gravado")
    if json.loads('"' + novo + '"') != esperado or "lastMessagesByConv" in esperado:
        sys.exit("❌ a edição codificada não bate com a pretendida — nada foi gravado")
    print(f"   {' '.join(ROTA)}: sem a busca da última mensagem")
    if not a.gravar:
        print("   (simulação — use --gravar)")
        return
    open(ARQ, "w", encoding="utf-8").write(texto[:m.start(2)] + novo + texto[m.end(2):])
    print("   gravado")


if __name__ == "__main__":
    main()
