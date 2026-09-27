#!/usr/bin/env python3
# =============================================================================
# Mídia do WhatsApp — os BYTES chegam ao chamado (destrava da entrega do Hefler).
#
# Em 17/08 provamos que a Avisa manda a mídia como multipart e a plataforma
# descartava o corpo (plano-midia-whatsapp.md). Em 20/08 o Hefler entregou
# `ctx.files` no runtime: [{ field, filename, contentType, size, data (base64) }],
# >5MB vem sem data com `filesTruncated: true`. Sondado e confirmado.
#
# DUAS COSTURAS, nos pontos que já existiam:
#
#   1. INBOUND — o tradutor já detectava a mídia e punha o rótulo
#      ("[imagem recebida]"); agora, se `ctx.files` trouxe os bytes, o corpo
#      traduzido ganha `media_url = data:<tipo>;base64,<...>` — que a gravação
#      da mensagem (`Msg.create`) já lia e nunca recebia. A bolha do inbox
#      passa a ter o arquivo; >5MB fica só o rótulo (truncado pela plataforma).
#
#   2. TICKET DA CONVERSA — `POST /whatsapp/:id/ticket` passa a copiar as
#      mídias `data:` das mensagens da conversa para `Attachment` do chamado
#      (mesma forma do POST /tickets/:id/attachments: file_url data:) e soma o
#      `attachment_count` materializado. O print do cliente vira evidência.
#
#   python3 scripts/wa-midia-bytes.py            # simula
#   python3 scripts/wa-midia-bytes.py --aplicar
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-midia-bytes.py"


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

# ── 1. inbound: bytes do ctx.files viram media_url ───────────────────────────
INB_VELHO = """      media_type: _mid ? _mid.tipo : null,
    };"""
INB_NOVO = """      media_type: _mid ? _mid.tipo : null,
      // Bytes da mídia (%s): a plataforma agora entrega o multipart
      // em ctx.files; o data: URI cabe no campo media_url que a gravação da
      // mensagem sempre leu e nunca recebia. >5MB chega sem data (truncado
      // pela plataforma) e fica só o rótulo — melhor rótulo que sumiço.
      media_url: (function () {
        try {
          var fs = ctx.files || [];
          for (var _fi = 0; _fi < fs.length; _fi++) {
            if (fs[_fi] && fs[_fi].data) {
              return "data:" + (fs[_fi].contentType || "application/octet-stream") + ";base64," + fs[_fi].data;
            }
          }
        } catch (e) {}
        return null;
      })(),
    };""" % MARCA

# ── 2. ticket da conversa: mídias viram anexos ───────────────────────────────
WT_VELHO = """  var ticket = await m.Ticket.create({"""
WT_NOVO_POS = None  # ancora de inserção pós-criação; localizada dinamicamente

COPIA = """
  // ── Mídias da conversa viram ANEXOS do chamado (%s) ──
  // O print que o cliente mandou é a evidência do problema; sem isto ele
  // ficava preso na bolha do inbox. Forma idêntica ao POST /tickets/:id/
  // attachments (file_url data:), e o attachment_count materializado (que o
  // quadro lê) é somado junto.
  try {
    var _Att = ctx.models.Attachment;
    if (_Att && m.Msg) {
      var _msgs = (await m.Msg.findMany({ conversation_id: id })) || [];
      var _n = 0;
      for (var _mi2 = 0; _mi2 < _msgs.length; _mi2++) {
        var _mm = _msgs[_mi2];
        if (String(_mm.conversation_id || _mm.conversationId) !== String(id)) continue;
        var _mu = String(_mm.media_url || _mm.mediaUrl || "");
        if (_mu.indexOf("data:") !== 0) continue;
        var _tipoArq = (_mu.split(";")[0] || "data:application/octet-stream").slice(5);
        var _ext = (_tipoArq.split("/")[1] || "bin").split("+")[0];
        var _quando = String(_mm.created_at || _mm.timestamp || ts).slice(0, 19).replace(/[:T]/g, "-");
        try {
          await _Att.create({
            ticket_id: ticket.id,
            file_name: "whatsapp-" + (_mm.media_type || "midia") + "-" + _quando + "." + _ext,
            file_url: _mu,
            file_type: _tipoArq,
            file_size: Math.floor((_mu.length - _mu.indexOf(",") - 1) * 3 / 4),
            uploaded_by: me || null,
            created_at: ts,
          });
          _n++;
        } catch (e) {}
      }
      if (_n > 0) {
        try {
          await m.Ticket.update(ticket.id, { attachment_count: Number(ticket.attachment_count || 0) + _n });
        } catch (e) {}
      }
    }
  } catch (e) {}
""" % MARCA


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


def gravar(rota, codigo):
    corpo = {"method": rota["method"], "path": rota["path"], "controllerCode": codigo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    return req(f"{MOD}/routes", "PUT", corpo)


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    por = {(r["method"], r["path"]): r for r in d["routes"]}
    mudou = False

    # 1. inbound
    rota = por[("POST", "/whatsapp/inbound")]
    cod = rota["controllerCode"]
    if MARCA in cod:
        print("= inbound: já aplicado")
    else:
        if cod.count(INB_VELHO) != 1:
            print(f"! inbound: âncora {cod.count(INB_VELHO)}x"); sys.exit(1)
        novo = cod.replace(INB_VELHO, INB_NOVO, 1)
        open("/tmp/wa_inb_bytes.js", "w").write(novo)
        if subprocess.run(["node", "--check", "/tmp/wa_inb_bytes.js"]).returncode != 0:
            sys.exit(1)
        print(f"→ inbound: +media_url dos ctx.files ({len(cod)} → {len(novo)})")
        if aplicar:
            c, r = gravar(rota, novo)
            if c >= 300: print(f"   ❌ {c} {r}"); sys.exit(1)
            mudou = True

    # 2. ticket da conversa — a cópia entra logo após o Log/registro do ticket,
    # antes do return; âncora: a atualização da conversa com o ticket_id.
    rota = por[("POST", "/whatsapp/:id/ticket")]
    cod = rota["controllerCode"]
    if MARCA in cod:
        print("= ticket-da-conversa: já aplicado")
    else:
        alvo = "await m.Conv.update(id, {"
        if cod.count(alvo) != 1:
            print(f"! ticket-da-conversa: âncora {cod.count(alvo)}x"); sys.exit(1)
        novo = cod.replace(alvo, COPIA + "\n  " + alvo, 1)
        open("/tmp/wa_wt_bytes.js", "w").write(novo)
        if subprocess.run(["node", "--check", "/tmp/wa_wt_bytes.js"]).returncode != 0:
            sys.exit(1)
        print(f"→ ticket-da-conversa: +cópia de mídias ({len(cod)} → {len(novo)})")
        if aplicar:
            c, r = gravar(rota, novo)
            if c >= 300: print(f"   ❌ {c} {r}"); sys.exit(1)
            mudou = True

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    if mudou:
        c, r = req(MOD, "PATCH", {"status": "published"})
        print(f"→ publicar whatsapp: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
