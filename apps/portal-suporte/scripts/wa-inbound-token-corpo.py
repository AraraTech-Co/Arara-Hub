#!/usr/bin/env python3
# =============================================================================
# Conserta a conferência de token do webhook de entrada.
#
# Sintoma: mensagem real chegava (registro de chegada gravava a linha), o
# handler saía sem erro, sem tradução e sem sequer alcançar o filtro de texto
# — nenhum `diag_shape` era gravado.
#
# Causa: a Avisa manda DOIS tokens diferentes na mesma requisição —
#
#   ?token=<nosso segredo>     na URL  → é o que a plataforma valida
#   token=<token da instância> no corpo do formulário
#
# e o controller lia o do CORPO primeiro:
#
#   var recebido = cru.token || (ctx.query && ctx.query.token) || "";
#
# Como o token da instância nunca é igual ao nosso segredo, a comparação
# falhava sempre e ele respondia 403. O portão da plataforma tinha aprovado a
# requisição pela URL; quem recusava era o nosso próprio código logo depois —
# em silêncio, porque 403 de webhook não aparece em tela nenhuma.
#
# Correção: aceitar quando QUALQUER uma das duas origens bater, comparando as
# duas (URL primeiro, que é a origem canônica). Continua fail-closed: sem
# segredo cadastrado, ou com as duas origens erradas, recusa como antes.
#
# De quebra, o registro de chegada passa a gravar dois booleanos —
# `tokenUrlConfere` e `tokenCorpoConfere` — para que uma divergência dessas
# apareça no primeiro evento, em vez de custar dias.
#
#   python3 scripts/wa-inbound-token-corpo.py            # simula
#   python3 scripts/wa-inbound-token-corpo.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-inbound-token-corpo.py"


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

VELHO = """    var esperado = ctx.secrets ? await ctx.secrets.get("avisa_webhook_secret") : null;
    var recebido = cru.token || (ctx.query && ctx.query.token) || "";
    if (!esperado || String(recebido) !== String(esperado)) {
      return fail(ctx, 403, "Token do webhook inválido");
    }
"""

NOVO = """    // A Avisa manda DOIS tokens: o nosso segredo na URL (`?token=`, que é o
    // que a plataforma valida) e o token da INSTÂNCIA dela no corpo do
    // formulário. Ler o do corpo primeiro fazia esta conferência falhar
    // sempre — 403 silencioso, com a mensagem já dentro de casa. Ver %s.
    var esperado = ctx.secrets ? await ctx.secrets.get("avisa_webhook_secret") : null;
    var origens = [(ctx.query && ctx.query.token) || "", cru.token || ""];
    var confere = false;
    for (var _t = 0; _t < origens.length; _t++) {
      if (esperado && String(origens[_t]) === String(esperado)) confere = true;
    }
    // Fail-closed: sem segredo cadastrado, ou nenhuma origem batendo, recusa.
    if (!confere) {
      return fail(ctx, 403, "Token do webhook inválido");
    }
""" % MARCA

# Booleanos no registro de chegada: divergência entre URL e corpo passa a
# aparecer no primeiro evento.
LOG_VELHO = """          tiposDeMensagem: Object.keys(_m).join(","),
"""
LOG_NOVO = """          tiposDeMensagem: Object.keys(_m).join(","),
          tokenUrlConfere: _seg ? String((ctx.query && ctx.query.token) || "") === String(_seg) : null,
          tokenCorpoConfere: _seg ? String(_c.token || "") === String(_seg) : null,
"""

LOG_SEGREDO_VELHO = """      var _i = (_p && _p.event && _p.event.Info) || {};
"""
LOG_SEGREDO_NOVO = """      var _i = (_p && _p.event && _p.event.Info) || {};
      var _seg = null;
      try { _seg = ctx.secrets ? await ctx.secrets.get("avisa_webhook_secret") : null; } catch (e) {}
"""


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
        return e.code, e.read().decode("utf-8", "replace")[:400]


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    rota = [r for r in d["routes"] if r["path"] == "/whatsapp/inbound"][0]
    codigo = rota["controllerCode"]

    if MARCA in codigo:
        print("= já aplicado")
        return
    if VELHO not in codigo:
        print("! a conferência de token mudou de forma; revise o script")
        sys.exit(1)

    novo = codigo.replace(VELHO, NOVO, 1)
    if LOG_SEGREDO_VELHO in novo and "_seg" not in novo.split("// ── Tradução")[0]:
        novo = novo.replace(LOG_SEGREDO_VELHO, LOG_SEGREDO_NOVO, 1)
        novo = novo.replace(LOG_VELHO, LOG_NOVO, 1)
        print("→ registro de chegada agora anota as duas origens de token")

    print(f"→ controller: {len(codigo)} → {len(novo)} caracteres")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return

    corpo = {"method": "POST", "path": "/whatsapp/inbound", "controllerCode": novo}
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
