#!/usr/bin/env python3
# =============================================================================
# Quem anda com o chamado no quadro de Suporte.
#
# A regra que existia trancava `PATCH/POST /tickets/:id/status` e
# `POST /tickets/:id/move` em `developer`. A intenção era proteger
# RECLASSIFICAÇÃO (prioridade, severidade), mas o alvo saiu errado: num quadro
# de Suporte, quem é `support` ficava sem mover card e sem resolver chamado —
# que é o trabalho dele.
#
# Ninguém tinha notado porque a regra nunca chegou a valer: o front chamava por
# um cliente HTTP que não mandava a identidade do portal, o servidor não sabia
# quem estava pedindo e a verificação era PULADA. Ao fechar esse buraco
# (scripts/guarda-sessao.py), a regra morta acordou e barrou o atendimento.
#
# Regra combinada com o Leonardo em 01/09/2026:
#
#   O chamado está no quadro de Suporte, sem pendência de Dev e sem card Dev
#   aberto nascido dele          → `support` resolve e move.
#   Qualquer outro caso          → `developer`, e o chamado só anda depois que
#                                  o fluxo do Kanban Dev terminar.
#
# "Card Dev aberto" é o mesmo conceito que a escalada implícita já usa: um
# ticket com `origem_ticket_id` apontando para este e status fora de
# `aplicado_no_cliente` / `descartado`.
#
# Prioridade e severidade seguem em `developer`: são protegidas à parte, por
# CAMPO, no `PUT/PATCH /tickets/:id` — este script não as toca.
#
#   python3 scripts/tickets-status-por-estado.py            # simula
#   python3 scripts/tickets-status-por-estado.py --aplicar  # grava e publica
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/tickets-status-por-estado.py"
ALVOS = [("PATCH", "/tickets/:id/status"),
         ("POST", "/tickets/:id/status"),
         ("POST", "/tickets/:id/move")]


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

DE = '''    var minimo = "developer";
'''

PARA = '''    var minimo = "developer";
    // ── %s ──
    // No quadro de Suporte, andar com o chamado é trabalho de quem atende —
    // inclusive resolver. `developer` só entra quando o Dev está no meio:
    // o card vive no quadro Dev, está em pendência de Dev, ou existe card Dev
    // ABERTO nascido deste chamado. Aí o chamado só anda depois que aquele
    // fluxo terminar.
    try {
      var _T = ctx.models.Ticket;
      var _t = _T ? await _T.findById(ctx.params.id) : null;
      if (_t) {
        var _emDev = String(_t.quadro || "suporte") !== "suporte" ||
                     String(_t.status || "") === "pendencia_dev";
        if (!_emDev) {
          // Filtrado, não varredura: o handler ao lado percorre a tabela
          // inteira por motivo histórico, mas isto roda em TODA troca de
          // status e não pode custar isso.
          var _filhos = (await _T.findMany({ origem_ticket_id: String(ctx.params.id) })) || [];
          for (var _k = 0; _k < _filhos.length; _k++) {
            if (["aplicado_no_cliente", "descartado"].indexOf(String(_filhos[_k].status)) < 0) {
              _emDev = true;
              break;
            }
          }
        }
        if (!_emDev) minimo = "support";
      }
    } catch (e) {
      // Falha ao inspecionar o card mantém `developer`: na dúvida, a regra
      // mais estrita — errar para o lado de barrar é recuperável, o contrário não.
    }
''' % MARCA


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
    rotas = {(r["method"], r["path"]): r for r in d["routes"]}

    mudadas = 0
    for chave in ALVOS:
        r = rotas.get(chave)
        if not r:
            print(f"   — {chave[0]:6} {chave[1]}: não existe")
            continue
        codigo = r["controllerCode"] or ""
        if MARCA in codigo:
            print(f"   = {chave[0]:6} {chave[1]}: já tem a regra")
            continue
        if codigo.count(DE) != 1:
            print(f"   ! {chave[0]:6} {chave[1]}: esperava 1 'var minimo', achei {codigo.count(DE)} — pulando")
            continue
        novo = codigo.replace(DE, PARA)
        print(f"   {'→' if aplicar else ' '} {chave[0]:6} {chave[1]:24} support quando fora do fluxo Dev")
        if not aplicar:
            continue
        corpo = {"method": chave[0], "path": chave[1], "controllerCode": novo}
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
        print(f"→ publicar tickets: HTTP {cc} {'' if cc < 300 else resp}")


if __name__ == "__main__":
    main()
