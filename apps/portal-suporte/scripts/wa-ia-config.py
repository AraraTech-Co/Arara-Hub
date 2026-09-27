#!/usr/bin/env python3
# =============================================================================
# Fatia 1 — configuração da IA humanizada e MONTAGEM DO PROMPT no servidor.
#
# Regra que organiza o resto: o prompt é montado aqui, nunca no navegador. O
# motor de triagem roda no sandbox e o painel roda no browser; se cada um
# montasse o texto a partir dos campos, seriam duas verdades — e a divergência
# apareceria como "a IA respondeu diferente do que a prévia mostrava". O painel
# exibe o que esta rota devolve.
#
#   GET /whatsapp/ia   → { config, prompt, estado }
#   PUT /whatsapp/ia   → grava a config (admin), incrementa `versao`
#
# `estado` responde as duas perguntas que decidem se a IA pode funcionar:
# a chave está no cofre? o host está liberado na allowlist do sandbox? A
# segunda é descoberta TENTANDO — a plataforma não expõe a lista, e chutar
# seria pior que perguntar.
#
#   python3 scripts/wa-ia-config.py            # simula
#   python3 scripts/wa-ia-config.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-ia-config.py"


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

COMUM = r"""
// ── IA humanizada: configuração e montagem do prompt (%s) ──
var IA_MODELOS = {
  "claude-opus-4-8": "Opus 4.8 — o mais capaz, mais caro",
  "claude-sonnet-5": "Sonnet 5 — equilíbrio entre qualidade e custo",
  "claude-haiku-4-5": "Haiku 4.5 — o mais rápido e barato",
};
var IA_NIVEIS = {
  conservadora: "Acolhe, confirma o que entendeu, pede evidência e chama um atendente. NÃO sugere solução nem procedimento.",
  equilibrada: "Responde dúvidas simples que o contexto acima cobre. Qualquer assunto técnico com risco de piorar a situação do cliente vai para um atendente.",
  solta: "Tenta resolver: pode sugerir passos e orientar o cliente, sempre dentro do que o contexto acima cobre.",
};
var IA_NUNCA = {
  prazo: "prometer prazo de atendimento, de correção ou de visita",
  preco: "informar preço, desconto ou condição comercial",
  fiscal: "orientar procedimento fiscal (tributação, NCM, CST, emissão)",
  sensivel: "pedir senha, dado de cartão, documento ou qualquer dado sensível",
};
var IA_HUMANO = {
  pediu: "o cliente pedir para falar com uma pessoa",
  fora_da_lista: "o assunto não for algo que o contexto acima cobre",
  fora_horario: "estiver fora do horário comercial",
};

var IA_PADRAO = {
  identidade: "Atendimento Arara Tech",
  tom: "cordial, direto e sem formalidade excessiva",
  contexto: "A Arara Tech faz sistemas para o varejo: SGC/SGI (retaguarda), PDV (frente de caixa), BuscaPreço, sistema de etiquetas e emissão fiscal (NF-e, NFC-e, SAT).",
  nuncaFazer: ["prazo", "preco", "fiscal", "sensivel"],
  nuncaFazerExtra: "",
  chamarHumano: ["pediu", "fora_da_lista", "fora_horario"],
  tamanhoMax: 600,
  assinatura: "",
  modelo: "claude-opus-4-8",
  nivel: "conservadora",
  versao: 0,
};

async function iaConfig(ctx) {
  var linha = null;
  try { linha = ((await ctx.models.SystemSettings.findMany({})) || [])[0] || null; } catch (e) {}
  var guardada = null;
  if (linha && linha.wa_ia) {
    guardada = linha.wa_ia;
    if (typeof guardada === "string") { try { guardada = JSON.parse(guardada); } catch (e) { guardada = null; } }
  }
  var cfg = {};
  for (var k in IA_PADRAO) cfg[k] = IA_PADRAO[k];
  if (guardada) for (var k2 in guardada) if (guardada[k2] !== undefined && guardada[k2] !== null) cfg[k2] = guardada[k2];
  // Valor fora da lista fechada volta para o padrão: id de modelo inventado só
  // daria erro quando o cliente escrevesse.
  if (!IA_MODELOS[cfg.modelo]) cfg.modelo = IA_PADRAO.modelo;
  if (!IA_NIVEIS[cfg.nivel]) cfg.nivel = IA_PADRAO.nivel;
  return { cfg: cfg, linha: linha };
}

/** O prompt final. Uma função só, no servidor, para não haver duas versões. */
function iaMontarPrompt(c) {
  var p = [];
  p.push("Você é o " + c.identidade + ", atendimento por WhatsApp da Arara Tech.");
  p.push("Fale em português do Brasil, " + c.tom + ", como quem responde no WhatsApp: mensagens curtas, sem parágrafos longos.");
  p.push("");
  p.push("SOBRE A EMPRESA E O QUE ELA ATENDE");
  p.push(c.contexto);
  p.push("");
  p.push("O QUE VOCÊ NUNCA FAZ");
  var nunca = c.nuncaFazer || [];
  for (var i = 0; i < nunca.length; i++) {
    if (IA_NUNCA[nunca[i]]) p.push("- " + IA_NUNCA[nunca[i]] + ".");
  }
  if (c.nuncaFazerExtra) p.push("- " + c.nuncaFazerExtra);
  p.push("- inventar informação: se não souber, diga que vai chamar um analista.");
  p.push("- enviar link ou arquivo.");
  p.push("");
  p.push("QUANDO PASSAR PARA UM ATENDENTE HUMANO");
  var quando = c.chamarHumano || [];
  for (var j = 0; j < quando.length; j++) {
    if (IA_HUMANO[quando[j]]) p.push("- quando " + IA_HUMANO[quando[j]] + ";");
  }
  p.push("Ao passar, diga isso claramente ao cliente numa frase e pare de responder.");
  p.push("");
  p.push("SUA MARGEM DE INICIATIVA (nível: " + c.nivel + ")");
  p.push(IA_NIVEIS[c.nivel]);
  p.push("");
  p.push("FORMATO");
  p.push("- no máximo " + c.tamanhoMax + " caracteres por resposta;");
  if (c.assinatura) p.push('- termine com "' + c.assinatura + '";');
  p.push("- nada de emoji em excesso; no máximo um por mensagem.");
  return p.join("\n");
}

/** As duas dependências externas, verificadas de verdade — não presumidas. */
async function iaEstado(ctx) {
  var temChave = false;
  try { temChave = !!(await ctx.secrets.get("anthropic_api_key")); } catch (e) {}

  // A plataforma não expõe a allowlist; a única forma honesta de saber é
  // tentar. Erro de rede aqui significa host bloqueado, não API fora do ar.
  var hostLiberado = false, detalhe = null;
  try {
    var r = await ctx.fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: { "x-api-key": "probe", "anthropic-version": "2023-06-01" },
    });
    // 401 é ótima notícia: significa que a requisição CHEGOU lá.
    hostLiberado = !!(r && r.status);
    detalhe = r ? ("respondeu HTTP " + r.status) : null;
  } catch (e) {
    detalhe = String((e && e.message) || e).slice(0, 140);
  }
  return {
    chaveCadastrada: temChave,
    hostLiberado: hostLiberado,
    detalheHost: detalhe,
    // O interruptor segue bloqueado por decisão de produto (17/08), separado
    // das dependências técnicas: uma coisa é poder, outra é dever.
    bloqueadoPorDecisao: true,
  };
}
"""

GET_JS = COMUM % MARCA + """
async function handler(ctx) {
  var r = await iaConfig(ctx);
  return ctx.reply.send({
    success: true,
    data: {
      config: r.cfg,
      prompt: iaMontarPrompt(r.cfg),
      estado: await iaEstado(ctx),
      modelos: IA_MODELOS,
      niveis: IA_NIVEIS,
      opcoesNuncaFazer: IA_NUNCA,
      opcoesChamarHumano: IA_HUMANO,
    },
  });
}
module.exports = { handler };
"""

PUT_JS = COMUM % MARCA + """
var _RANK = { user: 10, support: 20, developer: 30, admin: 40 };
var _APELIDOS = { master: "admin", gerente: "admin", member: "support", agent: "support" };
function _canon(cru) {
  var v = String(cru || "").trim().toLowerCase();
  return _RANK[v] !== undefined ? v : (_APELIDOS[v] || "");
}

async function handler(ctx) {
  // Configuração que muda o que a IA diz para cliente é ato de admin, e
  // precisa ficar no nome de alguém: chave de serviço não passa aqui.
  var u = ctx.user || {};
  var quem = u.id || u.userId || null;
  if (!quem) return ctx.reply.status(403).send({ success: false, error: "Requer sessão" });
  var perfil = ctx.models.Profile ? await ctx.models.Profile.findById(quem) : null;
  if ((_RANK[_canon(perfil ? perfil.role : "")] || 0) < _RANK.admin) {
    return ctx.reply.status(403).send({ success: false, error: "Sem permissão" });
  }

  var body = ctx.body || {};
  var atual = await iaConfig(ctx);
  var nova = {};
  for (var k in atual.cfg) nova[k] = atual.cfg[k];

  var textos = ["identidade", "tom", "contexto", "nuncaFazerExtra", "assinatura"];
  for (var t = 0; t < textos.length; t++) {
    if (typeof body[textos[t]] === "string") nova[textos[t]] = body[textos[t]].slice(0, 2000);
  }
  if (Array.isArray(body.nuncaFazer)) {
    nova.nuncaFazer = body.nuncaFazer.filter(function (x) { return !!IA_NUNCA[x]; });
  }
  if (Array.isArray(body.chamarHumano)) {
    nova.chamarHumano = body.chamarHumano.filter(function (x) { return !!IA_HUMANO[x]; });
  }
  if (body.modelo && IA_MODELOS[body.modelo]) nova.modelo = body.modelo;
  if (body.nivel && IA_NIVEIS[body.nivel]) nova.nivel = body.nivel;
  var tam = Number(body.tamanhoMax);
  if (tam >= 200 && tam <= 1500) nova.tamanhoMax = Math.round(tam);

  // A versão sobe a cada gravação e é carimbada em cada resposta da IA — é o
  // que permite responder "com qual configuração ela disse isso?".
  nova.versao = Number(atual.cfg.versao || 0) + 1;
  // O prompt montado é GRAVADO junto: o motor de triagem lê daqui em vez de
  // montar de novo. Uma montagem só, num lugar só — duas produziriam respostas
  // diferentes da prévia que o admin aprovou.
  nova.promptMontado = iaMontarPrompt(nova);

  var agora = new Date().toISOString();
  if (atual.linha) {
    await ctx.models.SystemSettings.update(atual.linha.id, { wa_ia: nova, updated_at: agora });
  } else {
    await ctx.models.SystemSettings.create({ wa_ia: nova, created_at: agora, updated_at: agora });
  }
  return ctx.reply.send({ success: true, data: { config: nova, prompt: iaMontarPrompt(nova) } });
}
module.exports = { handler };
"""


SIMULAR_JS = COMUM % MARCA + """
var _RANK2 = { user: 10, support: 20, developer: 30, admin: 40 };
function _canon2(cru) {
  var v = String(cru || "").trim().toLowerCase();
  var ap = { master: "admin", gerente: "admin", member: "support", agent: "support" };
  return _RANK2[v] !== undefined ? v : (ap[v] || "");
}

/**
 * Simulador: responde com a configuração atual e NÃO envia para ninguém — não
 * cria conversa, não grava mensagem, não toca no WhatsApp.
 *
 * Existe por causa da semana de 11–17/08, em que a Avisa respondeu "enviado"
 * para mensagens que nunca chegaram: nada vai para cliente real sem um caminho
 * de teste que não passe pelo cliente.
 */
async function handler(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || null;
  if (!quem) return ctx.reply.status(403).send({ success: false, error: "Requer sessão" });
  var perfil = ctx.models.Profile ? await ctx.models.Profile.findById(quem) : null;
  if ((_RANK2[_canon2(perfil ? perfil.role : "")] || 0) < _RANK2.admin) {
    return ctx.reply.status(403).send({ success: false, error: "Sem permissão" });
  }

  var mensagem = String((ctx.body || {}).mensagem || "").trim();
  if (!mensagem) return ctx.reply.status(400).send({ success: false, error: "Escreva a mensagem do cliente" });

  var r = await iaConfig(ctx);
  var prompt = r.cfg.promptMontado || iaMontarPrompt(r.cfg);

  var chave = null;
  try { chave = await ctx.secrets.get("anthropic_api_key"); } catch (e) {}
  if (!chave) {
    return ctx.reply.status(503).send({
      success: false,
      error: "Falta a chave da Anthropic no cofre (segredo `anthropic_api_key`).",
    });
  }

  try {
    var resp = await ctx.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: r.cfg.modelo,
        max_tokens: 700,
        system: prompt,
        messages: [{ role: "user", content: mensagem }],
      }),
    });
    var corpo = resp && resp.body;
    if (typeof corpo === "string") { try { corpo = JSON.parse(corpo); } catch (e) {} }
    if (!resp || resp.status >= 300) {
      return ctx.reply.status(502).send({
        success: false,
        error: "A Anthropic recusou (HTTP " + (resp ? resp.status : "?") + ").",
        detalhe: String((corpo && corpo.error && corpo.error.message) || "").slice(0, 200),
      });
    }
    var fala = corpo && corpo.content && corpo.content[0] && corpo.content[0].text;
    return ctx.reply.send({
      success: true,
      data: { resposta: fala || "(resposta vazia)", modelo: r.cfg.modelo, nivel: r.cfg.nivel, versaoPrompt: r.cfg.versao },
    });
  } catch (e) {
    // Host fora da allowlist cai aqui — e o motivo precisa ser dito por
    // extenso, não virar "erro de rede".
    return ctx.reply.status(503).send({
      success: false,
      error: "O host api.anthropic.com ainda não está liberado na plataforma (SANDBOX_FETCH_ALLOWLIST).",
      detalhe: String((e && e.message) || e).slice(0, 200),
    });
  }
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
    aplicar = "--aplicar" in sys.argv
    for js, nome in ((GET_JS, "get"), (PUT_JS, "put")):
        open(f"/tmp/ia_{nome}.js", "w").write(js)
    print(f"→ GET /whatsapp/ia: {len(GET_JS)} caracteres · PUT: {len(PUT_JS)}")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return
    for metodo, caminho, js in (("GET", "/whatsapp/ia", GET_JS),
                                ("PUT", "/whatsapp/ia", PUT_JS),
                                ("POST", "/whatsapp/ia/simular", SIMULAR_JS)):
        c, d = req(f"{MOD}/routes", "PUT",
                   {"method": metodo, "path": caminho, "controllerCode": js})
        print(f"→ {metodo} {caminho}: HTTP {c} {'' if c < 300 else d}")
        if c >= 300:
            sys.exit(1)
    c, d = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar: HTTP {c} {'' if c < 300 else d}")


if __name__ == "__main__":
    main()
