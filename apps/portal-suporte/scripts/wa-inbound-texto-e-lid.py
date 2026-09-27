#!/usr/bin/env python3
# =============================================================================
# Conserta a leitura do payload de entrada do WhatsApp. Correção definitiva.
#
# O que quebrou, com evidência: em 17/08 chegaram duas mensagens 1:1 reais
# (`Chat: 205862194950234@lid`, `Message: conversation,messageContextInfo`) e
# nenhuma virou conversa. O registro de desfecho mostrou `traduzido: false`,
# `temTexto: false` e nenhuma exceção — ou seja, o handler saiu no filtro
# "sem texto" antes de traduzir.
#
# Duas premissas velhas causaram isso, e as duas vêm do mesmo lugar: o tradutor
# foi escrito contra o formato ANTIGO do WhatsApp.
#
#   1. TEXTO. `_texto` só olhava um nível: `conversation` como string, ou
#      `extendedTextMessage.text`. Hoje o conteúdo chega embrulhado —
#      `ephemeralMessage` (mensagem temporária, que virou padrão em muita
#      conta), `viewOnceMessage`, `editedMessage` — e o texto fica um ou dois
#      níveis abaixo. Sem achar, o handler descarta a mensagem em silêncio.
#
#   2. NÚMERO. `Chat` agora vem como `@lid` (o identificador de privacidade
#      novo) em vez de `@s.whatsapp.net`. O código já tentava `SenderAlt`, mas
#      não `Sender` — e sem nenhum dos dois o LID acabava usado como telefone.
#
# A correção:
#
#   - `_texto` passa a descer nos envelopes (até 4 níveis) e a aceitar tanto
#     string quanto objeto com `text`/`caption`/`conversation`;
#   - o número passa a preferir, nesta ordem, `Chat` telefônico → `SenderAlt`
#     → `Sender` (este só quando NÃO é mensagem nossa, senão a conversa do
#     cliente seria gravada com o nosso próprio número);
#   - quando ainda assim não houver texto, grava um registro `diag_shape` com
#     o MAPA DE TIPOS do payload (nomes de campo e `typeof`, nunca conteúdo).
#     Se aparecer um formato novo amanhã, o diagnóstico já vem pronto em vez
#     de custar mais uma rodada de "manda um oi".
#
#   python3 scripts/wa-inbound-texto-e-lid.py            # simula
#   python3 scripts/wa-inbound-texto-e-lid.py --aplicar  # grava e publica
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-inbound-texto-e-lid.py"


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

# ── Novo extrator de texto ───────────────────────────────────────────────────
TEXTO_NOVO = """  // Extrai o texto em qualquer das formas que o WhatsApp usa hoje. Ver
  // %s: a versão anterior olhava um nível só e
  // descartava mensagem temporária, "ver uma vez" e editada — que é o que
  // chega de conta comum em 2026.
  function _pedaco(v) {
    if (typeof v === "string" && v.trim()) return v.trim();
    var o = _obj(v);
    if (!o) return null;
    return _pedaco(o.text) || _pedaco(o.caption) || _pedaco(o.conversation)
        || _pedaco(o.selectedRowId) || _pedaco(o.selectedButtonId)
        || _pedaco(o.selectedDisplayText) || _pedaco(o.title);
  }
  function _texto(m, prof) {
    prof = prof || 0;
    if (!m || prof > 4) return null;
    var direto = _pedaco(m.conversation)
      || _pedaco(m.extendedTextMessage) || _pedaco(m.imageMessage)
      || _pedaco(m.videoMessage) || _pedaco(m.documentMessage)
      || _pedaco(m.audioMessage) || _pedaco(m.buttonsResponseMessage)
      || _pedaco(m.templateButtonReplyMessage)
      || _pedaco((_obj(m.listResponseMessage) || {}).singleSelectReply)
      || _pedaco((_obj(m.interactiveResponseMessage) || {}).nativeFlowResponseMessage);
    if (direto) return direto;
    // Envelopes: o conteúdo real fica em `.message`, um nível abaixo.
    var envelopes = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2",
                     "viewOnceMessageV2Extension", "documentWithCaptionMessage",
                     "editedMessage", "protocolMessage", "deviceSentMessage"];
    for (var i = 0; i < envelopes.length; i++) {
      var e = _obj(m[envelopes[i]]);
      if (!e) continue;
      var t = _texto(_obj(e.message) || e, prof + 1);
      if (t) return t;
    }
    return null;
  }
""" % MARCA

TEXTO_VELHO_INICIO = "  function _texto(m) {"
TEXTO_VELHO_FIM = "  }\n"

# ── Diagnóstico de formato quando não há texto ───────────────────────────────
SEM_TEXTO_NOVO = """    if (!texto) {
      // Formato desconhecido: guarda o MAPA DE TIPOS (nome do campo e typeof),
      // nunca o conteúdo. É o que evita gastar outra rodada de teste manual
      // para descobrir a forma de um payload novo. Ver %s.
      try {
        var _evd = ctx.models.WaConversationEvents;
        if (_evd) {
          var _mapa = {};
          for (var _k in msg) { _mapa[_k] = typeof msg[_k]; }
          await _evd.create({
            id: "diag_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            conversation_id: "diagnostico",
            kind: "diag_shape",
            payload: JSON.stringify({ chat: chat, tipos: _mapa }).slice(0, 900),
            created_at: new Date().toISOString(),
          });
        }
      } catch (e) {}
      return ok(ctx, { ignorado: "sem texto" });
    }
""" % MARCA

SEM_TEXTO_VELHO = '    if (!texto) return ok(ctx, { ignorado: "sem texto" });\n'

# ── Escolha do número (LID) ──────────────────────────────────────────────────
JID_VELHO = """    var alt = _str(info.SenderAlt) || "";
    var jid = /@s\\.whatsapp\\.net/i.test(chat) ? chat
            : (/@s\\.whatsapp\\.net/i.test(alt) ? alt : chat);
"""

JID_NOVO = """    // `Chat` hoje costuma vir como `<numero>@lid` — identificador de
    // privacidade, NÃO telefone. O telefone real, quando existe, está em
    // `SenderAlt` ou `Sender`. `Sender` só entra quando a mensagem NÃO é
    // nossa: em mensagem própria ele é o nosso número, e usá-lo gravaria a
    // conversa do cliente sob o número da Arara. Ver %s.
    var _ehTel = function (v) { return /@s\\.whatsapp\\.net/i.test(String(v || "")); };
    var alt = _str(info.SenderAlt) || "";
    var remetente = info.IsFromMe === true ? "" : (_str(info.Sender) || "");
    var jid = _ehTel(chat) ? chat : (_ehTel(alt) ? alt : (_ehTel(remetente) ? remetente : chat));
""" % MARCA


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
        print("= correção já aplicada")
        return

    # 1) troca o extrator de texto inteiro (do início da função até o `}`)
    i = codigo.find(TEXTO_VELHO_INICIO)
    if i < 0:
        print("! não achei _texto; o controller mudou de forma")
        sys.exit(1)
    j = codigo.find("\n  }\n", i)
    if j < 0:
        print("! não achei o fim de _texto")
        sys.exit(1)
    novo = codigo[:i] + TEXTO_NOVO + codigo[j + len("\n  }\n"):]

    # 2) diagnóstico de formato no lugar do descarte silencioso
    if SEM_TEXTO_VELHO not in novo:
        print("! não achei o descarte 'sem texto'")
        sys.exit(1)
    novo = novo.replace(SEM_TEXTO_VELHO, SEM_TEXTO_NOVO, 1)

    # 3) escolha do número, agora ciente de LID
    if JID_VELHO not in novo:
        print("! não achei a escolha do jid")
        sys.exit(1)
    novo = novo.replace(JID_VELHO, JID_NOVO, 1)

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
    # Publicar promove o rascunho INTEIRO — ver scripts/kanban-enriquecer.py.
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
