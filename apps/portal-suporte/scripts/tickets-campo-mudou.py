#!/usr/bin/env python3
# =============================================================================
# Reclassificar é MUDAR prioridade/severidade — não é mencioná-las.
#
# A guarda por campo do scripts/tickets-permissoes.py subia a exigência para
# `developer` assim que `priority` ou `severity` APARECIAM no corpo:
#
#     if (_b.priority !== undefined || _b.severity !== undefined) minimo = "developer";
#
# Só que o formulário de edição manda o chamado inteiro — `severity` vai junto
# mesmo quando a pessoa mexeu apenas no título (app/_hooks/use-ticket-edit-form.ts).
# Resultado: em 03/09/2026 o atendimento não conseguia corrigir o TÍTULO de um
# chamado, e recebia "Sem permissão para esta operação" sem entender por quê.
#
# A intenção da regra estava certa e o gatilho errado. Agora o servidor compara
# com o valor atual do chamado: só exige `developer` quando o valor MUDA.
#
# Onde não há de/para (o `bulk-action` não tem `:id`), o comportamento antigo
# continua valendo — presença basta. Na dúvida, a regra mais estrita.
#
#   python3 scripts/tickets-campo-mudou.py            # simula
#   python3 scripts/tickets-campo-mudou.py --aplicar  # grava e publica
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/tickets-campo-mudou.py"


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

DE = '''    var _b = ctx.body || {};
    var _acao = String(_b.action || _b.type || "");
    if (_b.priority !== undefined || _b.severity !== undefined ||
        _acao === "set_priority" || _acao === "set_status") {
      minimo = "developer";
    }
'''

PARA = '''    var _b = ctx.body || {};
    var _acao = String(_b.action || _b.type || "");
    // ── %s ──
    // Reclassificar é MUDAR prioridade/severidade, não mencioná-las. O gatilho
    // era a presença do campo no corpo — e o formulário de edição manda o
    // chamado inteiro, então trocar só o título já exigia `developer` e barrava
    // o atendimento. Aqui o valor é comparado com o que está gravado.
    var _mudou = false;
    try {
      var _T = ctx.models.Ticket;
      var _atual = (_T && ctx.params && ctx.params.id)
        ? await _T.findById(ctx.params.id)
        : null;
      var _dif = function (campo) {
        if (_b[campo] === undefined) return false;
        // Sem o de/para (bulk-action não tem `:id`), presença basta — na
        // dúvida, a regra mais estrita.
        if (!_atual) return true;
        var a = _b[campo] === null ? "" : String(_b[campo]);
        var b = _atual[campo] === null || _atual[campo] === undefined ? "" : String(_atual[campo]);
        return a !== b;
      };
      _mudou = _dif("priority") || _dif("severity");
    } catch (e) {
      _mudou = (_b.priority !== undefined || _b.severity !== undefined);
    }
    if (_mudou || _acao === "set_priority" || _acao === "set_status") {
      minimo = "developer";
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

    mudadas = 0
    for r in d["routes"]:
        codigo = r["controllerCode"] or ""
        if DE not in codigo:
            continue
        if MARCA in codigo:
            print(f"   = {r['method']:6} {r['path']}: já corrigida")
            continue
        novo = codigo.replace(DE, PARA)
        print(f"   {'→' if aplicar else ' '} {r['method']:6} {r['path']:26} exige developer só se o valor MUDAR")
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
        print(f"→ publicar tickets: HTTP {cc} {'' if cc < 300 else resp}")


if __name__ == "__main__":
    main()
