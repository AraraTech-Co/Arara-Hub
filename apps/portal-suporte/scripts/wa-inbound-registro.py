#!/usr/bin/env python3
# =============================================================================
# Registro de chegada no webhook de entrada.
#
# Depois de provar que a configuração está certa (URL, token e sessão) e que o
# controller funciona (espelho responde em 0,6 s e grava), sobrou uma pergunta
# que nenhuma das duas pontas responde sozinha: **a Avisa está mesmo
# entregando?** A plataforma não guarda log de requisição, então "não chegou
# mensagem" e "chegou e foi ignorada" são indistinguíveis de fora.
#
# Isto grava uma linha por chegada, ANTES de qualquer filtro, em
# `WaConversationEvents` com `kind = "diag_arrival"`. Guarda só metadado —
# quem, se é grupo, se é do próprio número, se tinha texto — e nunca o token.
#
# Com isso, na próxima mensagem de verdade:
#   sem linha        → não chegou (Avisa não entrega, ou o portão recusou)
#   linha + ignorado → chegou e foi filtrada (grupo, sem texto, própria)
#   linha + conversa → funcionou
#
#   python3 scripts/wa-inbound-registro.py --ligar
#   python3 scripts/wa-inbound-registro.py --ver
#   python3 scripts/wa-inbound-registro.py --desligar    # ao terminar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEITURA = "/whatsapp/diagnostico/chegadas"
MARCA = "scripts/wa-inbound-registro.py"
MARCA_DESFECHO = "Desfecho da entrega"


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

# Entra logo no começo do handler, antes da conferência de token do controller
# (a da plataforma acontece antes e não dá para observar daqui).
REGISTRO = """async function handler(ctx) {
  // ── Registro de chegada (%s) ──
  // Nunca derruba a entrega: tudo em try/catch, sem await de escrita crítica.
  try {
    var _ev = ctx.models.WaConversationEvents;
    if (_ev) {
      var _c = ctx.body || {};
      var _p = null;
      try { _p = _c.jsonData ? JSON.parse(_c.jsonData) : null; } catch (e) { _p = null; }
      var _i = (_p && _p.event && _p.event.Info) || {};
      var _m = (_p && _p.event && _p.event.Message) || {};
      await _ev.create({
        id: "diag_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        conversation_id: "diagnostico",
        kind: "diag_arrival",
        payload: JSON.stringify({
          temJsonData: _c.jsonData !== undefined,
          chaves: Object.keys(_c).join(","),
          chat: _i.Chat || null,
          grupo: _i.IsGroup === true,
          doProprioNumero: _i.IsFromMe === true,
          tiposDeMensagem: Object.keys(_m).join(","),
          // Corpo vazio COM a requisição chegando (caso da mídia, 17/08) só se
          // explica olhando o que veio CRU: content-type e tamanho dizem se a
          // Avisa mandou multipart, JSON ou nada. O prefixo mostra os nomes dos
          // campos — em multipart o cabeçalho vem antes do binário.
          contentType: (ctx.headers && (ctx.headers["content-type"] || ctx.headers["Content-Type"])) || null,
          tipoDoCorpo: typeof ctx.body,
          tamanhoCru: ctx.rawBody ? String(ctx.rawBody).length : null,
          inicioDoCru: ctx.rawBody ? String(ctx.rawBody).slice(0, 220) : null,
        }).slice(0, 1400),
        created_at: new Date().toISOString(),
      });
    }
  } catch (e) {}
""" % MARCA

# O registro de chegada prova que o evento ENTROU. Não diz o que aconteceu
# depois — e foi exatamente esse o buraco: em 17/08 13:07 chegou uma mensagem
# 1:1 de verdade (`Chat` em `@lid`, o identificador novo de privacidade do
# WhatsApp) e nenhuma conversa nasceu. Este envelope grava o DESFECHO: o corpo
# já traduzido (telefone, se veio texto) e a exceção, se houver.
DESFECHO = """
// ── %s (scripts/wa-inbound-registro.py) ──
var _handlerReal = handler;
async function _comDesfecho(ctx) {
  var _r = null, _erro = null;
  try { _r = await _handlerReal(ctx); }
  catch (e) { _erro = String((e && e.message) || e).slice(0, 300); }
  try {
    var _ev = ctx.models.WaConversationEvents;
    if (_ev) {
      var _b = ctx.body || {};
      await _ev.create({
        id: "diag_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        conversation_id: "diagnostico",
        kind: "diag_outcome",
        payload: JSON.stringify({
          erro: _erro,
          traduzido: _b.phone !== undefined,
          telefone: _b.phone || null,
          temTexto: !!_b.message,
          doProprioNumero: _b.from_me === true,
        }).slice(0, 900),
        created_at: new Date().toISOString(),
      });
    }
  } catch (e) {}
  if (_erro) throw new Error(_erro);
  return _r;
}
module.exports = { handler: _comDesfecho };
""" % MARCA_DESFECHO

LEITURA_JS = """
// TEMPORÁRIO — scripts/wa-inbound-registro.py
async function handler(ctx) {
  var Ev = ctx.models.WaConversationEvents;
  var todos = (await Ev.findMany({})) || [];
  var meus = todos.filter(function (x) { return String(x.kind || "").indexOf("diag_") === 0; });
  meus.sort(function (a, b) { return String(a.created_at) < String(b.created_at) ? 1 : -1; });
  // `?purgar=1` limpa as linhas de diagnóstico — elas moram na tabela de
  // eventos de conversa, que é de produção, e não podem ficar lá para sempre.
  if (ctx.query && ctx.query.purgar) {
    var n = 0;
    for (var i = 0; i < meus.length; i++) {
      try { await Ev.delete(meus[i].id); n++; } catch (e) {}
    }
    return ctx.reply.send({ success: true, data: { apagados: n } });
  }
  return ctx.reply.send({
    success: true,
    data: { total: meus.length, ultimas: meus.slice(0, 15) },
  });
}
module.exports = { handler };
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


def rota_inbound():
    _, d = req(f"{MOD}/routes")
    return [r for r in d["routes"] if r["path"] == "/whatsapp/inbound"][0]


def gravar(codigo, r):
    corpo = {"method": "POST", "path": "/whatsapp/inbound", "controllerCode": codigo}
    for extra in ("authMode", "webhookSecretName"):
        if r.get(extra):
            corpo[extra] = r[extra]
    c, d = req(f"{MOD}/routes", "PUT", corpo)
    print(f"→ inbound: HTTP {c} {'' if c < 300 else d}")
    return c < 300


def publicar():
    c, d = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar whatsapp: HTTP {c} {'' if c < 300 else d}")


def purgar():
    """Apaga as linhas de diagnóstico da tabela de eventos."""
    c, d = req(f"{API}/v1/r/portal-suporte{LEITURA}?purgar=1")
    print(f"→ purgar registros: HTTP {c} {json.dumps(d, ensure_ascii=False) if isinstance(d, dict) else d}")


def main():
    if "--ligar" in sys.argv:
        r = rota_inbound()
        cod = r["controllerCode"]
        if MARCA in cod:
            print("= já ligado")
        else:
            alvo = "async function handler(ctx) {"
            if cod.count(alvo) != 1:
                print("! não achei o começo do handler de forma única"); sys.exit(1)
            if not gravar(cod.replace(alvo, REGISTRO, 1), r):
                sys.exit(1)
        # Envelope de desfecho: entra no fim, trocando a exportação.
        r = rota_inbound()
        cod = r["controllerCode"]
        if MARCA_DESFECHO not in cod:
            alvo = "module.exports = { handler };"
            if cod.count(alvo) != 1:
                print("! exportação inesperada; desfecho não instalado")
            else:
                gravar(cod.replace(alvo, DESFECHO, 1), r)
        c, d = req(f"{MOD}/routes", "PUT",
                   {"method": "GET", "path": LEITURA, "controllerCode": LEITURA_JS})
        print(f"→ leitura: HTTP {c} {'' if c < 300 else d}")
        publicar()
    elif "--desligar" in sys.argv:
        r = rota_inbound()
        cod = r["controllerCode"]
        # Envelope de desfecho sai primeiro: ele troca a exportação.
        if MARCA_DESFECHO in cod:
            i = cod.index("\n// ── " + MARCA_DESFECHO)
            cod = cod[:i] + "\nmodule.exports = { handler };\n"
            gravar(cod, r)
            r = rota_inbound()
            cod = r["controllerCode"]
        if MARCA in cod:
            i = cod.index("  // ── Registro de chegada")
            j = cod.index("  } catch (e) {}\n", i) + len("  } catch (e) {}\n")
            gravar(cod[:i] + cod[j:], r)
        purgar()
        publicar()
    elif "--ver" in sys.argv:
        c, d = req(f"{API}/v1/r/portal-suporte{LEITURA}")
        print(json.dumps(d, indent=2, ensure_ascii=False) if isinstance(d, dict) else f"HTTP {c} {d}")
    else:
        print(__doc__ or "use --ligar | --ver | --desligar")


if __name__ == "__main__":
    main()
