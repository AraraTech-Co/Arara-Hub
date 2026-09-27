#!/usr/bin/env python3
# =============================================================================
# Devolve ao `GET /tickets/kanban` tudo que o quadro precisa para funcionar.
#
# POR QUE ESTE SCRIPT EXISTE — e a lição que ele registra:
#
# Este enriquecimento já existia e foi PERDIDO por um erro meu. Ao corrigir o
# autor das mensagens eu escrevi outra rota do módulo `tickets` e publiquei o
# módulo. Publicar promove o RASCUNHO INTEIRO, e o rascunho ainda tinha a
# versão antiga de `/tickets/kanban` — a publicação reverteu a rota junto.
#
# Regra que fica: no módulo desta plataforma, publicar não é um ato local de
# uma rota. Antes de publicar, o rascunho de TODAS as rotas do módulo precisa
# estar no estado desejado. Este script é idempotente justamente para poder ser
# reaplicado depois de qualquer publicação futura.
#
# O que a rota passa a devolver, além das colunas:
#
#   assignee           responsável, resolvido em nome (a coluna guarda só o id)
#   co_assignees       co-responsáveis (TicketCoAssignee)
#   received_by_user   quem registrou o chamado no portal (user_id)
#   escalated_to_user  para quem escalou (SLATracking.escalated_to)
#   envolvidos         ids de responsável + co-responsáveis + escalado, que é o
#                      que o filtro por pessoa usa: filtrar por alguém precisa
#                      trazer também aquilo de que ela é co-responsável
#   sla                { breached, minutes_remaining, escalated,
#                        first_response_at } — sem isto os filtros "Vencido",
#                      "Crítico", "No prazo" e o botão Escalado nunca casavam
#                      com nada, porque o campo simplesmente não vinha.
#
#   python3 scripts/kanban-enriquecer.py            # simula
#   python3 scripts/kanban-enriquecer.py --aplicar  # grava e publica
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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

CONTROLLER = r"""
async function handler(ctx) {
  const Ticket = ctx.models.Ticket;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });

  const rows = (await Ticket.findMany({})) || [];

  // ── Pessoas ────────────────────────────────────────────────────────────────
  // Um findMany de perfis para o quadro inteiro. Resolver por chamado seriam
  // centenas de consultas para 11 perfis.
  var porId = {};
  try {
    var perfis = (await ctx.models.Profile.findMany({})) || [];
    for (var i = 0; i < perfis.length; i++) {
      var p = perfis[i];
      var leve = {
        id: String(p.id),
        full_name: p.full_name || p.fullName || p.name || null,
        email: p.email || null,
        role: p.role || null,
      };
      if (p.id) porId[String(p.id)] = leve;
      if (p.user_id) porId[String(p.user_id)] = leve;
    }
  } catch (e) {}
  function pessoa(id) {
    return id ? (porId[String(id)] || null) : null;
  }

  // ── Co-responsáveis ────────────────────────────────────────────────────────
  var coPorTicket = {};
  try {
    var Co = ctx.models.TicketCoAssignee;
    if (Co) {
      var vinculos = (await Co.findMany({})) || [];
      for (var j = 0; j < vinculos.length; j++) {
        var v = vinculos[j];
        var tid = String(v.ticket_id || v.ticketId || "");
        if (!tid) continue;
        if (!coPorTicket[tid]) coPorTicket[tid] = [];
        var q = pessoa(v.user_id || v.userId);
        if (q) coPorTicket[tid].push(q);
      }
    }
  } catch (e) {}

  // ── SLA ────────────────────────────────────────────────────────────────────
  // Prazo, escalonamento e primeira resposta vivem em SLATracking, uma linha
  // por chamado. Sem juntar aqui, o quadro recebia `sla: null` e os filtros de
  // SLA e o botão Escalado não tinham em que casar.
  var slaPorTicket = {};
  try {
    var Track = ctx.models.SLATracking;
    if (Track) {
      var trilhas = (await Track.findMany({})) || [];
      var agora = Date.now();
      for (var k = 0; k < trilhas.length; k++) {
        var s = trilhas[k];
        var tid2 = String(s.ticket_id || s.ticketId || "");
        if (!tid2) continue;
        var prazo = s.resolution_deadline ? new Date(s.resolution_deadline).getTime() : null;
        var resolvido = s.resolved_at ? new Date(s.resolved_at).getTime() : null;
        var restante = prazo ? Math.round((prazo - (resolvido || agora)) / 60000) : null;
        slaPorTicket[tid2] = {
          breached: prazo ? (resolvido || agora) > prazo : false,
          minutes_remaining: restante,
          escalated: s.escalated === true,
          escalated_to: s.escalated_to || null,
          first_response_at: s.first_response_at || null,
          resolution_deadline: s.resolution_deadline || null,
        };
      }
    }
  } catch (e) {}

  var columns = {};
  var lista = rows.map(function (t) {
    var id = String(t.id);
    var resp = pessoa(t.assigned_to || t.assignedTo);
    var cos = coPorTicket[id] || [];
    var sla = slaPorTicket[id] || null;
    var escalado = sla ? pessoa(sla.escalated_to) : null;

    // Quem tem responsabilidade sobre o chamado. O filtro por pessoa usa esta
    // lista: procurar só `assigned_to` esconderia de alguém o que ela atende
    // como co-responsável.
    var envolvidos = [];
    if (resp) envolvidos.push(resp.id);
    for (var m = 0; m < cos.length; m++) if (cos[m]) envolvidos.push(cos[m].id);
    if (escalado) envolvidos.push(escalado.id);

    return Object.assign({}, t, {
      assignee: resp,
      co_assignees: cos,
      received_by_user: pessoa(t.user_id || t.userId),
      escalated_to_user: escalado,
      envolvidos: envolvidos,
      sla: sla,
    });
  });

  for (var n = 0; n < lista.length; n++) {
    var st = String(lista[n].status || "novos_chamados");
    if (!columns[st]) columns[st] = [];
    columns[st].push(lista[n]);
  }

  return ctx.reply.send({ data: columns, tickets: lista, columns: columns, count: lista.length });
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
        with urllib.request.urlopen(r, timeout=150) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    _, dados = req(f"{MOD}/routes")
    alvo = next((r for r in dados["routes"] if r["path"] == "/tickets/kanban"), None)
    if not alvo:
        sys.exit("❌ rota /tickets/kanban não encontrada")

    atual = alvo["controllerCode"] or ""
    print(f"→ controller atual: {len(atual)} caracteres · enriquecido? {'envolvidos' in atual}")

    if "--aplicar" not in sys.argv:
        print("   (simulação — use --aplicar para gravar e publicar)")
        return

    corpo = {"method": alvo["method"], "path": alvo["path"], "controllerCode": CONTROLLER}
    for extra in ("authMode", "webhookSecretName"):
        if alvo.get(extra):
            corpo[extra] = alvo[extra]
    c, r = req(f"{MOD}/routes", "PUT", corpo)
    print(f"→ escrever rota: HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar módulo: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
