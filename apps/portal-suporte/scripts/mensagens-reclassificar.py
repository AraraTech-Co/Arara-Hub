#!/usr/bin/env python3
# =============================================================================
# Reclassificar duas mensagens: internas → conversa (pedido do analista, 20/08).
#
# Durante o bug do polling (corrigido), o analista lançou duas mensagens
# destinadas ao CLIENTE no formulário de comentários da equipe. Elas nasceram
# `is_internal: true` e, com a separação agora correta, ficaram presas em
# Comentários. Não é apagar e redigitar — é virar a chave `is_internal` das
# duas linhas, preservando autor e data.
#
# A identificação é pelo INÍCIO EXATO do texto, e o script só age quando acha
# exatamente UMA linha para cada trecho — ambiguidade aborta.
#
#   python3 scripts/mensagens-reclassificar.py            # lista (dry-run)
#   python3 scripts/mensagens-reclassificar.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Trechos padrão do caso de 20/08; use --trecho "..." (repetível) para outros.
TRECHOS = [
    "Com a nova foto foi identificado que a vers",
    "Depois da atualiza",
]


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
CAMINHO = "/diag/mensagens-reclassificar"


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


ROTA = '''// TEMPORÁRIA — scripts/mensagens-reclassificar.py (vira 410 ao final)
async function handler(ctx) {
  var M = ctx.models.TicketMessage;
  var body = ctx.body || {};
  var trechos = Array.isArray(body.trechos) ? body.trechos : [];
  var aplicar = body.aplicar === true;
  var todas = (await M.findMany({})) || [];
  function limpo(s) { return String(s || "").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim(); }
  var resultado = [];
  for (var i = 0; i < trechos.length; i++) {
    var achadas = todas.filter(function (m) {
      return m.is_internal === true && limpo(m.message).indexOf(trechos[i]) === 0;
    });
    var item = { trecho: trechos[i], encontradas: achadas.length };
    if (achadas.length === 1) {
      item.id = achadas[0].id;
      item.ticket_id = achadas[0].ticket_id;
      item.inicio = limpo(achadas[0].message).slice(0, 70);
      if (aplicar) {
        await M.update(achadas[0].id, { is_internal: false });
        item.reclassificada = true;
      }
    }
    resultado.push(item);
  }
  return ctx.reply.send({ success: true, resultado: resultado });
}
module.exports = { handler };
'''


def main():
    aplicar = "--aplicar" in sys.argv
    global TRECHOS
    if "--trecho" in sys.argv:
        TRECHOS = [sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--trecho"]
    c, _ = req(f"{MOD}/routes", "PUT", {"method": "POST", "path": CAMINHO, "controllerCode": ROTA})
    if c >= 300:
        sys.exit(1)
    req(MOD, "PATCH", {"status": "published"})
    c, d = req(f"{API}/v1/r/portal-suporte{CAMINHO}", "POST",
               {"trechos": TRECHOS, "aplicar": aplicar})
    print(json.dumps(d, indent=1, ensure_ascii=False))
    # neutralizar sempre
    OFF = 'async function handler(ctx){return ctx.reply.status(410).send({error:"desativada"});}\nmodule.exports={handler};'
    req(f"{MOD}/routes", "PUT", {"method": "POST", "path": CAMINHO, "controllerCode": OFF})
    req(MOD, "PATCH", {"status": "published"})
    print("(rota temporária neutralizada)")


if __name__ == "__main__":
    main()
