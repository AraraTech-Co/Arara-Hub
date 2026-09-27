#!/usr/bin/env python3
# =============================================================================
# Corresponsável: avisar quem entra, e fazer "meus chamados" enxergá-lo.
#
# Duas pontas do mesmo buraco. Hoje, quem é colocado como corresponsável:
#
#   1. não é avisado — descobre por acaso, abrindo o card;
#   2. não vê o chamado em "Minha operação", no painel, porque aquela lista
#      filtra só por `assigned_to`. O QUADRO já resolve isso (o filtro por
#      pessoa usa `envolvidos`, montado em `/tickets/kanban`), mas o painel
#      lê de `GET /tickets`, que devolve a linha crua da tabela.
#
# O que este script faz:
#
#   POST /tickets/:id/co-assignees   passa a chamar `ctx.notify` para quem foi
#                                    incluído (nunca para quem incluiu).
#   GET  /tickets                    passa a devolver `co_assignees` (ids) e
#                                    `envolvidos` — responsável + corresponsáveis
#                                    — com UMA varredura da tabela de vínculos,
#                                    não uma consulta por chamado.
#
# `envolvidos` tem o mesmo significado dos dois lados, de propósito: duas
# definições de "meus chamados" seria a receita para eles divergirem.
#
#   python3 scripts/corresponsavel-aviso-e-filtro.py            # simula
#   python3 scripts/corresponsavel-aviso-e-filtro.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/corresponsavel-aviso-e-filtro.py"
PORTAL = "https://suporte.arara-tech.com"


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

# ── 1. Aviso ao virar corresponsável ─────────────────────────────────────────
CO_ALVO = '  return ctx.reply.status(201).send({ success: true, data: row });'
CO_NOVO = '''  // Aviso para quem foi incluído — %s.
  // Corresponsável recebe trabalho sem ter pedido, igual a escalonamento;
  // quem inclui a si mesmo não é avisado.
  if (String(userId) !== String(actor || "") && typeof ctx.notify === "function") {
    try {
      var _t = ctx.models.Ticket ? await ctx.models.Ticket.findById(ticketId) : null;
      var _num = _t ? (_t.ticket_number || _t.ticketNumber || ticketId) : ticketId;
      await ctx.notify({
        userId: String(userId),
        title: "Você entrou como corresponsável",
        body: "O chamado " + _num + " \\"" + ((_t && _t.title) || "") + "\\" agora tem você como corresponsável.",
        severity: "info",
        href: "%s/admin/tickets/view?id=" + encodeURIComponent(ticketId),
        sourceApp: "portal-suporte",
      });
    } catch (e) {}
  }
  return ctx.reply.status(201).send({ success: true, data: row });''' % (MARCA, PORTAL)

# ── 2. `envolvidos` na listagem ──────────────────────────────────────────────
LISTA_ALVO = """  const filter = Object.assign({}, ctx.query || {});
  const rows = await model.findMany(filter);
  return ctx.reply.send({ data: rows, count: rows.length });"""

LISTA_NOVO = """  const filter = Object.assign({}, ctx.query || {});
  const rows = await model.findMany(filter);

  // `envolvidos` = responsável + corresponsáveis. Mesmo significado que a rota
  // do quadro usa, para não existirem duas definições de "meus chamados".
  // Ver %s.
  //
  // UMA varredura da tabela de vínculos e um índice em memória: consultar por
  // chamado multiplicaria as idas ao banco pelo tamanho da lista.
  var porTicket = {};
  try {
    var Co = ctx.models.TicketCoAssignee;
    if (Co) {
      var vinculos = (await Co.findMany({})) || [];
      for (var v = 0; v < vinculos.length; v++) {
        var tid = String(vinculos[v].ticket_id || vinculos[v].ticketId || "");
        var uid = vinculos[v].user_id || vinculos[v].userId;
        if (!tid || !uid) continue;
        (porTicket[tid] = porTicket[tid] || []).push(String(uid));
      }
    }
  } catch (e) {}

  var comEnvolvidos = rows.map(function (t) {
    var id = String(t.id);
    var cos = porTicket[id] || [];
    var resp = t.assigned_to || t.assignedTo || null;
    var envolvidos = [];
    if (resp) envolvidos.push(String(resp));
    for (var c = 0; c < cos.length; c++) {
      if (envolvidos.indexOf(cos[c]) < 0) envolvidos.push(cos[c]);
    }
    return Object.assign({}, t, { co_assignees: cos, envolvidos: envolvidos });
  });

  return ctx.reply.send({ data: comEnvolvidos, count: comEnvolvidos.length });""" % MARCA

MUDANCAS = [
    ("POST", "/tickets/:id/co-assignees", CO_ALVO, CO_NOVO),
    ("GET", "/tickets", LISTA_ALVO, LISTA_NOVO),
]


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
    mudou = False
    for metodo, caminho, alvo, troca in MUDANCAS:
        rota = [r for r in d["routes"] if r["path"] == caminho and r["method"] == metodo]
        if not rota:
            print(f"   ! {metodo} {caminho}: não existe")
            continue
        rota = rota[0]
        codigo = rota["controllerCode"]
        if MARCA in codigo:
            print(f"   = {metodo} {caminho}: já aplicado")
            continue
        if codigo.count(alvo) != 1:
            print(f"   ! {metodo} {caminho}: âncora aparece {codigo.count(alvo)}x")
            continue
        novo = codigo.replace(alvo, troca, 1)
        print(f"   {'→' if aplicar else ' '} {metodo} {caminho}: +{len(novo) - len(codigo)} caracteres")
        if not aplicar:
            continue
        corpo = {"method": metodo, "path": caminho, "controllerCode": novo}
        for extra in ("authMode", "webhookSecretName"):
            if rota.get(extra):
                corpo[extra] = rota[extra]
        c, r = req(f"{MOD}/routes", "PUT", corpo)
        if c >= 300:
            print(f"      ❌ HTTP {c} {r}")
            sys.exit(1)
        mudou = True

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    if mudou:
        c, r = req(MOD, "PATCH", {"status": "published"})
        print(f"→ publicar tickets: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
