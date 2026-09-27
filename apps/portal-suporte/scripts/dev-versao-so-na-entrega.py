#!/usr/bin/env python3
# =============================================================================
# A versão se informa na ENTREGA ao cliente, não ao liberar para teste.
#
# Mover de "Pronto p/ Teste" abria o diálogo pedindo a versão do sistema. Mas
# quem controla versão é quem faz o deploy, e nesse momento do fluxo ela ainda
# não existe — o dev acabou de liberar para teste, a entrega ao cliente pode
# acontecer dias depois e com outro número.
#
# O efeito era pedir adivinhação: quem move preenche qualquer coisa para passar
# da tela, e o campo passa a guardar ficção. Campo obrigatório na hora errada
# não coleta dado — coleta ruído.
#
# `aplicado_no_cliente` JÁ exigia versão, e ali a exigência está certa: é o
# momento em que a versão é fato. Este script só remove a exigência do
# `pronto_para_teste`; a transição segue funcionando, e quem quiser informar a
# versão antes continua podendo — o campo é aceito, só não é mais cobrado.
#
#   python3 scripts/dev-versao-so-na-entrega.py            # simula
#   python3 scripts/dev-versao-so-na-entrega.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/dev-versao-so-na-entrega.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/tickets"

DE = '''    if (para === "pronto_para_teste") {
      var versao = String(body.version || card.version || "").trim();
      if (!versao) {
        return ctx.reply.status(400).send({ error: "Informe a versão disponibilizada em homologação" });
      }
      if (body.version) patch.version = String(body.version).trim();
      if (body.environment) patch.environment = String(body.environment).trim();
    }'''

PARA = '''    if (para === "pronto_para_teste") {
      // ── %s ──
      // A versão NÃO é mais exigida aqui. Quem controla versão é quem faz o
      // deploy, e neste ponto do fluxo ela ainda não existe: o dev acabou de
      // liberar para teste, e a entrega ao cliente pode acontecer dias depois
      // com outro número. Exigir aqui só fazia quem move inventar um valor
      // para passar da tela — campo obrigatório na hora errada coleta ruído,
      // não dado.
      //
      // A exigência continua em `aplicado_no_cliente`, onde a versão é fato.
      // Informar antes segue permitido: o campo é aceito, só não é cobrado.
      if (body.version) patch.version = String(body.version).trim();
      if (body.environment) patch.environment = String(body.environment).trim();
    }''' % MARCA


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
    r = next((x for x in d["routes"] if x["path"] == "/dev/tickets/:id/mover"), None)
    if not r:
        print("❌ rota não existe")
        sys.exit(1)
    codigo = r["controllerCode"] or ""
    if MARCA in codigo:
        print("   = já aplicado")
        return
    if DE not in codigo:
        print("   ! bloco não encontrado — o controller mudou; conferir à mão")
        sys.exit(1)

    novo = codigo.replace(DE, PARA)
    print(f"   {'→' if aplicar else ' '} /dev/tickets/:id/mover: versão deixa de ser exigida em 'Pronto p/ Teste'")
    print("     (segue exigida em 'Aplicado no Cliente')")
    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    corpo = {"method": r["method"], "path": r["path"], "controllerCode": novo}
    for extra in ("authMode", "webhookSecretName"):
        if r.get(extra):
            corpo[extra] = r[extra]
    cc, resp = req(f"{MOD}/routes", "PUT", corpo)
    if cc >= 300:
        print(f"      ❌ HTTP {cc} {resp}")
        sys.exit(1)
    cc, resp = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar tickets: HTTP {cc} {'' if cc < 300 else resp}")


if __name__ == "__main__":
    main()
