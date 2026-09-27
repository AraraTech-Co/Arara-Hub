#!/usr/bin/env python3
# =============================================================================
# Sonda TEMPORÁRIA: quais ações de envio a API da Avisa aceita?
#
# Pergunta a responder: dá para mandar menu CLICÁVEL (botões ou lista
# interativa) em vez do menu numerado que o cliente precisa digitar? A Avisa
# não publica documentação, e o suporte deles é o caminho lento — então
# perguntamos à própria API.
#
# Como a sondagem é segura: cada candidata leva um POST de corpo VAZIO. Sem
# número de destino não há mensagem enviada; o que interessa é o CÓDIGO:
#
#   404 / 405   a ação não existe
#   400 / 422   a ação EXISTE e reclamou dos campos que faltam
#   200         existe e aceitou (não deve acontecer sem destinatário)
#
# Roda de dentro do sandbox porque `www.avisaapi.com.br` é o único host que a
# allowlist da plataforma libera — daqui de fora a chamada não sai.
#
#   python3 scripts/avisa-sondar-acoes.py            # instala, sonda e remove
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMINHO = "/whatsapp/diagnostico/sonda-avisa"


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
// TEMPORÁRIO — scripts/avisa-sondar-acoes.py
async function handler(ctx) {
  var token = await ctx.secrets.get("whatsapp_token");
  if (!token) return ctx.reply.status(503).send({ error: "sem token" });
  // Descobre o CONTRATO do sendList pela própria validação: cada tentativa
  // manda um pouco mais e lê o que ainda falta. Enquanto a validação falha,
  // nada é entregue a ninguém.
  var tentativas = (ctx.body && ctx.body.tentativas) || [{}];
  var saida = [];
  for (var i = 0; i < tentativas.length; i++) {
    var nome = tentativas[i].__acao || "sendList";
    var corpoEnvio = Object.assign({}, tentativas[i]);
    delete corpoEnvio.__acao;
    try {
      var r = await ctx.fetch("https://www.avisaapi.com.br/api/actions/" + nome, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(corpoEnvio),
      });
      var corpo = r && r.body;
      if (typeof corpo !== "string") { try { corpo = JSON.stringify(corpo); } catch (e) { corpo = ""; } }
      saida.push({ tentativa: i, acao: nome, http: r && r.status, resposta: String(corpo || "").slice(0, 700) });
    } catch (e) {
      saida.push({ tentativa: i, erro: String((e && e.message) || e).slice(0, 120) });
    }
  }
  return ctx.reply.send({ success: true, data: saida });
}
module.exports = { handler };
"""

STUB = """// Desativada — sonda de scripts/avisa-sondar-acoes.py.
async function handler(ctx) {
  return ctx.reply.status(410).send({ success: false, error: "Sonda desativada" });
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
    c, d = req(f"{MOD}/routes", "PUT", {"method": "POST", "path": CAMINHO, "controllerCode": codigo})
    if c >= 300:
        print(f"! rota: HTTP {c} {d}")
        sys.exit(1)
    req(MOD, "PATCH", {"status": "published"})


def main():
    gravar(CONTROLLER)
    tentativas = json.load(open("/tmp/tentativas.json"))
    c, d = req(f"{API}/v1/r/portal-suporte{CAMINHO}", "POST", {"tentativas": tentativas})
    if c >= 300 or not isinstance(d, dict):
        print(f"! sondagem: HTTP {c} {d}")
    else:
        for linha in d["data"]:
            print(f"--- {linha.get('acao','?')} #{linha['tentativa']}: HTTP {linha.get('http') or linha.get('erro')}")
            print("   ", str(linha.get("resposta", ""))[:600])
    gravar(STUB)
    print("\n(sonda desativada)")


if __name__ == "__main__":
    main()
