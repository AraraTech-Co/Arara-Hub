#!/usr/bin/env python3
# =============================================================================
# Mídia recebida no WhatsApp: parar de sumir, e descobrir se os bytes chegam.
#
# Duas coisas num script só, porque mexem no mesmo trecho do tradutor:
#
# 1) CONSERTO — print sem legenda deixava a mensagem SUMIR.
#    O tradutor extraía só a legenda; sem legenda, `texto` ficava nulo e o
#    handler devolvia `{ignorado: "sem texto"}`. Resultado: o cliente manda um
#    print, o atendente não vê nada, e ninguém fica sabendo que existe uma
#    evidência do problema. Agora a mensagem entra com um rótulo do que veio
#    ("[imagem recebida]", "[áudio recebido]"…), e a legenda, quando existe,
#    continua sendo o corpo.
#
# 2) SONDA — registra o MAPA DE CAMPOS da mídia (nomes, tipos e tamanhos;
#    nunca o conteúdo) no primeiro anexo que chegar. É o que decide o resto:
#
#      veio base64          → dá para guardar como anexo e levar para o ticket
#      veio só URL cifrada  → não dá para baixar (a Avisa não tem rota de
#                             download: downloadMedia/getMedia/getBase64 são
#                             404, sondados em 17/08)
#
#    A sonda grava no máximo 5 registros e se cala — não é log permanente.
#
#   python3 scripts/wa-midia-entrada.py            # simula
#   python3 scripts/wa-midia-entrada.py --aplicar
#   python3 scripts/wa-midia-entrada.py --ver      # lê o que a sonda capturou
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-midia-entrada.py"


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
LEITURA = "/whatsapp/diagnostico/midia"

# ── O que substitui o descarte silencioso ────────────────────────────────────
# O descarte de "sem texto" já foi envolvido pelo diag_shape em
# scripts/wa-inbound-texto-e-lid.py — a âncora é só a linha que extrai o texto,
# e o rótulo entra logo depois dela.
VELHO = """    var texto = _texto(msg);"""

NOVO = """    // Mídia — ver %s.
    // Antes: sem legenda, `texto` era nulo e a mensagem era DESCARTADA. Um
    // print sem legenda sumia, e o atendente não sabia que existia evidência.
    var _MIDIAS = [
      ["imageMessage", "imagem", "[imagem recebida]"],
      ["videoMessage", "video", "[vídeo recebido]"],
      ["audioMessage", "audio", "[áudio recebido]"],
      ["pttMessage", "audio", "[áudio recebido]"],
      ["documentMessage", "documento", "[documento recebido]"],
      ["stickerMessage", "figurinha", "[figurinha recebida]"],
    ];
    var _mid = null;
    for (var _mi = 0; _mi < _MIDIAS.length && !_mid; _mi++) {
      var _corpoMid = _obj(msg[_MIDIAS[_mi][0]]);
      // Mensagem temporária embrulha a mídia um nível abaixo.
      if (!_corpoMid) {
        var _env = _obj(msg.ephemeralMessage) || _obj(msg.viewOnceMessage) || _obj(msg.viewOnceMessageV2);
        var _dentro = _env ? _obj(_env.message) : null;
        if (_dentro) _corpoMid = _obj(_dentro[_MIDIAS[_mi][0]]);
      }
      if (_corpoMid) {
        _mid = { campo: _MIDIAS[_mi][0], tipo: _MIDIAS[_mi][1], rotulo: _MIDIAS[_mi][2], corpo: _corpoMid };
      }
    }

    // SONDA: guarda o MAPA DE CAMPOS do anexo (nome, tipo, tamanho) — nunca o
    // conteúdo. Máximo de 5 registros; depois se cala sozinha.
    if (_mid) {
      try {
        var _Ev = ctx.models.WaConversationEvents;
        if (_Ev) {
          var _jaTem = ((await _Ev.findMany({})) || []).filter(function (e) {
            return e.kind === "diag_midia";
          }).length;
          if (_jaTem < 5) {
            var _mapa = {};
            for (var _k in _mid.corpo) {
              var _v = _mid.corpo[_k];
              _mapa[_k] = typeof _v === "string"
                ? ("string(" + _v.length + ")")
                : (typeof _v === "object" && _v !== null ? "objeto" : typeof _v);
            }
            await _Ev.create({
              id: "dmid_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              conversation_id: "diagnostico",
              kind: "diag_midia",
              payload: JSON.stringify({
                campo: _mid.campo,
                mimetype: _mid.corpo.mimetype || null,
                tamanhoDeclarado: _mid.corpo.fileLength || _mid.corpo.fileLengthBytes || null,
                camposDaMidia: _mapa,
                camposDoEvento: Object.keys(msg).join(","),
              }).slice(0, 1800),
              created_at: new Date().toISOString(),
            });
          }
        }
      } catch (e) {}
    }

    var texto = _texto(msg);
    // Sem legenda, o rótulo do anexo VIRA o corpo — a mensagem entra na
    // conversa e o atendente vê que o cliente mandou algo. O descarte
    // "sem texto" logo abaixo passa a valer só para o que não é mídia.
    if (!texto && _mid) texto = _mid.rotulo;""" % MARCA

# O corpo traduzido passa a levar o tipo de mídia, que já era lido na gravação
# (`body.media_type`) e nunca chegava preenchido.
VELHO_BODY = """      instance: "avisa",
      from_me: info.IsFromMe === true,
    };"""
NOVO_BODY = """      instance: "avisa",
      from_me: info.IsFromMe === true,
      // `media_type` já era gravado na mensagem e nunca vinha preenchido:
      // o tradutor não repassava. Sem ele, a bolha não sabe que é anexo.
      media_type: _mid ? _mid.tipo : null,
    };"""

LEITURA_JS = """
// TEMPORÁRIO — scripts/wa-midia-entrada.py
async function handler(ctx) {
  var Ev = ctx.models.WaConversationEvents;
  var todos = (await Ev.findMany({})) || [];
  var meus = todos.filter(function (x) { return x.kind === "diag_midia"; });
  meus.sort(function (a, b) { return String(a.created_at) < String(b.created_at) ? 1 : -1; });
  return ctx.reply.send({ success: true, data: { total: meus.length, capturas: meus.slice(0, 5) } });
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
        with urllib.request.urlopen(r, timeout=240) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    if "--ver" in sys.argv:
        c, d = req(f"{API}/v1/r/portal-suporte{LEITURA}")
        if c >= 300 or not isinstance(d, dict):
            print(f"! HTTP {c} {d}")
            return
        dados = d["data"]
        print(f"capturas de mídia: {dados['total']}")
        for cap in dados["capturas"]:
            print(f"\n--- {cap['created_at']}")
            print(json.dumps(json.loads(cap["payload"]), indent=1, ensure_ascii=False))
        if not dados["total"]:
            print("(nenhuma ainda — mande um print para o número e rode de novo)")
        return

    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    rota = [r for r in d["routes"] if r["path"] == "/whatsapp/inbound"][0]
    codigo = rota["controllerCode"]
    if MARCA in codigo:
        print("= já aplicado")
        return
    for velho in (VELHO, VELHO_BODY):
        if codigo.count(velho) != 1:
            print(f"! âncora aparece {codigo.count(velho)}x; revise o script")
            sys.exit(1)
    novo = codigo.replace(VELHO, NOVO, 1).replace(VELHO_BODY, NOVO_BODY, 1)

    open("/tmp/inbound_midia.js", "w").write(novo)
    print(f"→ inbound: {len(codigo)} → {len(novo)} caracteres (cópia em /tmp/inbound_midia.js)")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return

    corpo = {"method": "POST", "path": "/whatsapp/inbound", "controllerCode": novo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    c, r = req(f"{MOD}/routes", "PUT", corpo)
    print(f"→ gravar inbound: HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)
    c, r = req(f"{MOD}/routes", "PUT",
               {"method": "GET", "path": LEITURA, "controllerCode": LEITURA_JS})
    print(f"→ leitura da sonda: HTTP {c} {'' if c < 300 else r}")
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
