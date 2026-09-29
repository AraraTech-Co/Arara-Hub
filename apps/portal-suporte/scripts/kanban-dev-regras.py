#!/usr/bin/env python3
# =============================================================================
# Fase 2 do Kanban Dev — as regras do servidor.
#
# Três rotas novas no módulo `tickets`. Nenhuma rota existente é alterada.
#
#   POST /tickets/:id/escalar-dev   support+  escala um chamado: cria o card
#                                             Dev (mesma sequência TCK; a marca
#                                             "DEV" é exibição), move o chamado
#                                             para pendencia_dev, grava mensagem
#                                             interna e avisa a equipe de Dev.
#
#   POST /dev/tickets               developer+  demanda que NASCE no Dev
#                                             (melhoria, dívida técnica). Sem
#                                             origem_ticket_id — é o que a marca
#                                             como interna e fora dos
#                                             indicadores de atendimento.
#
#   POST /dev/tickets/:id/mover     developer+  a máquina de estados do quadro
#                                             Dev, com as validações do §17
#                                             BLOQUEANDO no servidor (uma trava
#                                             só de tela não é trava):
#
#     no_status → backlog | descartado          (Backlog → Aguardando Início)
#     backlog → em_desenvolvimento (exige responsável + descrição) | descartado
#               Entrar em backlog exige esforco_entrega (ASAP | ½ | 1 | 2 | 4+)
#     em_desenvolvimento → desenvolvimento_finalizado (exige DECLARAÇÃO
#                          assinada: código versionado, critérios atendidos)
#                        | descartado
#     desenvolvimento_finalizado → pronto_para_teste (exige HML livre) | volta
#     pronto_para_teste → em_testes | volta
#     em_testes → teste_aprovado (grant `qa` + declaração)
#               | teste_reprovado (grant `qa` + motivo)
#     teste_reprovado → em_desenvolvimento
#     teste_aprovado → aplicado_no_cliente (exige versão; carimba resolved_at)
#     aplicado_no_cliente, descartado → terminais
#     admin+ pode saltar o grafo (cadeado do Kanban Dev é só na UI)
#
#     HML: Ticket.environment = slug do standalone SGC. Ocupado enquanto o
#     card estiver em pronto_para_teste ou em_testes. Em Revisão removida
#     em 25/09/2026 (redundante com Dev Finalizado).
#
#   Aplicado/descartado com origem: o chamado de Suporte volta SOZINHO para
#   em_atendimento, com mensagem interna e aviso ao responsável — na mesma
#   requisição, para não existir o estado "Dev terminou e o Suporte não soube".
#
#   Cards `migrado: true` (virada, decisão 15): a PRIMEIRA movimentação não
#   valida a etapa em que foram colocados — eles não passaram pelas etapas
#   anteriores e não têm o que as validações pedem. O flag é limpo nessa
#   primeira movimentação; daí em diante valem as regras.
#
#   python3 scripts/kanban-dev-regras.py            # simula (grava /tmp/*.js)
#   python3 scripts/kanban-dev-regras.py --aplicar
#
# ── TRAVA ANTI-REGRESSÃO (17/09/2026) ────────────────────────────────────────
# Este script REGRAVA o handler inteiro a partir do template acima. Quando o
# template está mais velho que o código em produção, publicar APAGA o que veio
# depois — foi o que aconteceu em 15/09 (commit a32dff6): o mover perdeu a
# reprovação estruturada e o move livre do master, e o Kanban Dev ficou sem
# reprovar teste por dois dias.
#
# Agora, antes de gravar, cada rota é comparada com o handler que está em
# `packages/api/src/apps/portal-suporte/routes.generated.ts` — a ÚNICA fonte
# que roda em produção (publicar pelo banco responde 410 desde que
# ALLOW_DB_CONTROLLER_PUBLISH=0). Se o handler de lá tiver bloco que o
# template não tem, o script PARA e diz o que sumiria.
#
# Quando a diferença for intencional (você quer mesmo remover aquilo), traga o
# bloco para o template ou rode com --forcar, ciente do que apaga.
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/kanban-dev-regras.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


# Credenciais só quando for FALAR com a API: a trava anti-regressão roda antes,
# e ela precisa funcionar em qualquer clone, sem .env.local.
API = KEY = MOD = None


def conectar():
    global API, KEY, MOD
    if MOD is None:
        API, KEY = env()
        MOD = f"{API}/v1/apps/portal-suporte/modules/tickets"
    return MOD

# ── Blocos compartilhados ─────────────────────────────────────────────────────
# O alocador é CÓPIA do que vive em POST /tickets (claim atômico via id único
# em TicketSequence) — mesma sequência de propósito: decisão 11, numeração
# única. Se o original mudar, mudar aqui junto.
ALOCADOR = """
async function alocarNumero(Ticket, Seq) {
  var PREFIX = "TCK";
  var PAD = 6;
  var tickets = await Ticket.findMany({});
  var max = 0;
  var used = {};
  for (var j = 0; j < (tickets || []).length; j++) {
    var tn = String(tickets[j].ticket_number || tickets[j].ticketNumber || "");
    used[tn] = 1;
    if (tn.indexOf(PREFIX) === 0) {
      var n = parseInt(tn.slice(PREFIX.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var next = max + 1;
  if (Seq) {
    try {
      var rows = await Seq.findMany({});
      for (var i = 0; i < (rows || []).length; i++) {
        if (String(rows[i].key || "") === "ticket_number") {
          var sn = Number(rows[i].next || 0);
          if (sn > next) next = sn;
        }
      }
    } catch (e) {}
  }
  for (var attempt = 0; attempt < 80; attempt++) {
    var candidate = next + attempt;
    var num = PREFIX + String(candidate).padStart(PAD, "0");
    if (used[num]) continue;
    if (Seq) {
      try {
        await Seq.create({
          id: "tnclaim_" + num,
          key: "claim:" + num,
          next: candidate + 1,
          updated_at: new Date().toISOString(),
        });
      } catch (e) { continue; }
      try {
        var seqRows = await Seq.findMany({});
        var seq = null;
        for (var k = 0; k < (seqRows || []).length; k++) {
          if (String(seqRows[k].key || "") === "ticket_number") { seq = seqRows[k]; break; }
        }
        if (seq) {
          var cur = Number(seq.next || 0);
          if (candidate + 1 > cur) {
            await Seq.update(seq.id, { next: candidate + 1, updated_at: new Date().toISOString() });
          }
        } else {
          await Seq.create({ id: "ticket_number_seq", key: "ticket_number", next: candidate + 1, updated_at: new Date().toISOString() });
        }
      } catch (e) {}
    }
    return num;
  }
  throw new Error("Não foi possível alocar ticket_number");
}
"""

# Sequência própria do quadro Dev (bug 3.11): DEV-00142 — não consome TCK do Suporte.
ALOCADOR_DEV = """
async function alocarNumeroDev(Ticket, Seq) {
  var PREFIX = "DEV-";
  var PAD = 5;
  var tickets = await Ticket.findMany({});
  var max = 0;
  var used = {};
  for (var j = 0; j < (tickets || []).length; j++) {
    var dn = String(tickets[j].dev_ticket_number || tickets[j].devTicketNumber || "");
    used[dn] = 1;
    if (dn.indexOf(PREFIX) === 0) {
      var n = parseInt(dn.slice(PREFIX.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var next = max + 1;
  if (Seq) {
    try {
      var rows = await Seq.findMany({});
      for (var i = 0; i < (rows || []).length; i++) {
        if (String(rows[i].key || "") === "dev_ticket_number") {
          var sn = Number(rows[i].next || 0);
          if (sn > next) next = sn;
        }
      }
    } catch (e) {}
  }
  for (var attempt = 0; attempt < 80; attempt++) {
    var candidate = next + attempt;
    var num = PREFIX + String(candidate).padStart(PAD, "0");
    if (used[num]) continue;
    if (Seq) {
      try {
        await Seq.create({
          id: "devclaim_" + num,
          key: "claim:dev:" + num,
          next: candidate + 1,
          updated_at: new Date().toISOString(),
        });
      } catch (e) { continue; }
      try {
        var seqRows = await Seq.findMany({});
        var seq = null;
        for (var k = 0; k < (seqRows || []).length; k++) {
          if (String(seqRows[k].key || "") === "dev_ticket_number") { seq = seqRows[k]; break; }
        }
        if (seq) {
          var cur = Number(seq.next || 0);
          if (candidate + 1 > cur) {
            await Seq.update(seq.id, { next: candidate + 1, updated_at: new Date().toISOString() });
          }
        } else {
          await Seq.create({
            id: "dev_ticket_number_seq",
            key: "dev_ticket_number",
            next: candidate + 1,
            updated_at: new Date().toISOString(),
          });
        }
      } catch (e) {}
    }
    return num;
  }
  throw new Error("Não foi possível alocar dev_ticket_number");
}
"""

# Guarda de nível + grants — o mesmo desenho do módulo (chave de serviço passa).
# Identidade: JWT (`ctx.user`) OU sessão do portal (`x-portal-sessao`). Sem
# isso, com JWT vencido a chave de app não carrega pessoa e `servico: true`
# liberava tudo — regressão que a produção já tinha corrigido.
GUARDA = """
async function _sessaoDoPortal(ctx) {
  try {
    var h = (ctx.headers && (ctx.headers["x-portal-sessao"] || ctx.headers["X-Portal-Sessao"])) || "";
    var partes = String(h).split(".");
    if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
    var S = ctx.models && ctx.models.Sessao;
    if (!S) return null;
    var linha = await S.findById("ses_" + partes[0]);
    if (!linha || linha.revogada === true) return null;
    if (String(linha.verificador || "") !== partes[1]) return null;
    if (linha.expira_em && new Date(linha.expira_em).getTime() < Date.now()) return null;
    return linha.user_id || null;
  } catch (e) { return null; }
}
var _RANK = { user: 10, support: 20, developer: 30, admin: 40 };
var _APELIDOS = { master: "admin", gerente: "admin", member: "support", agent: "support", vendedor: "user" };
function _canonico(cru) {
  var v = String(cru || "").trim().toLowerCase();
  return _RANK[v] !== undefined ? v : (_APELIDOS[v] || "");
}
async function _perfilDe(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || (await _sessaoDoPortal(ctx));
  if (!quem || !ctx.models || !ctx.models.Profile) return { id: quem, nivel: 99, grants: [], servico: !quem };
  var p = await ctx.models.Profile.findById(quem).catch(function () { return null; });
  var grants = (p && (p.feature_grants || p.featureGrants)) || [];
  if (!Array.isArray(grants)) grants = [];
  return { id: quem, nivel: _RANK[_canonico(p ? p.role : "")] || 0, grants: grants, servico: false };
}
"""

# ── Rota 1: escalar para o Dev ───────────────────────────────────────────────
ESCALAR = ("""// %s — POST /tickets/:id/escalar-dev
// Escalar NÃO move o chamado para o quadro Dev: cria um card Dev NOVO
// (decisão 2) e deixa o chamado em pendencia_dev esperando a resposta.
""" % MARCA) + ALOCADOR_DEV + GUARDA + """
async function handler(ctx) {
  var Ticket = ctx.models.Ticket;
  var Seq = ctx.models.TicketSequence;
  var Log = ctx.models.ActivityLog;
  var Msg = ctx.models.TicketMessage;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });

  var eu = await _perfilDe(ctx);
  if (!eu.servico && eu.nivel < _RANK.support) {
    return ctx.reply.status(403).send({ error: "Sem permissão para esta operação" });
  }

  var id = ctx.params.id;
  var body = ctx.body || {};
  var origem = await Ticket.findById(id);
  if (!origem) return ctx.reply.status(404).send({ error: "Ticket not found" });
  if (String(origem.quadro || "suporte") === "dev") {
    return ctx.reply.status(400).send({ error: "Este card já é do quadro Dev" });
  }
  // Idempotência barata: um chamado não gera dois cards Dev abertos.
  var todos = await Ticket.findMany({});
  for (var i = 0; i < (todos || []).length; i++) {
    var t = todos[i];
    if (String(t.origem_ticket_id || "") === String(id) &&
        ["aplicado_no_cliente", "descartado"].indexOf(String(t.status)) < 0) {
      return ctx.reply.status(409).send({
        error: "Já existe um card Dev aberto para este chamado",
        dev_ticket_id: t.id,
      });
    }
  }

  var now = new Date().toISOString();
  var motivo = String(body.motivo || body.reason || "").trim();
  if (!motivo) {
    return ctx.reply.status(400).send({ error: "Informe o motivo da escalada — é o que o Dev vai ler primeiro" });
  }

  var numeroDev = await alocarNumeroDev(Ticket, Seq);
  var numeroOrigem = origem.ticket_number || origem.ticketNumber || id;
  var card = await Ticket.create({
    ticket_number: numeroDev,
    dev_ticket_number: numeroDev,
    quadro: "dev",
    status: "no_status",
    origem_ticket_id: id,
    origem_ticket_number: numeroOrigem,
    title: origem.title || "",
    description: motivo + "\\n\\n— Escalado do chamado " + numeroOrigem +
      (origem.description ? "\\n\\nDescrição original:\\n" + origem.description : ""),
    priority: origem.priority || "medium",
    severity: origem.severity || null,
    impact: origem.impact || null,
    module: origem.module || null,
    company_id: origem.company_id || null,
    company_name: origem.company_name || null,
    unit_id: origem.unit_id || null,
    source: "escalada_suporte",
    user_id: eu.id || null,
    is_public: false,
    position: 0,
    created_at: now,
    updated_at: now,
  });

  // O chamado espera em pendencia_dev — com rastro, como manda a Fase 0.
  await Ticket.update(id, { status: "pendencia_dev", pendency_type: "dev", updated_at: now });
  try {
    if (Log) {
      await Log.create({
        ticket_id: id, user_id: eu.id,
        action: "status_changed",
        details: { from: origem.status, to: "pendencia_dev", origem: "escalada_dev", dev_ticket_id: card.id },
        created_at: now, visible_to_client: true,
      });
      await Log.create({
        ticket_id: card.id, user_id: eu.id,
        action: "ticket_created",
        details: { dev_ticket_number: numeroDev, origem_ticket_number: numeroOrigem, origem: "escalada_suporte", origem_ticket_id: id },
        created_at: now, visible_to_client: false,
      });
    }
  } catch (e) {}
  // Mensagem INTERNA no chamado (decisão 8) — o cliente não vê.
  try {
    if (Msg) {
      await Msg.create({
        ticket_id: id, user_id: eu.id,
        message: "Escalado para o Desenvolvimento (card " + numeroDev + ", origem " + numeroOrigem + "). Motivo: " + motivo,
        is_internal: true, created_at: now,
      });
    }
  } catch (e) {}
  // Aviso para quem RECEBE trabalho (decisão 6): a equipe de Dev.
  try {
    if (ctx.models.Profile && typeof ctx.notify === "function") {
      var perfis = await ctx.models.Profile.findMany({});
      for (var p = 0; p < (perfis || []).length; p++) {
        var nivel = _RANK[_canonico(perfis[p].role)] || 0;
        if (nivel >= _RANK.developer && String(perfis[p].id) !== String(eu.id || "")) {
          try {
            await ctx.notify({
              userId: String(perfis[p].id),
              title: "Novo card no Kanban Dev",
              body: "O chamado " + (origem.ticket_number || id) + " \\"" + (origem.title || "") + "\\" foi escalado para o Dev.",
              severity: "info",
              href: "https://suporte.arara-tech.com/admin/kanban-dev?id=" + encodeURIComponent(card.id),
              sourceApp: "portal-suporte",
            });
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
  return ctx.reply.status(201).send({ success: true, data: { dev_ticket: card } });
}
module.exports = { handler };
"""

# ── Rota 2: demanda que nasce no Dev ─────────────────────────────────────────
CRIAR = ("""// %s — POST /dev/tickets
// Demanda interna (decisão 16): sem origem_ticket_id, fora dos indicadores de
// atendimento. Suporte não cria aqui — o caminho dele é escalar um chamado.
""" % MARCA) + ALOCADOR_DEV + GUARDA + """
async function handler(ctx) {
  var Ticket = ctx.models.Ticket;
  var Seq = ctx.models.TicketSequence;
  var Log = ctx.models.ActivityLog;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });

  var eu = await _perfilDe(ctx);
  if (!eu.servico && eu.nivel < _RANK.developer) {
    return ctx.reply.status(403).send({ error: "Criar card direto no Dev exige nível developer" });
  }

  var body = ctx.body || {};
  if (!body.title || !String(body.title).trim()) {
    return ctx.reply.status(400).send({ error: "Informe o título da demanda" });
  }
  var tipo = String(body.tipo || "").trim().toLowerCase();
  if (["desenvolvimento", "bug", "melhoria"].indexOf(tipo) < 0) {
    return ctx.reply.status(400).send({ error: "Classifique a demanda: desenvolvimento, bug ou melhoria" });
  }

  var now = new Date().toISOString();
  var numeroDev = await alocarNumeroDev(Ticket, Seq);
  var card = await Ticket.create({
    ticket_number: numeroDev,
    dev_ticket_number: numeroDev,
    quadro: "dev",
    status: "no_status",
    origem_ticket_id: null,
    title: String(body.title).trim(),
    description: String(body.description || ""),
    category: tipo,
    priority: body.priority || "medium",
    module: body.module || null,
    source: "dev_interno",
    user_id: eu.id || null,
    assigned_to: body.assigned_to || null,
    is_public: false,
    position: 0,
    created_at: now,
    updated_at: now,
  });
  try {
    if (Log) {
      await Log.create({
        ticket_id: card.id, user_id: eu.id,
        action: "ticket_created",
        details: { dev_ticket_number: numeroDev, origem: "dev_interno", tipo: tipo },
        created_at: now, visible_to_client: false,
      });
    }
  } catch (e) {}
  return ctx.reply.status(201).send({ success: true, data: card });
}
module.exports = { handler };
"""

# ── Rota 3: a máquina de estados ─────────────────────────────────────────────
MOVER = ("""// %s — POST /dev/tickets/:id/mover
// As validações do §17 vivem AQUI, no servidor. A tela repete por cortesia.
// REVISADO 15/09/2026: Aguardando Início exige esforço/prazo; admin pode saltar o grafo.
""" % MARCA) + GUARDA + """
var TRANSICOES = {
  no_status: ["backlog", "descartado"],
  backlog: ["em_desenvolvimento", "descartado"],
  em_desenvolvimento: ["desenvolvimento_finalizado", "descartado"],
  // Em Revisão removida (25/09/2026): Dev Finalizado já implica código
  // testado pelo próprio author. Entrar em Pronto p/ Teste exige HML.
  desenvolvimento_finalizado: ["pronto_para_teste", "em_desenvolvimento"],
  pronto_para_teste: ["em_testes", "em_desenvolvimento"],
  em_testes: ["teste_aprovado", "teste_reprovado"],
  teste_reprovado: ["em_desenvolvimento"],
  teste_aprovado: ["aplicado_no_cliente"],
  aplicado_no_cliente: [],
  descartado: [],
};

// Standalones SGC (espelho de app/lib/servidores-hml.ts), incl. americana.
var SERVIDORES_HML = [
  "americana","acesso-nutrition","bem-barato","brand-lar","casa-lar","shopping-lar",
  "casa-park","casa-rosa","ki-barato","mini-shopping","mogi-mirim","shopping-ap",
  "taquaral","shopping-100","shopping-campinas","shopping-itatiba","shopping-sc",
  "ttmb-utilidades"
];
var STATUS_TRAVAM_HML = { pronto_para_teste: 1, em_testes: 1 };

async function handler(ctx) {
  var Ticket = ctx.models.Ticket;
  var Log = ctx.models.ActivityLog;
  var Msg = ctx.models.TicketMessage;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });

  var eu = await _perfilDe(ctx);
  if (!eu.servico && eu.nivel < _RANK.developer) {
    return ctx.reply.status(403).send({ error: "Mover card do quadro Dev exige nível developer" });
  }

  var id = ctx.params.id;
  var body = ctx.body || {};
  var card = await Ticket.findById(id);
  if (!card) return ctx.reply.status(404).send({ error: "Ticket not found" });
  if (String(card.quadro || "suporte") !== "dev") {
    return ctx.reply.status(400).send({ error: "Este card não é do quadro Dev — use a rota do quadro de Suporte" });
  }

  var de = String(card.status || "no_status");
  var para = String(body.status || "").trim();
  if (!para) return ctx.reply.status(400).send({ error: "status required" });
  if (de === para) return ctx.reply.send({ success: true, data: card });

  // Legado (25/09/2026): coluna Em Revisão removida. Cards que ainda estão
  // nela passam a Dev Finalizado na primeira movimentação.
  if (de === "em_revisao") {
    de = "desenvolvimento_finalizado";
    card.status = de;
  }

  var permitidas = TRANSICOES[de] || [];
  // Admin+ pode saltar colunas (cadeado do Kanban Dev é só na UI).
  var podeSaltar = eu.servico || eu.nivel >= _RANK.admin;
  if (permitidas.indexOf(para) < 0 && !podeSaltar) {
    return ctx.reply.status(400).send({
      error: "Transição inválida: " + de + " → " + para,
      permitidas: permitidas,
    });
  }

  // QA valida, dev faz — a separação inteira do documento está nesta linha.
  if ((para === "teste_aprovado" || para === "teste_reprovado") &&
      !eu.servico && eu.nivel < _RANK.admin && eu.grants.indexOf("qa") < 0) {
    return ctx.reply.status(403).send({ error: "Aprovar ou reprovar teste exige a permissão de QA" });
  }

  var now = new Date().toISOString();
  var patch = { status: para, updated_at: now };
  var declaracaoNova = null;

  // ── Validações do §17 — cada erro diz EXATAMENTE o que falta ──
  // Card migrado na virada não passou pelas etapas anteriores: a primeira
  // movimentação não valida (decisão 15), e o flag é limpo aqui.
  var isento = card.migrado === true;
  if (isento) patch.migrado = false;

  if (!isento) {
    if (para === "backlog") {
      var ESFORCOS = { asap: 1, meio_sprint: 1, um_sprint: 1, dois_sprints: 1, indeterminado: 1 };
      var esforco = String(body.esforco_entrega || "").trim();
      if (!ESFORCOS[esforco]) {
        return ctx.reply.status(400).send({
          error: "Defina o esforço/prazo ao entrar em Aguardando Início (ASAP, 1/2 Sprint, 1 Sprint, 2 Sprints ou 4+)",
        });
      }
      patch.esforco_entrega = esforco;
      // Sexta 12:00 local — espelho de apps/portal-suporte/app/lib/dev-esforco.ts
      function _sextaMeioDia(semanas) {
        var agora = new Date();
        var d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
        var dia = d.getDay();
        var delta = dia === 6 ? -1 : (5 - dia + 7) % 7;
        d.setDate(d.getDate() + delta + (semanas || 0) * 7);
        d.setHours(12, 0, 0, 0);
        function p(n) { return (n < 10 ? "0" : "") + n; }
        return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
          + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
      }
      if (esforco === "asap" || esforco === "indeterminado") {
        patch.previsao_entrega = null;
      } else if (esforco === "meio_sprint") {
        patch.previsao_entrega = _sextaMeioDia(0);
      } else if (esforco === "um_sprint") {
        patch.previsao_entrega = _sextaMeioDia(1);
      } else {
        patch.previsao_entrega = _sextaMeioDia(4);
      }
    }
    if (para === "em_desenvolvimento" && de === "backlog") {
      var resp = body.assigned_to || card.assigned_to || card.assignedTo;
      if (!resp) return ctx.reply.status(400).send({ error: "Defina o responsável pelo desenvolvimento antes de iniciar" });
      if (!String(card.description || "").trim()) {
        return ctx.reply.status(400).send({ error: "A demanda precisa de descrição antes de sair de Aguardando Início" });
      }
      if (body.assigned_to) patch.assigned_to = body.assigned_to;
    }
    if (para === "desenvolvimento_finalizado") {
      var decl = String(body.declaracao || "").trim();
      if (!decl) {
        return ctx.reply.status(400).send({
          error: "Finalizar exige a declaração: código versionado, alterações identificadas e critérios de aceite atendidos",
        });
      }
      var linkPr = String(body.pull_request_url || card.pull_request_url || "").trim();
      if (!linkPr) {
        return ctx.reply.status(400).send({ error: "Informe o link do GitHub (branch ou Pull Request) ao finalizar o desenvolvimento" });
      }
      declaracaoNova = { etapa: para, texto: decl, autor: eu.id, em: now };
      if (body.pull_request_url) patch.pull_request_url = String(body.pull_request_url).trim();
    }
    if (para === "pronto_para_teste") {
      // Versão NÃO é exigida aqui (scripts/dev-versao-so-na-entrega.py): quem
      // controla o número é o deploy, e neste ponto ele ainda não existe.
      // Exige-se o servidor HML onde o build foi publicado; ele fica ocupado
      // enquanto o card estiver em Pronto p/ Teste ou Em Testes.
      if (body.version) patch.version = String(body.version).trim();
      var hml = String(body.environment || "").trim();
      if (!hml || SERVIDORES_HML.indexOf(hml) < 0) {
        return ctx.reply.status(400).send({
          error: "Informe o servidor HML onde o código foi publicado para teste",
        });
      }
      var ocupantes = (await Ticket.findMany({})) || [];
      for (var oi = 0; oi < ocupantes.length; oi++) {
        var o = ocupantes[oi];
        if (String(o.id) === String(id)) continue;
        if (String(o.quadro || "suporte") !== "dev") continue;
        if (!STATUS_TRAVAM_HML[String(o.status || "")]) continue;
        if (String(o.environment || "") !== hml) continue;
        return ctx.reply.status(400).send({
          error: "O servidor HML '" + hml + "' já está em uso pelo card "
            + (o.ticket_number || o.id) + " (" + String(o.status) + ")",
        });
      }
      patch.environment = hml;
    }
    if (para === "teste_aprovado") {
      var declQa = String(body.declaracao || "").trim();
      if (!declQa) {
        return ctx.reply.status(400).send({ error: "Aprovar exige a declaração do QA: cenários e critérios de aceite validados" });
      }
      declaracaoNova = { etapa: para, texto: declQa, autor: eu.id, em: now };
    }
    if (para === "teste_reprovado") {
      var motivoRep = String(body.motivo || "").trim();
      if (!motivoRep) {
        return ctx.reply.status(400).send({ error: "Reprovar exige o motivo — é o que o desenvolvedor vai corrigir" });
      }
      declaracaoNova = { etapa: para, texto: motivoRep, autor: eu.id, em: now };
    }
    if (para === "aplicado_no_cliente") {
      var versaoAp = String(body.version || card.version || "").trim();
      if (!versaoAp) {
        return ctx.reply.status(400).send({ error: "Informe a versão aplicada no cliente" });
      }
      if (body.version) patch.version = String(body.version).trim();
    }
    if (para === "descartado") {
      var motivoDesc = String(body.motivo || "").trim();
      if (!motivoDesc) {
        return ctx.reply.status(400).send({ error: "Descartar exige o motivo — ele volta para o atendente responder ao cliente" });
      }
      declaracaoNova = { etapa: para, texto: motivoDesc, autor: eu.id, em: now };
    }
  }

  if (declaracaoNova) {
    var lista = Array.isArray(card.declaracoes) ? card.declaracoes.slice() : [];
    lista.push(declaracaoNova);
    patch.declaracoes = lista;
  }
  if (body.previsao_entrega !== undefined && patch.previsao_entrega === undefined) {
    patch.previsao_entrega = body.previsao_entrega || null;
  }
  if (body.esforco_entrega !== undefined && patch.esforco_entrega === undefined) {
    patch.esforco_entrega = body.esforco_entrega || null;
  }
  if (para === "aplicado_no_cliente") patch.resolved_at = now;

  var row = await Ticket.update(id, patch);

  try {
    if (Log) {
      await Log.create({
        ticket_id: id, user_id: eu.id,
        action: para === "aplicado_no_cliente" ? "ticket_completed" : "status_changed",
        details: {
          from: de, to: para, origem: "kanban_dev",
          declaracao: declaracaoNova ? declaracaoNova.texto : null,
          migrado_isento: isento || null,
        },
        created_at: now, visible_to_client: false,
      });
    }
  } catch (e) {}

  // ── Retorno automático ao Suporte (decisão 13) ──
  var terminou = para === "aplicado_no_cliente" || para === "descartado";
  if (terminou && card.origem_ticket_id) {
    try {
      var origem = await Ticket.findById(String(card.origem_ticket_id));
      if (origem && String(origem.status) === "pendencia_dev") {
        await Ticket.update(origem.id, { status: "em_atendimento", pendency_type: null, updated_at: now });
        try {
          if (Log) {
            await Log.create({
              ticket_id: origem.id, user_id: eu.id,
              action: "status_changed",
              details: { from: "pendencia_dev", to: "em_atendimento", origem: "retorno_dev", dev_ticket_id: id },
              created_at: now, visible_to_client: true,
            });
          }
        } catch (e) {}
        var texto = para === "aplicado_no_cliente"
          ? "Dev concluiu: aplicado no cliente" + (patch.version || card.version ? " (versão " + (patch.version || card.version) + ")" : "") + ". Combine o retorno com o cliente."
          : "Dev descartou a demanda: " + (declaracaoNova ? declaracaoNova.texto : "") + ". Responda ao cliente.";
        try {
          if (Msg) {
            await Msg.create({
              ticket_id: origem.id, user_id: eu.id,
              message: texto, is_internal: true, created_at: now,
            });
          }
        } catch (e) {}
        var dono = origem.assigned_to || origem.assignedTo;
        if (dono && String(dono) !== String(eu.id || "") && typeof ctx.notify === "function") {
          try {
            await ctx.notify({
              userId: String(dono),
              title: para === "aplicado_no_cliente" ? "Dev concluiu — avise o cliente" : "Dev descartou — responda o cliente",
              body: "O chamado " + (origem.ticket_number || origem.id) + " voltou para Em Atendimento. " + texto,
              severity: para === "aplicado_no_cliente" ? "success" : "warning",
              href: "https://suporte.arara-tech.com/admin/tickets/view?id=" + encodeURIComponent(origem.id),
              sourceApp: "portal-suporte",
            });
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  return ctx.reply.send({ success: true, data: row });
}

// ── Guarda de sessão (scripts/guarda-sessao.py) ──
// Nada responde sem pessoa identificada. A identidade vem do JWT (`ctx.user`)
// ou da sessão do portal (`x-portal-sessao`); sem nenhuma das duas, 401.
//
// O desenho anterior tratava "sem pessoa" como chamada de serviço e liberava
// tudo. Como a chave de API de app não carrega pessoa, qualquer credencial
// aceita pelo app — inclusive a de um cliente — passava por cima do nível.
async function _gsSessao(ctx) {
  try {
    var h = (ctx.headers && (ctx.headers["x-portal-sessao"] || ctx.headers["X-Portal-Sessao"])) || "";
    var partes = String(h).split(".");
    if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
    var S = ctx.models && ctx.models.Sessao;
    if (!S) return null;
    var linha = await S.findById("ses_" + partes[0]);
    if (!linha || linha.revogada === true) return null;
    if (String(linha.verificador || "") !== partes[1]) return null;
    if (linha.expira_em && new Date(linha.expira_em).getTime() < Date.now()) return null;
    return linha.user_id || null;
  } catch (e) { return null; }
}
var _gsRANK = { user: 10, support: 20, developer: 30, admin: 40 };
var _gsAPELIDOS = { master: "admin", gerente: "admin", member: "support", agent: "support", vendedor: "user" };
function _gsCanonico(cru) {
  var v = String(cru || "").trim().toLowerCase();
  return _gsRANK[v] !== undefined ? v : (_gsAPELIDOS[v] || "");
}
async function _gsEuSou(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || (await _gsSessao(ctx));
  if (!quem) return null;
  var p = null;
  if (ctx.models && ctx.models.Profile) {
    p = await ctx.models.Profile.findById(quem).catch(function () { return null; });
  }
  return { id: quem, nivel: _gsRANK[_gsCanonico(p ? p.role : "")] || 0 };
}
var _gsOriginal = handler;
async function _gsComSessao(ctx) {
  var eu = await _gsEuSou(ctx);
  if (!eu) {
    return ctx.reply.status(401).send({ success: false, error: "Requer sessão do portal" });
  }
  if (eu.nivel < _gsRANK["user"]) {
    return ctx.reply.status(403).send({ success: false, error: "Sem permissão para esta operação" });
  }
  return _gsOriginal(ctx);
}
module.exports = { handler: _gsComSessao };

"""

ROTAS = [
    ("POST", "/tickets/:id/escalar-dev", ESCALAR),
    ("POST", "/dev/tickets", CRIAR),
    ("POST", "/dev/tickets/:id/mover", MOVER),
]


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
        return e.code, e.read().decode("utf-8", "replace")[:400]


# Blocos que precisam sobreviver a qualquer regravação: se estão no handler em
# produção e não no template, alguma coisa se perde. A lista é de marcas
# TEXTUAIS — nome de função, chave de patch, mensagem de erro —, o que basta
# para pegar remoção acidental sem falso positivo por formatação.
def _marcas(codigo):
    import re
    marcas = set()
    for m in re.finditer(r"^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)", codigo, re.M):
        marcas.add("função " + m.group(1))
    for m in re.finditer(r"patch\.([A-Za-z_$][\w$]*)\s*=", codigo):
        marcas.add("grava " + m.group(1))
    for m in re.finditer(r'error:\s*"([^"]{10,90})"', codigo):
        marcas.add("erro “" + m.group(1) + "”")
    for m in re.finditer(r"\bvar\s+(souMaster|isento|podeSaltar)\b", codigo):
        marcas.add("regra " + m.group(1))
    return marcas


def _handler_em_producao(metodo, caminho):
    """O handler que roda hoje, lido do routes.generated.ts do monorepo."""
    import re
    arq = os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps",
                       "portal-suporte", "routes.generated.ts")
    arq = os.path.normpath(arq)
    if not os.path.isfile(arq):
        return None, arq
    texto = open(arq, encoding="utf-8").read()
    alvo = None
    for m in re.finditer(r'method:\s*"(\w+)",\s*\n\s*path:\s*"([^"]+)"', texto):
        if m.group(1) == metodo and m.group(2) == caminho:
            corte = texto.index("compileController(", m.end())
            fim = texto.index('")', corte)
            while texto[fim - 1] == "\\":
                fim = texto.index('")', fim + 1)
            alvo = json.loads(texto[corte + len("compileController("):fim + 1])
            break
    return alvo, arq


def conferir_regressao(rotas, forcar):
    """Para o script quando a regravação apagaria bloco que hoje existe."""
    problemas = []
    for metodo, caminho, codigo in rotas:
        atual, arq = _handler_em_producao(metodo, caminho)
        if atual is None:
            print(f"   ⚠ {metodo} {caminho}: não encontrei o handler em {arq} — "
                  f"comparação pulada (rota nova?)")
            continue
        somem = sorted(_marcas(atual) - _marcas(codigo))
        if somem:
            problemas.append((metodo, caminho, somem))
    if not problemas:
        print("   ✓ nada se perde: o template cobre o que está em produção")
        return
    print("\n   ❌ REGRESSÃO: o template é mais velho que o código em produção.")
    for metodo, caminho, somem in problemas:
        print(f"      {metodo} {caminho} perderia:")
        for s in somem:
            print(f"        · {s}")
    print("\n   Traga esses blocos para o template antes de publicar.")
    print("   Se a remoção for intencional, repita com --forcar.")
    if not forcar:
        sys.exit(1)
    print("   (--forcar: seguindo mesmo assim)")


def _guarda_de_producao(codigo_prod):
    if not codigo_prod:
        return ""
    idx = codigo_prod.find("// ── Guarda de sessão (scripts/guarda-sessao.py)")
    if idx < 0:
        return ""
    return codigo_prod[idx:]


def _fundir_guarda(novo, codigo_prod):
    if "_gsComSessao" in novo:
        return novo
    guard = _guarda_de_producao(codigo_prod)
    if not guard:
        return novo
    if novo.rstrip().endswith("module.exports = { handler: _gsComSessao };"):
        return novo
    base = novo.replace("module.exports = { handler };", "").rstrip()
    return base + "\n" + guard


def _substituir_handler_no_arquivo(texto, metodo, caminho, codigo_novo):
    import re
    for m in re.finditer(r'method:\s*"(\w+)",\s*\n\s*path:\s*"([^"]+)"', texto):
        if m.group(1) != metodo or m.group(2) != caminho:
            continue
        corte = texto.index("compileController(", m.end())
        fim = texto.index('")', corte)
        while texto[fim - 1] == "\\":
            fim = texto.index('")', fim + 1)
        esc = json.dumps(codigo_novo)
        return texto[: corte + len("compileController(")] + esc + texto[fim + 1 :]
    return None


def sync_routes_local():
    """Grava handlers deste template em routes.generated.ts (sem API remota)."""
    _, arq = _handler_em_producao("POST", ROTAS[0][1])
    if not os.path.isfile(arq):
        print(f"❌ {arq} não encontrado")
        sys.exit(1)
    texto = open(arq, encoding="utf-8").read()
    for metodo, caminho, codigo in ROTAS:
        prod, _ = _handler_em_producao(metodo, caminho)
        merged = _fundir_guarda(codigo, prod)
        novo_texto = _substituir_handler_no_arquivo(texto, metodo, caminho, merged)
        if novo_texto is None:
            print(f"❌ rota não encontrada: {metodo} {caminho}")
            sys.exit(1)
        texto = novo_texto
        print(f"→ sync {metodo} {caminho} ({len(merged)} chars)")
    open(arq, "w", encoding="utf-8").write(texto)
    print(f"✓ {arq}")


def dump_tmp():
    for metodo, caminho, codigo in ROTAS:
        nome = caminho.strip("/").replace("/", "_").replace(":", "")
        open(f"/tmp/kdev_{nome}.js", "w").write(codigo)
    print("→ handlers em /tmp/kdev_*.js")


def main():
    if "--dump-tmp" in sys.argv:
        dump_tmp()
        return
    if "--sync-routes" in sys.argv:
        sync_routes_local()
        return
    aplicar = "--aplicar" in sys.argv
    forcar = "--forcar" in sys.argv
    conferir_regressao(ROTAS, forcar)
    conectar()
    _, d = req(f"{MOD}/routes")
    existentes = {(r["method"], r["path"]): r for r in d["routes"]}
    for metodo, caminho, codigo in ROTAS:
        nome = caminho.strip("/").replace("/", "_").replace(":", "")
        open(f"/tmp/kdev_{nome}.js", "w").write(codigo)
        ja = (metodo, caminho) in existentes
        atualizado = ja and MARCA in existentes[(metodo, caminho)]["controllerCode"]
        print(f"   {'=' if atualizado else '→'} {metodo} {caminho}: "
              f"{len(codigo)} chars ({'regrava' if ja else 'nova'}; /tmp/kdev_{nome}.js)")
        if not aplicar:
            continue
        c, r = req(f"{MOD}/routes", "PUT", {"method": metodo, "path": caminho, "controllerCode": codigo})
        if c >= 300:
            print(f"      ❌ HTTP {c} {r}")
            sys.exit(1)
    if not aplicar:
        print("\n   (simulação — use --aplicar; valide antes com node --check /tmp/kdev_*.js)")
        return
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar tickets: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
