#!/usr/bin/env python3
# =============================================================================
# Instrumento TEMPORÁRIO para achar por que a mensagem recebida não chega.
#
# O problema é de visibilidade: as rotas de diagnóstico que existem exigem
# sessão de PESSOA (de propósito), e o segredo do webhook nasce `serverOnly` e
# nunca volta do cofre. Ou seja: de fora não dá para comparar o `?token=` que a
# Avisa usa com o que a plataforma espera — e é exatamente aí que a mensagem
# morre, porque a checagem acontece ANTES do nosso controller rodar.
#
# Esta rota faz a comparação DENTRO do sandbox, onde os dois valores existem, e
# devolve só o veredito. Nunca devolve o segredo: a URL sai com o token
# mascarado e a comparação sai como `true`/`false`.
#
# Também conta o que chegou: última conversa e última mensagem gravadas, para
# separar "não chega" de "chega e some".
#
#   python3 scripts/wa-inbound-diagnostico.py --instalar
#   python3 scripts/wa-inbound-diagnostico.py --ler
#   python3 scripts/wa-inbound-diagnostico.py --remover     # ao terminar
#
# `--remover` não é opcional: a rota responde à chave de serviço, que está no
# navegador de toda a equipe. Ela existe para o conserto e sai depois.
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMINHO = "/whatsapp/diagnostico/interno"


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

CONTROLLER = r"""
// TEMPORÁRIO — scripts/wa-inbound-diagnostico.py. Remover ao terminar.
// Compara, dentro do sandbox, o token que a Avisa usa com o segredo do cofre.
// Nunca devolve segredo: a URL sai mascarada e a comparação sai como booleano.
// Sem expressão regular de propósito: este código atravessa duas camadas de
// escape (Python → JSON → isolate) e barra invertida some pelo caminho.
function _corte(s, i) { return i < 0 ? -1 : i; }
function _fimToken(s, i) {
  var fim = s.length;
  for (var k = i; k < s.length; k++) {
    var ch = s.charAt(k);
    if (ch === "&" || ch === '"' || ch === " " || ch === "\\" || ch === "'") { fim = k; break; }
  }
  return fim;
}
/** Devolve o valor de `token=` na string, ou "". */
function _token(s) {
  var i = String(s || "").indexOf("token=");
  if (i < 0) return "";
  var ini = i + 6;
  return String(s).slice(ini, _fimToken(String(s), ini));
}
/** Mesma string, com o valor do token trocado por bolinhas. */
function _mascara(s) {
  var t = _token(s);
  if (!t) return String(s || "");
  return String(s).split(t).join("••••");
}
/** Primeira URL http(s) dentro de um JSON serializado. */
function _url(s) {
  var i = String(s || "").indexOf("http");
  if (i < 0) return "";
  var fim = s.length;
  for (var k = i; k < s.length; k++) {
    var ch = s.charAt(k);
    if (ch === '"' || ch === " " || ch === "\\" || ch === ",") { fim = k; break; }
  }
  return String(s).slice(i, fim);
}
async function handler(ctx) {
  var r = { cofre: null, provedor: null, banco: null };

  var segredo = null;
  try { segredo = await ctx.secrets.get("avisa_webhook_secret"); } catch (e) {}
  var envio = null;
  try { envio = await ctx.secrets.get("whatsapp_token"); } catch (e) {}
  r.cofre = {
    webhook_secret_cadastrado: !!segredo,
    webhook_secret_tamanho: segredo ? String(segredo).length : 0,
    token_envio_cadastrado: !!envio,
  };

  if (envio) {
    try {
      var resp = await ctx.fetch("https://www.avisaapi.com.br/api/webhook", {
        method: "GET",
        headers: { Authorization: "Bearer " + envio },
      });
      var corpo = resp && resp.body;
      if (typeof corpo === "string") { try { corpo = JSON.parse(corpo); } catch (e) {} }
      var cru = JSON.stringify(corpo || "");
      var url = _url(cru);
      var tokenNaUrl = _token(url);
      try { tokenNaUrl = decodeURIComponent(tokenNaUrl); } catch (e) {}
      r.provedor = {
        http: resp && resp.status,
        url_mascarada: _mascara(url),
        aponta_para_este_portal: url.indexOf("/v1/r/portal-suporte/whatsapp/inbound") >= 0,
        tem_token_na_url: !!tokenNaUrl,
        token_confere_com_o_cofre: !!segredo && !!tokenNaUrl && String(tokenNaUrl) === String(segredo),
        resposta_bruta_mascarada: _mascara(cru).slice(0, 400),
      };
    } catch (e) {
      r.provedor = { erro: String((e && e.message) || e).slice(0, 200) };
    }
  } else {
    r.provedor = { erro: "sem whatsapp_token para consultar a Avisa" };
  }

  try {
    var Conv = ctx.models.WhatsAppConversation;
    var Msg = ctx.models.WhatsAppMessage;
    var convs = (await Conv.findMany({})) || [];
    var msgs = Msg ? ((await Msg.findMany({})) || []) : [];
    function maior(lista, campos) {
      var m = null;
      for (var i = 0; i < lista.length; i++) {
        for (var c = 0; c < campos.length; c++) {
          var v = lista[i][campos[c]];
          if (v && (!m || String(v) > String(m))) m = v;
        }
      }
      return m;
    }
    var recebidas = msgs.filter(function (x) { return x.from_me !== true; });
    r.banco = {
      conversas: convs.length,
      mensagens: msgs.length,
      mensagens_recebidas: recebidas.length,
      ultima_entrada_conversa: maior(convs, ["last_inbound_at"]),
      ultima_mensagem_recebida: maior(recebidas, ["timestamp", "created_at"]),
      ultima_mensagem_qualquer: maior(msgs, ["timestamp", "created_at"]),
    };
  } catch (e) {
    r.banco = { erro: String((e && e.message) || e).slice(0, 200) };
  }

  // `?acao=hist` — distribuição das mensagens por dia. Diz se o acervo veio de
  // uma carga de histórico (tudo no mesmo minuto) ou de fluxo real.
  if (ctx.query && ctx.query.acao === "hist") {
    try {
      var M = ctx.models.WhatsAppMessage;
      var todas = (await M.findMany({})) || [];
      var porDia = {};
      for (var i = 0; i < todas.length; i++) {
        var d = String(todas[i].timestamp || todas[i].created_at || "").slice(0, 13) || "?";
        porDia[d] = (porDia[d] || 0) + 1;
      }
      r.historico = porDia;
    } catch (e) { r.historico = { erro: String((e && e.message) || e).slice(0, 200) }; }
  }

  // `?acao=amostra` — metadado das últimas mensagens (sem conteúdo, sem
  // telefone): serve para saber se elas nasceram do webhook (message_id do
  // WhatsApp, instance "avisa") ou de carga/importação.
  if (ctx.query && ctx.query.acao === "amostra") {
    try {
      var M2 = ctx.models.WhatsAppMessage;
      var t2 = (await M2.findMany({})) || [];
      t2.sort(function (a, b) {
        return String(a.created_at || a.timestamp) < String(b.created_at || b.timestamp) ? 1 : -1;
      });
      r.amostra = t2.slice(0, 6).map(function (x) {
        return {
          created_at: x.created_at || x.timestamp,
          message_id: String(x.message_id || "").slice(0, 12),
          from_me: x.from_me === true,
          tem_corpo: !!x.body,
        };
      });
    } catch (e) { r.amostra = { erro: String((e && e.message) || e).slice(0, 200) }; }
  }

  // `?acao=rearmar&eventos=A,B` — regrava o webhook na Avisa com a MESMA URL e
  // o MESMO token (lidos do cofre aqui dentro, nunca expostos), mudando só a
  // lista de eventos assinados. Existe porque "Message" está assinado e mesmo
  // assim nada é entregue: se o nome do evento desta build for outro, é aqui
  // que se descobre. Ler de volta logo em seguida confirma o que ficou gravado.
  if (ctx.query && ctx.query.acao === "rearmar" && envio && segredo) {
    try {
      var alvo = "https://api.arara-tech.com/v1/r/portal-suporte/whatsapp/inbound?token=" + segredo;
      var lista = String(ctx.query.eventos || "All").split(",");
      var rr = await ctx.fetch("https://www.avisaapi.com.br/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + envio },
        body: JSON.stringify({ webhook: alvo, subscribe: lista, events: lista }),
      });
      var b5 = rr && rr.body;
      if (typeof b5 === "string") { try { b5 = JSON.parse(b5); } catch (e) {} }
      var conf = await ctx.fetch("https://www.avisaapi.com.br/api/webhook", {
        method: "GET", headers: { Authorization: "Bearer " + envio },
      });
      var b6 = conf && conf.body;
      if (typeof b6 === "string") { try { b6 = JSON.parse(b6); } catch (e) {} }
      r.rearmar = {
        http: rr && rr.status,
        resposta: _mascara(JSON.stringify(b5 || "")).slice(0, 300),
        agora: _mascara(JSON.stringify(b6 || "")).slice(0, 400),
      };
    } catch (e) { r.rearmar = { erro: String((e && e.message) || e).slice(0, 200) }; }
  }

  // `?acao=status` — o que a Avisa diz da sessão (inclui o JID do número).
  if (ctx.query && ctx.query.acao === "status" && envio) {
    try {
      var st = await ctx.fetch("https://www.avisaapi.com.br/api/instance/status", {
        method: "GET", headers: { Authorization: "Bearer " + envio },
      });
      var b2 = st && st.body;
      if (typeof b2 === "string") { try { b2 = JSON.parse(b2); } catch (e) {} }
      r.sessao = { http: st && st.status, corpo: b2 };
    } catch (e) { r.sessao = { erro: String((e && e.message) || e).slice(0, 200) }; }
  }

  // `?acao=eco&numero=NNN` — manda UMA mensagem pelo número da Arara. Serve
  // para provocar um evento de verdade na Avisa e ver se ele volta para cá,
  // sem depender de alguém com o celular na mão.
  if (ctx.query && ctx.query.acao === "eco" && envio && ctx.query.numero) {
    try {
      var env = await ctx.fetch("https://www.avisaapi.com.br/api/actions/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + envio },
        body: JSON.stringify({
          number: String(ctx.query.numero).replace(/[^0-9]/g, ""),
          message: "Teste tecnico do portal de suporte - ignore.",
        }),
      });
      var b3 = env && env.body;
      if (typeof b3 === "string") { try { b3 = JSON.parse(b3); } catch (e) {} }
      r.eco = { http: env && env.status, corpo: b3 };
    } catch (e) { r.eco = { erro: String((e && e.message) || e).slice(0, 200) }; }
  }

  // `?acao=sonda&caminho=/api/...` — GET de leitura na Avisa, para descobrir se
  // o provedor guarda histórico de entrega do webhook. Só GET, só avisaapi (a
  // allowlist do sandbox não deixa sair para outro host de qualquer forma).
  if (ctx.query && ctx.query.acao === "sonda" && envio && ctx.query.caminho) {
    var caminho = String(ctx.query.caminho);
    if (caminho.charAt(0) !== "/") caminho = "/" + caminho;
    try {
      var sd = await ctx.fetch("https://www.avisaapi.com.br" + caminho, {
        method: "GET", headers: { Authorization: "Bearer " + envio },
      });
      var b4 = sd && sd.body;
      if (typeof b4 === "string" && b4.length > 1200) b4 = b4.slice(0, 1200) + "…";
      r.sonda = { caminho: caminho, http: sd && sd.status, corpo: b4 };
    } catch (e) { r.sonda = { caminho: caminho, erro: String((e && e.message) || e).slice(0, 200) }; }
  }

  return ctx.reply.send({ success: true, data: r });
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


def publicar():
    # Publicar promove o rascunho INTEIRO — ver scripts/kanban-enriquecer.py.
    c, d = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar whatsapp: HTTP {c} {'' if c < 300 else d}")


def main():
    if "--instalar" in sys.argv:
        c, d = req(f"{MOD}/routes", "PUT", {
            "method": "GET", "path": CAMINHO, "controllerCode": CONTROLLER,
        })
        print(f"→ instalar {CAMINHO}: HTTP {c} {'' if c < 300 else d}")
        if c < 300:
            publicar()
    elif "--remover" in sys.argv:
        c, d = req(f"{MOD}/routes?method=GET&path={CAMINHO}", "DELETE")
        print(f"→ remover {CAMINHO}: HTTP {c} {'' if c < 300 else d}")
        if c < 300:
            publicar()
    elif "--ler" in sys.argv:
        extra = ""
        for a in sys.argv[1:]:
            if a.startswith("--acao="):
                extra = "?acao=" + a.split("=", 1)[1]
            if a.startswith("--numero="):
                extra += ("&" if extra else "?") + "numero=" + a.split("=", 1)[1]
            if a.startswith("--eventos="):
                extra += ("&" if extra else "?") + "eventos=" + urllib.parse.quote(a.split("=", 1)[1])
            if a.startswith("--caminho="):
                extra += ("&" if extra else "?") + "caminho=" + urllib.parse.quote(a.split("=", 1)[1])
        c, d = req(f"{API}/v1/r/portal-suporte{CAMINHO}{extra}")
        print(json.dumps(d, indent=2, ensure_ascii=False) if isinstance(d, dict) else f"HTTP {c} {d}")
    else:
        print(__doc__ or "use --instalar | --ler | --remover")


if __name__ == "__main__":
    main()
