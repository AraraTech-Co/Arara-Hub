#!/usr/bin/env python3
# =============================================================================
# Motor de triagem do WhatsApp — instala no `POST /whatsapp/inbound`.
#
# Até aqui os três interruptores da inbox (Menu, IA, Rodízio) gravavam uma
# preferência que NINGUÉM lia: o motor de menus vivia no backend em Prisma que
# saiu na varredura. Isto põe o comportamento no servidor, no único lugar por
# onde toda mensagem de cliente passa.
#
# O que cada interruptor passa a fazer, de verdade:
#
#   Menu (waMenuEnabled)
#       Executa o fluxo publicado em `WaFlows` — o mesmo que o editor mostra.
#       Percorre menu → conteúdo → condição → atendente, guardando em
#       `conversation.menu_node` onde a pessoa parou. Resposta é casada por
#       NÚMERO ("2") ou pelo texto da opção; resposta que não casa reenvia o
#       menu em vez de seguir adiante calado.
#
#   Rodízio (waAutoAssignEnabled)
#       Ao chegar num nó de atendente, escolhe quem recebe: quem está há mais
#       tempo sem receber conversa, com a fila aberta como critério de
#       desempate. Notifica a pessoa (`ctx.notify`), como na reatribuição.
#
#   IA humanizada (waIaEnabled)
#       Preparada, mas desligada por dependência externa — ver abaixo.
#
# ── Por que a IA ainda não responde ──────────────────────────────────────────
# Duas coisas faltam, e nenhuma delas é código nosso:
#
#   1. `api.anthropic.com` precisa entrar em `SANDBOX_FETCH_ALLOWLIST` na
#      plataforma. Hoje a lista tem só `www.avisaapi.com.br`, e o sandbox
#      bloqueia todo o resto — é uma trava da plataforma, não do app.
#   2. Um `AppSecret` chamado `anthropic_api_key` precisa existir no cofre.
#
# O motor já chama a IA quando as duas existirem. Sem elas, ele não finge que
# funciona: registra o motivo e cai no fluxo de menu, que é o comportamento
# seguro. Ligar o interruptor sem isso não quebra nada e não muda nada.
#
# ── Limites conhecidos, ditos aqui e não escondidos ──────────────────────────
#   - O nó "Atraso" não espera de verdade: o controller vive 15 s e não há
#     agendador. Ele é atravessado, e o passo seguinte sai junto.
#   - No máximo 4 mensagens por entrada, para não estourar o tempo do
#     controller nem parecer robô despejando texto.
#   - Assistente, Randomizador e Integração ainda não são executados: caem
#     para o atendente humano, que é o destino seguro.
#
#   python3 scripts/wa-triagem-motor.py            # simula
#   python3 scripts/wa-triagem-motor.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-triagem-motor.py"


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

MOTOR = r"""
// ── Motor de triagem (scripts/wa-triagem-motor.py) ──────────────────────────
// Roda depois de a mensagem estar gravada. Nunca derruba a entrada: qualquer
// falha aqui é registrada e a conversa segue para a fila humana, que é o
// destino seguro.
async function _triagem(ctx, conv, textoCliente) {
  var Conv = ctx.models.WhatsAppConversation;
  var Msg = ctx.models.WhatsAppMessage;
  var agora = new Date().toISOString();

  function _cfg(linha, chave) {
    if (!linha) return false;
    return linha[chave] === true || linha[chave] === "true";
  }
  var cfg = null;
  try {
    var linhas = (await ctx.models.SystemSettings.findMany({})) || [];
    cfg = linhas[0] || null;
  } catch (e) {}

  var menuLigado = _cfg(cfg, "waMenuEnabled");
  var rodizioLigado = _cfg(cfg, "waAutoAssignEnabled");
  var iaLigada = _cfg(cfg, "waIaEnabled");

  // Humano no comando: se a conversa já tem atendente, o bot cala a boca.
  // Voltar a mandar menu por cima de um atendimento em andamento é o pior
  // defeito possível numa ferramenta dessas.
  var jaTemAtendente = !!(conv.assigned_to_id || conv.assignedToId);
  if (jaTemAtendente) return;

  // ── Envio ─────────────────────────────────────────────────────────────────
  var token = null;
  try { token = await ctx.secrets.get("whatsapp_token"); } catch (e) {}
  var enviadas = 0;
  async function _dizer(texto) {
    if (!texto || enviadas >= 4 || !token) return;   // teto por entrada
    enviadas++;
    var numero = String(conv.remote_jid || "").replace(/[^0-9]/g, "");
    if (numero.length <= 11) numero = "55" + numero;
    try {
      await ctx.fetch("https://www.avisaapi.com.br/api/actions/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ number: numero, message: texto }),
      });
    } catch (e) { return; }
    // Grava o que o bot disse: sem isso o atendente abre a conversa e vê só
    // as falas do cliente, sem entender o que já foi respondido.
    try {
      if (Msg) {
        await Msg.create({
          id: "wam_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          conversation_id: conv.id,
          message_id: "bot_" + Date.now(),
          from_me: true,
          sender_name: "Atendimento automático",
          body: texto,
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
      }
    } catch (e) {}
  }

  // ── Horário comercial (America/Sao_Paulo, sem depender do fuso do host) ───
  function _horarioComercial() {
    var d = new Date(Date.now() - 3 * 3600 * 1000);   // UTC-3
    var dia = d.getUTCDay();                           // 0 dom … 6 sáb
    var hora = d.getUTCHours();
    return dia >= 1 && dia <= 5 && hora >= 9 && hora < 18;
  }

  // ── Rodízio ───────────────────────────────────────────────────────────────
  // Recebe quem está há mais tempo sem conversa nova; empate vai para quem tem
  // a fila aberta menor. Um ponteiro "próximo da lista" distribuiria igual no
  // papel e mal na prática, porque ignora quem já está afogado.
  async function _rodizio() {
    if (!rodizioLigado) return null;
    var perfis = [];
    try { perfis = (await ctx.models.Profile.findMany({})) || []; } catch (e) { return null; }
    var papeisValidos = { support: 1, developer: 1, admin: 1, master: 1, member: 1, agent: 1 };
    var candidatos = perfis.filter(function (p) {
      return p && p.role && papeisValidos[String(p.role).toLowerCase()] && p.active !== false;
    });
    if (!candidatos.length) return null;

    var todas = [];
    try { todas = (await Conv.findMany({})) || []; } catch (e) {}
    var abertas = {}, ultima = {};
    for (var i = 0; i < todas.length; i++) {
      var c = todas[i];
      var dono = c.assigned_to_id || c.assignedToId;
      if (!dono) continue;
      var quando = String(c.assigned_at || c.updated_at || "");
      if (!ultima[dono] || quando > ultima[dono]) ultima[dono] = quando;
      if (String(c.status || "open") !== "closed" && c.phase !== "resolvido") {
        abertas[dono] = (abertas[dono] || 0) + 1;
      }
    }
    candidatos.sort(function (a, b) {
      var ua = ultima[a.id] || "", ub = ultima[b.id] || "";
      if (ua !== ub) return ua < ub ? -1 : 1;             // há mais tempo sem receber
      return (abertas[a.id] || 0) - (abertas[b.id] || 0); // desempate: fila menor
    });
    return candidatos[0] || null;
  }

  async function _entregarAoHumano(texto) {
    await _dizer(texto);
    var patch = { menu_node: null, phase: "em_atendimento", updated_at: agora };
    var escolhido = await _rodizio();
    if (escolhido) {
      patch.assigned_to_id = escolhido.id;
      patch.assigned_at = agora;
      try {
        if (typeof ctx.notify === "function") {
          await ctx.notify({
            userId: String(escolhido.id),
            title: "Conversa atribuída a você",
            body: "A conversa com " + (conv.contact_name || conv.remote_jid || "cliente") +
                  " entrou na sua fila pelo rodízio.",
            severity: "info",
            href: "https://suporte.arara-tech.com/inbox?c=" + encodeURIComponent(conv.id),
            sourceApp: "portal-suporte",
          });
        }
      } catch (e) {}
    } else {
      patch.phase = "novo";   // sem rodízio, fica na fila para alguém puxar
    }
    try { await Conv.update(conv.id, patch); } catch (e) {}
  }

  // ── IA humanizada ─────────────────────────────────────────────────────────
  // Só entra se as DUAS dependências existirem. Sem elas não finge: registra o
  // motivo e deixa o menu tocar o atendimento.
  if (iaLigada) {
    var chaveIa = null;
    try { chaveIa = await ctx.secrets.get("anthropic_api_key"); } catch (e) {}
    if (!chaveIa) {
      try {
        await ctx.models.WaConversationEvents.create({
          id: "iae_" + Date.now().toString(36),
          conversation_id: conv.id, kind: "ia_indisponivel",
          payload: JSON.stringify({ motivo: "sem anthropic_api_key no cofre" }),
          created_at: agora,
        });
      } catch (e) {}
    } else {
      try {
        var resp = await ctx.fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": chaveIa,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-8",
            max_tokens: 400,
            system: "Você é o atendimento da Arara Tech, empresa de ERP para varejo (SGC/SGI, PDV, " +
                    "BuscaPreço, etiquetas, notas fiscais). Responda em português do Brasil, curto e " +
                    "cordial, no tom de quem atende no WhatsApp. Nunca invente prazo, preço ou " +
                    "procedimento: se não souber, diga que vai chamar um analista.",
            messages: [{ role: "user", content: String(textoCliente || "") }],
          }),
        });
        var corpo = resp && resp.body;
        if (typeof corpo === "string") { try { corpo = JSON.parse(corpo); } catch (e) {} }
        var fala = corpo && corpo.content && corpo.content[0] && corpo.content[0].text;
        if (resp && resp.status < 300 && fala) {
          await _dizer(fala);
          try { await Conv.update(conv.id, { updated_at: agora }); } catch (e) {}
          return;   // IA atendeu; menu não entra por cima
        }
      } catch (e) {
        // Host bloqueado pela allowlist do sandbox cai aqui. Segue para o menu.
      }
    }
  }

  if (!menuLigado) {
    // Menu desligado: a conversa vai direto para a equipe. O rodízio, se
    // ligado, ainda escolhe quem recebe.
    if (rodizioLigado && !conv.menu_node) {
      var esc = await _rodizio();
      if (esc) {
        try {
          await Conv.update(conv.id, {
            assigned_to_id: esc.id, assigned_at: agora,
            phase: "em_atendimento", updated_at: agora,
          });
          if (typeof ctx.notify === "function") {
            await ctx.notify({
              userId: String(esc.id),
              title: "Conversa atribuída a você",
              body: "A conversa com " + (conv.contact_name || conv.remote_jid || "cliente") +
                    " entrou na sua fila pelo rodízio.",
              severity: "info",
              href: "https://suporte.arara-tech.com/inbox?c=" + encodeURIComponent(conv.id),
              sourceApp: "portal-suporte",
            });
          }
        } catch (e) {}
      }
    }
    return;
  }

  // ── Fluxo publicado ───────────────────────────────────────────────────────
  var grafo = null;
  try {
    var fluxos = (await ctx.models.WaFlows.findMany({})) || [];
    for (var f = 0; f < fluxos.length && !grafo; f++) {
      grafo = fluxos[f].published || fluxos[f].draft || null;
    }
    if (typeof grafo === "string") grafo = JSON.parse(grafo);
  } catch (e) { grafo = null; }
  if (!grafo || !grafo.nodes || !grafo.nodes.length) return;

  var porId = {};
  for (var n = 0; n < grafo.nodes.length; n++) porId[grafo.nodes[n].id] = grafo.nodes[n];
  var saidas = {};
  for (var a = 0; a < (grafo.edges || []).length; a++) {
    var e2 = grafo.edges[a];
    saidas[e2.source + "|" + (e2.sourceHandle || "next")] = e2.target;
  }

  function _normal(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }
  function _textoDoMenu(no) {
    var linhas = [no.data.text || ""];
    var ops = no.data.options || [];
    for (var i = 0; i < ops.length; i++) linhas.push((i + 1) + ". " + ops[i].label);
    if (ops.length) linhas.push("\nResponda com o número da opção.");
    return linhas.join("\n");
  }
  /** Casa a resposta por número ou pelo texto da opção. */
  function _escolher(no, resposta) {
    var ops = no.data.options || [];
    var cru = String(resposta || "").trim();
    var soNumero = cru.replace(/[^0-9]/g, "");
    if (soNumero && soNumero.length <= 2) {
      var idx = parseInt(soNumero, 10) - 1;
      if (idx >= 0 && idx < ops.length) return ops[idx];
    }
    var alvo = _normal(cru);
    if (!alvo) return null;
    for (var i = 0; i < ops.length; i++) {
      var rot = _normal(ops[i].label);
      if (rot === alvo || (alvo.length >= 4 && rot.indexOf(alvo) >= 0)) return ops[i];
    }
    return null;
  }

  /** Anda pelo grafo até parar num menu (espera resposta) ou num atendente. */
  async function _caminhar(idNo) {
    for (var passo = 0; passo < 12; passo++) {
      var no = porId[idNo];
      if (!no) return;
      var tipo = no.type;

      if (tipo === "menu") {
        await _dizer(_textoDoMenu(no));
        try { await Conv.update(conv.id, { menu_node: no.id, phase: "triagem", updated_at: agora }); } catch (e) {}
        return;
      }
      if (tipo === "content") {
        await _dizer(no.data.text);
        var proximo = saidas[no.id + "|next"];
        if (!proximo) {
          try { await Conv.update(conv.id, { menu_node: null, updated_at: agora }); } catch (e) {}
          return;
        }
        idNo = proximo;
        continue;
      }
      if (tipo === "condition") {
        idNo = saidas[no.id + "|" + (_horarioComercial() ? "true" : "false")];
        if (!idNo) return;
        continue;
      }
      if (tipo === "delay") {
        // Não espera de verdade: 15 s de controller e sem agendador. Atravessa.
        idNo = saidas[no.id + "|next"];
        if (!idNo) return;
        continue;
      }
      // handoff — e também assistant/random/integration, ainda não executados:
      // o destino seguro é a pessoa.
      await _entregarAoHumano(no.data.text);
      return;
    }
  }

  var atual = conv.menu_node ? porId[conv.menu_node] : null;
  if (!atual) {
    await _caminhar(grafo.root || (grafo.nodes[0] && grafo.nodes[0].id));
    return;
  }
  var escolha = _escolher(atual, textoCliente);
  if (!escolha) {
    // Não entendeu: repete o menu. Seguir adiante no escuro faria o cliente
    // cair em outro assunto sem perceber.
    await _dizer("Não entendi. " + _textoDoMenu(atual));
    return;
  }
  var destino = saidas[atual.id + "|opt:" + escolha.id];
  if (!destino) { await _entregarAoHumano("Vou chamar um analista para te ajudar."); return; }
  await _caminhar(destino);
}
"""

CHAMADA = """
  // Triagem automática — ver scripts/wa-triagem-motor.py. Fora do try/catch da
  // gravação de propósito: o registro da mensagem já aconteceu, e uma falha do
  // motor não pode desfazê-lo nem devolver erro para a Avisa (que reenviaria).
  try {
    if ((ctx.body && ctx.body.from_me) !== true) {
      await _triagem(ctx, conv, message);
    }
  } catch (e) {}
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
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    rota = [r for r in d["routes"] if r["path"] == "/whatsapp/inbound"][0]
    codigo = rota["controllerCode"]
    if MARCA in codigo:
        print("= motor já instalado")
        return

    # A chamada entra logo antes do `return ok(...)` final do handler.
    ancora = "  return ok(ctx, {\n    id: conv.id,"
    if codigo.count(ancora) != 1:
        print(f"! âncora do retorno aparece {codigo.count(ancora)}x; revise o script")
        sys.exit(1)
    novo = codigo.replace(ancora, CHAMADA + "\n" + ancora, 1)

    # O motor entra no fim do arquivo, antes da exportação.
    exporta = "module.exports = { handler };"
    if novo.count(exporta) != 1:
        print("! exportação inesperada")
        sys.exit(1)
    novo = novo.replace(exporta, MOTOR + "\n" + exporta, 1)

    print(f"→ inbound: {len(codigo)} → {len(novo)} caracteres")
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
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
