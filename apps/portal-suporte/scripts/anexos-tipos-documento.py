#!/usr/bin/env python3
# =============================================================================
# Aceitar planilha, documento e XML como evidência.
#
# A lista de tipos nasceu pensando em PRINT: imagem, vídeo, áudio e PDF. Só que
# metade da evidência deste suporte é planilha — "as notas conferidas e puladas
# de agosto" chega em .xlsx, não em foto de tela. E, num suporte fiscal, o XML
# da NF-e é a evidência mais direta que existe.
#
# O que ENTRA:
#   xlsx, xls, csv    planilha — o caso que motivou
#   docx, doc         documento
#   txt, log          texto puro e log
#   xml               NF-e, SPED, retorno de SEFAZ
#
# O que NÃO entra, e por quê — cada um tem um motivo, não é conservadorismo:
#   xlsm, docm  macro roda na máquina de quem abre. O primo sem macro está na
#               lista; quem precisa mandar a planilha manda o .xlsx.
#   svg, html   texto que o navegador EXECUTA. O anexo volta como `data:` URL,
#               e abrir um SVG com script nessa origem é XSS servido pelo
#               próprio portal.
#   zip         some com o tipo real: o que a lista recusa na porta entra
#               empacotado. Se virar necessidade, a conversa é sobre inspecionar
#               o conteúdo, não sobre abrir a porta.
#
# O limite de tamanho NÃO muda: o conteúdo vira base64 dentro do próprio
# registro (~33% maior), e o teto real é o corpo da requisição na plataforma.
#
#   python3 scripts/anexos-tipos-documento.py            # simula
#   python3 scripts/anexos-tipos-documento.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/anexos-tipos-documento.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/admin_backfill_ticket_numbers"

DE_TIPOS = '''    "application/pdf": 1'''
PARA_TIPOS = '''    "application/pdf": 1,
    // ── %s ──
    // Planilha, documento, texto e XML: metade da evidência deste suporte não
    // é print. Macro (xlsm/docm), SVG/HTML e zip ficam DE FORA de propósito —
    // ver o cabeçalho do script para o motivo de cada um.
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 1,
    "application/vnd.ms-excel": 1,
    "text/csv": 1,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 1,
    "application/msword": 1,
    "text/plain": 1,
    "text/xml": 1,
    "application/xml": 1''' % MARCA

DE_EXT = '''    pdf: "application/pdf"'''
PARA_EXT = '''    pdf: "application/pdf",
    // O Windows manda .xlsx e .csv sem tipo declarado com frequência; sem este
    // mapa por extensão, o arquivo chega como `application/octet-stream` e a
    // lista acima o recusa mesmo sendo permitido.
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    txt: "text/plain",
    log: "text/plain",
    xml: "text/xml"'''


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=150) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    aplicar = "--aplicar" in sys.argv
    c, d = req(f"{MOD}/routes")
    if c >= 300:
        print(f"❌ HTTP {c} {d}")
        sys.exit(1)

    mudadas = 0
    for r in d["routes"]:
        codigo = r["controllerCode"] or ""
        if DE_TIPOS not in codigo:
            continue
        if MARCA in codigo:
            print(f"   = {r['method']:6} {r['path']}: já aceita documentos")
            continue
        novo = codigo.replace(DE_TIPOS, PARA_TIPOS)
        if DE_EXT in novo:
            novo = novo.replace(DE_EXT, PARA_EXT)
        else:
            print(f"   ! {r['method']:6} {r['path']}: mapa de extensão não encontrado")
        print(f"   {'→' if aplicar else ' '} {r['method']:6} {r['path']:30} +planilha, documento, texto, XML")
        if not aplicar:
            continue
        corpo = {"method": r["method"], "path": r["path"], "controllerCode": novo}
        for extra in ("authMode", "webhookSecretName"):
            if r.get(extra):
                corpo[extra] = r[extra]
        cc, resp = req(f"{MOD}/routes", "PUT", corpo)
        if cc >= 300:
            print(f"      ❌ HTTP {cc} {resp}")
            sys.exit(1)
        mudadas += 1

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    if mudadas:
        cc, resp = req(MOD, "PATCH", {"status": "published"})
        print(f"→ publicar: HTTP {cc} {'' if cc < 300 else resp}")


if __name__ == "__main__":
    main()
