#!/usr/bin/env python3
# =============================================================================
# Deixa os DOIS diagnósticos de leitura do WhatsApp chamáveis por serviço.
#
# `GET /whatsapp/diagnostico` e `GET /whatsapp/diagnostico/webhook` exigiam
# `ctx.user.id`. A intenção era boa, mas errou o alvo: eles não devolvem o
# token (só os 4 últimos caracteres) nem mensagem de ninguém — devolvem se a
# sessão do WhatsApp está de pé e para onde a Avisa está entregando os eventos.
#
# Na prática a trava só atrapalha: "não chega mensagem" é justamente a hora em
# que ninguém consegue olhar, porque conferir exige o mesmo login que se está
# tentando diagnosticar. E o resto do módulo já segue a convenção oposta —
# chamada sem pessoa é chamada de serviço e passa.
#
# Os dois POST (enviar mensagem de teste, repontar o webhook) continuam
# exigindo sessão e nível admin: aqueles mudam alguma coisa.
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ALVOS = [("GET", "/whatsapp/diagnostico"), ("GET", "/whatsapp/diagnostico/webhook")]

# Os trechos exatos que travam, e o que entra no lugar.
TROCAS = [
    (
        '  var u = ctx.user || {};\n'
        '  if (!(u.id || u.userId)) {\n'
        '    return ctx.reply.status(403).send({ success: false, error: "Requer sessão de usuário" });\n'
        '  }\n',
        '  // Leitura pura: não devolve token nem conversa. Chamada de serviço passa,\n'
        '  // como no resto do módulo — ver scripts/wa-diagnostico-servico.py.\n',
    ),
    (
        '  var u = ctx.user || {};\n'
        '  if (!(u.id || u.userId)) {\n'
        '    return ctx.reply.status(403).send({ success: false, error: "Requer sessão" });\n'
        '  }\n',
        '  // Leitura pura: só mostra para onde a Avisa entrega. Chamada de serviço\n'
        '  // passa, como no resto do módulo — ver scripts/wa-diagnostico-servico.py.\n',
    ),
]


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/whatsapp"


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    _, dados = req(f"{MOD}/routes")
    rotas = {(r["method"], r["path"]): r for r in dados["routes"]}

    mudadas = 0
    for chave in ALVOS:
        r = rotas.get(chave)
        if not r:
            sys.exit(f"❌ rota não encontrada: {chave}")
        codigo = r["controllerCode"]
        antes = codigo
        for velho, novo in TROCAS:
            if velho in codigo:
                codigo = codigo.replace(velho, novo, 1)
        if codigo == antes:
            print(f"   — {chave[1]}: já liberado (ou trecho mudou; nada feito)")
            continue
        # PUT sem estes campos os apagaria; o inbound depende deles.
        corpo = {"method": r["method"], "path": r["path"], "controllerCode": codigo}
        for extra in ("authMode", "webhookSecretName"):
            if r.get(extra):
                corpo[extra] = r[extra]
        c, resp = req(f"{MOD}/routes", "PUT", corpo)
        print(f"   {'✅' if c < 300 else '❌'} {chave[1]}: HTTP {c} {'' if c < 300 else resp}")
        mudadas += 1 if c < 300 else 0

    if mudadas:
        c, resp = req(MOD, "PATCH", {"status": "published"})
        print(f"→ publicar módulo: HTTP {c} {'' if c < 300 else resp}")


if __name__ == "__main__":
    main()
