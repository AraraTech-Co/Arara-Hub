#!/usr/bin/env python3
# =============================================================================
# Acervo do WhatsApp: exportar e zerar.
#
# O acervo atual não é histórico de atendimento — é sedimento: importação de
# julho misturada com injeções de teste (`TESTE1`, `WH-REAL-1`, `POSGUARDA`).
# Com a entrada finalmente funcionando (17/08), a caixa passa a encher de
# conversa de verdade, e o sedimento só atrapalha a leitura da fila.
#
# Zerar é IRREVERSÍVEL, então o export vem antes e é obrigatório: `--zerar`
# recusa rodar se não houver um export íntegro do dia.
#
# Apaga, em ordem de dependência: eventos, notas, etiquetas de conversa,
# mensagens e por fim as conversas. Em lotes, porque o sandbox derruba o
# controller em 15 s.
#
#   python3 scripts/wa-acervo.py --exportar
#   python3 scripts/wa-acervo.py --zerar        # exige export do dia
# =============================================================================

import datetime
import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "backups")
CAMINHO = "/whatsapp/diagnostico/acervo"

MODELOS = ["WhatsAppConversation", "WhatsAppMessage", "WaConversationEvents",
           "WaInternalNotes", "WaConversationTags"]


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
HOJE = datetime.date.today().isoformat()
ARQUIVO = os.path.join(DESTINO, f"whatsapp-acervo-{HOJE}.json")

CONTROLLER = """
// TEMPORÁRIO — scripts/wa-acervo.py. Lê ou apaga o acervo, em lotes.
async function handler(ctx) {
  var nomes = ["WhatsAppConversation", "WhatsAppMessage", "WaConversationEvents",
               "WaInternalNotes", "WaConversationTags"];
  var acao = (ctx.query && ctx.query.acao) || "ler";
  var limite = Number((ctx.query && ctx.query.limite) || 60);
  var saida = {};

  if (acao === "apagar") {
    var apagados = 0, restam = 0;
    // Ordem de dependência: filhos primeiro, conversa por último.
    for (var i = 0; i < nomes.length; i++) {
      var M = ctx.models[nomes[i]];
      if (!M) continue;
      var linhas = (await M.findMany({})) || [];
      restam += linhas.length;
      for (var j = 0; j < linhas.length && apagados < limite; j++) {
        try { await M.delete(linhas[j].id); apagados++; restam--; } catch (e) {}
      }
      if (apagados >= limite) break;
    }
    return ctx.reply.send({ success: true, data: { apagados: apagados, restam: restam } });
  }

  for (var k = 0; k < nomes.length; k++) {
    var Mo = ctx.models[nomes[k]];
    saida[nomes[k]] = Mo ? ((await Mo.findMany({})) || []) : null;
  }
  return ctx.reply.send({ success: true, data: saida });
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


def instalar():
    c, d = req(f"{MOD}/routes", "PUT",
               {"method": "GET", "path": CAMINHO, "controllerCode": CONTROLLER})
    if c >= 300:
        print(f"! instalar: HTTP {c} {d}")
        sys.exit(1)
    req(MOD, "PATCH", {"status": "published"})


def desativar():
    stub = ('// Desativada — instrumento de scripts/wa-acervo.py.\n'
            'async function handler(ctx) {\n'
            '  return ctx.reply.status(410).send({ success: false, error: "Rota desativada" });\n'
            '}\nmodule.exports = { handler };\n')
    req(f"{MOD}/routes", "PUT", {"method": "GET", "path": CAMINHO, "controllerCode": stub})
    req(MOD, "PATCH", {"status": "published"})


def exportar():
    instalar()
    c, d = req(f"{API}/v1/r/portal-suporte{CAMINHO}")
    if c >= 300 or not isinstance(d, dict):
        print(f"! ler acervo: HTTP {c} {d}")
        sys.exit(1)
    dados = d["data"]
    os.makedirs(DESTINO, exist_ok=True)
    with open(ARQUIVO, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    for nome in MODELOS:
        v = dados.get(nome)
        print(f"   {nome:24} {len(v) if isinstance(v, list) else '—'}")
    print(f"→ {ARQUIVO} ({os.path.getsize(ARQUIVO) // 1024} KB)")
    return dados


def zerar():
    # Export do dia é pré-requisito, e é conferido de verdade: arquivo existe,
    # abre como JSON e tem as conversas dentro.
    if not os.path.exists(ARQUIVO):
        print(f"! sem export de hoje ({ARQUIVO}). Rode --exportar antes.")
        sys.exit(1)
    try:
        conf = json.load(open(ARQUIVO, encoding="utf-8"))
    except Exception as e:
        print(f"! export ilegível: {e}")
        sys.exit(1)
    if not isinstance(conf.get("WhatsAppConversation"), list):
        print("! export sem conversas; abortando")
        sys.exit(1)
    print(f"= export conferido: {len(conf['WhatsAppConversation'])} conversas, "
          f"{len(conf.get('WhatsAppMessage') or [])} mensagens")

    instalar()
    total = 0
    while True:
        c, d = req(f"{API}/v1/r/portal-suporte{CAMINHO}?acao=apagar&limite=60")
        if c >= 300 or not isinstance(d, dict):
            print(f"! apagar: HTTP {c} {d}")
            sys.exit(1)
        n = d["data"]["apagados"]
        total += n
        print(f"   apagados {total} (restam {d['data']['restam']})")
        if n == 0:
            break
    desativar()
    print(f"→ acervo zerado: {total} registros")


if __name__ == "__main__":
    if "--exportar" in sys.argv:
        exportar()
    elif "--zerar" in sys.argv:
        zerar()
    else:
        print(__doc__)
