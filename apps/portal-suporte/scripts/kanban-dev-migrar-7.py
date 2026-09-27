#!/usr/bin/env python3
# =============================================================================
# Fase 5 do Kanban Dev — a virada (decisão 15).
#
# Os cards que HOJE estão em Pendência Dev / Em Teste no quadro de Suporte
# ganham um card Dev correspondente:
#
#   pendencia_dev → card Dev em `no_status`  (primeira etapa: falta triagem)
#   em_teste      → card Dev em `em_testes`  (é onde de fato estão)
#
# Cada card nasce com `migrado: true` (a primeira movimentação não valida a
# etapa — eles não passaram pelas anteriores) e `origem_ticket_id` apontando
# para o chamado. O chamado de Suporte NÃO muda de status: a decisão foi criar
# o espelho no Dev, não mexer no quadro que a equipe está olhando.
#
# Nota honesta sobre os de `em_teste`: o retorno automático (decisão 13) só
# dispara quando o chamado de origem está em `pendencia_dev`. Estes seguem em
# `em_teste`, então ao concluir o card Dev o atendente move o chamado à mão —
# vale só para estes 5, e morre com eles.
#
# Modelos só são acessíveis de dentro de controller, então o script instala uma
# rota TEMPORÁRIA, roda (com ?simular=1 primeiro), e a REMOVE ao final — mesmo
# padrão de wa-acervo.py.
#
#   python3 scripts/kanban-dev-migrar-7.py --simular
#   python3 scripts/kanban-dev-migrar-7.py --executar
#   python3 scripts/kanban-dev-migrar-7.py --limpar     # remove a rota
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMINHO = "/dev/migrar-virada"

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

ROTA = r"""// TEMPORÁRIA — scripts/kanban-dev-migrar-7.py. Remover após a virada.
async function alocarNumero(Ticket, Seq) {
  var PREFIX = "TCK", PAD = 6;
  var tickets = await Ticket.findMany({});
  var max = 0, used = {};
  for (var j = 0; j < (tickets || []).length; j++) {
    var tn = String(tickets[j].ticket_number || "");
    used[tn] = 1;
    if (tn.indexOf(PREFIX) === 0) {
      var n = parseInt(tn.slice(PREFIX.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var next = max + 1;
  for (var attempt = 0; attempt < 80; attempt++) {
    var candidate = next + attempt;
    var num = PREFIX + String(candidate).padStart(PAD, "0");
    if (used[num]) continue;
    if (Seq) {
      try {
        await Seq.create({ id: "tnclaim_" + num, key: "claim:" + num, next: candidate + 1, updated_at: new Date().toISOString() });
      } catch (e) { continue; }
    }
    return num;
  }
  throw new Error("sem número");
}
async function handler(ctx) {
  var Ticket = ctx.models.Ticket;
  var Seq = ctx.models.TicketSequence;
  var Log = ctx.models.ActivityLog;
  var simular = !!(ctx.query && ctx.query.simular);
  var todos = (await Ticket.findMany({})) || [];
  var MAPA = { pendencia_dev: "no_status", em_teste: "em_testes" };
  var alvos = [], jaMigrados = [];
  for (var i = 0; i < todos.length; i++) {
    var t = todos[i];
    if (String(t.quadro || "suporte") !== "suporte") continue;
    if (!MAPA[String(t.status)]) continue;
    // Idempotência: quem já tem card Dev apontando para si não entra de novo.
    var tem = false;
    for (var k = 0; k < todos.length; k++) {
      if (String(todos[k].origem_ticket_id || "") === String(t.id)) { tem = true; break; }
    }
    (tem ? jaMigrados : alvos).push(t);
  }
  var plano = alvos.map(function (t) {
    return { chamado: t.ticket_number, titulo: t.title, de: t.status, para: MAPA[t.status] };
  });
  if (simular) {
    return ctx.reply.send({ success: true, simulacao: true, criaria: plano, jaMigrados: jaMigrados.length });
  }
  var criados = [];
  var now = new Date().toISOString();
  for (var a = 0; a < alvos.length; a++) {
    var o = alvos[a];
    var numero = await alocarNumero(Ticket, Seq);
    var card = await Ticket.create({
      ticket_number: numero,
      quadro: "dev",
      status: MAPA[String(o.status)],
      origem_ticket_id: o.id,
      migrado: true,
      title: o.title || "",
      description: (o.description || "") + "\n\n— Migrado na virada do Kanban Dev (18/08/2026), a partir do chamado " + (o.ticket_number || o.id) + ".",
      priority: o.priority || "medium",
      severity: o.severity || null,
      module: o.module || null,
      company_id: o.company_id || null,
      company_name: o.company_name || null,
      unit_id: o.unit_id || null,
      assigned_to: o.assigned_to || null,
      source: "virada_migracao",
      is_public: false,
      position: 0,
      created_at: now,
      updated_at: now,
    });
    try {
      if (Log) {
        await Log.create({
          ticket_id: card.id, user_id: null,
          action: "ticket_created",
          details: { ticket_number: numero, origem: "virada_migracao", origem_ticket_id: o.id, migrado: true },
          created_at: now, visible_to_client: false,
        });
      }
    } catch (e) {}
    criados.push({ dev: numero, chamado: o.ticket_number, status: MAPA[String(o.status)] });
  }
  return ctx.reply.send({ success: true, criados: criados, jaMigrados: jaMigrados.length });
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
        return e.code, e.read().decode("utf-8", "replace")[:400]

def instalar():
    c, d = req(f"{MOD}/routes", "PUT", {"method": "POST", "path": CAMINHO, "controllerCode": ROTA})
    if c >= 300:
        print(f"! instalar: HTTP {c} {d}"); sys.exit(1)
    c, _ = req(MOD, "PATCH", {"status": "published"})
    print(f"→ rota temporária publicada (HTTP {c})")

def limpar():
    c, d = req(f"{MOD}/routes/POST{CAMINHO.replace('/', '~')}", "DELETE")
    if c >= 300:
        # forma alternativa da plataforma
        c, d = req(f"{MOD}/routes", "DELETE", {"method": "POST", "path": CAMINHO})
    print(f"→ remover rota: HTTP {c} {'' if c < 300 else d}")
    c, _ = req(MOD, "PATCH", {"status": "published"})
    print(f"→ republicar: HTTP {c}")

def main():
    if "--simular" in sys.argv:
        instalar()
        c, d = req(f"{API}/v1/r/portal-suporte{CAMINHO}?simular=1", "POST", {})
        print(json.dumps(d, indent=1, ensure_ascii=False))
    elif "--executar" in sys.argv:
        c, d = req(f"{API}/v1/r/portal-suporte{CAMINHO}", "POST", {})
        print(json.dumps(d, indent=1, ensure_ascii=False))
        if c < 300:
            limpar()
    elif "--limpar" in sys.argv:
        limpar()
    else:
        print("use --simular | --executar | --limpar")

if __name__ == "__main__":
    main()
