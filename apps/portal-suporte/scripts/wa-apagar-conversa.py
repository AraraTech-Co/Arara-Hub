#!/usr/bin/env python3
# =============================================================================
# Apaga a conversa de UM número — para testar o fluxo do zero.
#
# O motor guarda em `conversation.menu_node` onde a pessoa parou. Testar de
# novo com a conversa antiga aberta retomaria do meio do menu, e não da
# saudação; por isso "testar do zero" quer dizer apagar a conversa.
#
# Casa pelos últimos 8 dígitos — o número é gravado ora com 55, ora sem, ora
# com o nono dígito. Comparar a string inteira erraria justamente no caso que
# interessa.
#
# Mostra o que vai apagar ANTES de apagar, e só apaga com `--apagar`.
#
#   python3 scripts/wa-apagar-conversa.py 19995537447            # mostra
#   python3 scripts/wa-apagar-conversa.py 19995537447 --apagar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMINHO = "/whatsapp/diagnostico/apagar-conversa"


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

CONTROLLER = """
// TEMPORÁRIO — scripts/wa-apagar-conversa.py
async function handler(ctx) {
  var alvo = String((ctx.query && ctx.query.telefone) || "").replace(/[^0-9]/g, "").slice(-8);
  if (alvo.length !== 8) return ctx.reply.status(400).send({ error: "informe o telefone" });
  var apagar = (ctx.query && ctx.query.apagar) === "1";

  var Conv = ctx.models.WhatsAppConversation;
  var Msg = ctx.models.WhatsAppMessage;
  var Ev = ctx.models.WaConversationEvents;
  var Nota = ctx.models.WaInternalNotes;
  var Tag = ctx.models.WaConversationTags;

  var todas = (await Conv.findMany({})) || [];
  var minhas = todas.filter(function (c) {
    return String(c.remote_jid || c.remoteJid || "").replace(/[^0-9]/g, "").slice(-8) === alvo;
  });

  var relatorio = [], apagados = { conversas: 0, mensagens: 0, eventos: 0, notas: 0, etiquetas: 0 };
  for (var i = 0; i < minhas.length; i++) {
    var c = minhas[i];
    var msgs = ((await Msg.findMany({})) || []).filter(function (m) {
      return String(m.conversation_id) === String(c.id);
    });
    relatorio.push({
      id: c.id, numero: c.remote_jid, nome: c.contact_name,
      fase: c.phase, no_do_menu: c.menu_node, mensagens: msgs.length,
      criada: c.created_at,
    });
    if (!apagar) continue;

    for (var j = 0; j < msgs.length; j++) {
      try { await Msg.delete(msgs[j].id); apagados.mensagens++; } catch (e) {}
    }
    for (var nome in { WaConversationEvents: Ev, WaInternalNotes: Nota, WaConversationTags: Tag }) {}
    var filhos = [[Ev, "eventos"], [Nota, "notas"], [Tag, "etiquetas"]];
    for (var f = 0; f < filhos.length; f++) {
      var M = filhos[f][0];
      if (!M) continue;
      var linhas = ((await M.findMany({})) || []).filter(function (x) {
        return String(x.conversation_id) === String(c.id);
      });
      for (var k = 0; k < linhas.length; k++) {
        try { await M.delete(linhas[k].id); apagados[filhos[f][1]]++; } catch (e) {}
      }
    }
    try { await Conv.delete(c.id); apagados.conversas++; } catch (e) {}
  }

  return ctx.reply.send({
    success: true,
    data: { encontradas: relatorio, apagou: apagar ? apagados : null },
  });
}
module.exports = { handler };
"""

STUB = """// Desativada — instrumento de scripts/wa-apagar-conversa.py.
async function handler(ctx) {
  return ctx.reply.status(410).send({ success: false, error: "Rota desativada" });
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


def gravar(codigo):
    c, d = req(f"{MOD}/routes", "PUT", {"method": "GET", "path": CAMINHO, "controllerCode": codigo})
    if c >= 300:
        print(f"! rota: HTTP {c} {d}")
        sys.exit(1)
    req(MOD, "PATCH", {"status": "published"})


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return
    telefone = args[0]
    apagar = "--apagar" in sys.argv

    gravar(CONTROLLER)
    try:
        c, d = req(f"{API}/v1/r/portal-suporte{CAMINHO}?telefone={telefone}"
                   + ("&apagar=1" if apagar else ""))
        if c >= 300 or not isinstance(d, dict):
            print(f"! HTTP {c} {d}")
            return
        achadas = d["data"]["encontradas"]
        if not achadas:
            print(f"nenhuma conversa com final {telefone[-8:]}")
        for a in achadas:
            print(f"   {a['id']}  {a['numero']}  {a.get('nome') or '(sem nome)'}  "
                  f"fase={a.get('fase')}  nó={a.get('no_do_menu')}  {a['mensagens']} mensagens")
        if apagar:
            print(f"\n→ apagado: {json.dumps(d['data']['apagou'], ensure_ascii=False)}")
        elif achadas:
            print("\n   (simulação — use --apagar)")
    finally:
        gravar(STUB)


if __name__ == "__main__":
    main()
