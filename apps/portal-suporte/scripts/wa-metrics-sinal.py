#!/usr/bin/env python3
# =============================================================================
# Acrescenta ao `GET /whatsapp/metrics` o sinal que o menu precisa.
#
# A barra lateral vai mostrar quantas conversas estão abertas e avisar quando
# chega mensagem nova. Para isso faltavam dois números que a rota já tinha em
# mãos e jogava fora ao contar:
#
#   naoLidas        soma de `unread_count` das conversas ativas — é o número
#                   que interessa ao atendente, não o total de conversas.
#   ultimoEventoEm  maior `last_inbound_at`. É o gatilho do som: comparar
#                   carimbo é confiável quando o contador não muda (mensagem
#                   nova numa conversa que já estava aberta não mexe em
#                   `open`, e sem isto o aviso não tocaria).
#
# Estender a rota que já existe em vez de criar uma nova é deliberado: são os
# mesmos dados, na mesma varredura, e o portal já tem redundância demais.
#
#   python3 scripts/wa-metrics-sinal.py            # simula
#   python3 scripts/wa-metrics-sinal.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-metrics-sinal.py"


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

VELHO_INICIO = """  var rows = await m.Conv.findMany({});
  var open = 0, queue = 0, slaAtRisk = 0;"""
NOVO_INICIO = """  var rows = await m.Conv.findMany({});
  var open = 0, queue = 0, slaAtRisk = 0;
  // Sinal para o menu — ver %s.
  var naoLidas = 0, ultimoEventoEm = null;""" % MARCA

VELHO_LOOP = """    open++;
    byPhase[phase] = (byPhase[phase] || 0) + 1;"""
NOVO_LOOP = """    open++;
    byPhase[phase] = (byPhase[phase] || 0) + 1;
    naoLidas += Number(c.unread_count || c.unreadCount || 0) || 0;
    var entrada = c.last_inbound_at || c.lastInboundAt || null;
    if (entrada && (!ultimoEventoEm || String(entrada) > String(ultimoEventoEm))) {
      ultimoEventoEm = entrada;
    }"""

VELHO_SAIDA = """  return ok(ctx, { open: open, queue: queue, slaAtRisk: slaAtRisk, byPhase: byPhase });"""
NOVO_SAIDA = """  return ok(ctx, {
    open: open, queue: queue, slaAtRisk: slaAtRisk, byPhase: byPhase,
    naoLidas: naoLidas, ultimoEventoEm: ultimoEventoEm,
  });"""

VELHO_VAZIO = """  if (!m.Conv) return ok(ctx, { open: 0, queue: 0, slaAtRisk: 0, byPhase: {} });"""
NOVO_VAZIO = """  if (!m.Conv) return ok(ctx, { open: 0, queue: 0, slaAtRisk: 0, byPhase: {}, naoLidas: 0, ultimoEventoEm: null });"""


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    rota = [r for r in d["routes"] if r["path"] == "/whatsapp/metrics"][0]
    codigo = rota["controllerCode"]
    if MARCA in codigo:
        print("= já aplicado")
        return
    novo = codigo
    for velho, troca in ((VELHO_VAZIO, NOVO_VAZIO), (VELHO_INICIO, NOVO_INICIO),
                         (VELHO_LOOP, NOVO_LOOP), (VELHO_SAIDA, NOVO_SAIDA)):
        if velho not in novo:
            print("! trecho não encontrado; o controller mudou de forma")
            sys.exit(1)
        novo = novo.replace(velho, troca, 1)

    print(f"→ metrics: {len(codigo)} → {len(novo)} caracteres")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return
    corpo = {"method": "GET", "path": "/whatsapp/metrics", "controllerCode": novo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    c, r = req(f"{MOD}/routes", "PUT", corpo)
    print(f"→ gravar: HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
