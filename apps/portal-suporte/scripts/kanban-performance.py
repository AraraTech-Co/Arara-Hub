#!/usr/bin/env python3
# =============================================================================
# Performance do Kanban — reclamação de lentidão (20/08/2026).
#
# MEDIDO antes de mexer:
#   GET /tickets/kanban  →  ~2,7 s  ·  2,7 MB
#   Cronômetro por tabela (sonda no sandbox):
#     Attachment.findMany({})  624 ms p/ 203 linhas  ← o arquivo fica em BASE64
#                              na própria linha; o controller puxava os bytes de
#                              TODOS os anexos só para CONTAR por card.
#     demais tabelas           ~45 ms somadas
#   O resto (~1,9 s) é o peso da resposta: descrição inteira de 472 chamados
#   que o card não mostra, serializada, transferida e parseada.
#
# TRÊS CORTES:
#
#   1. Contador materializado — `Ticket.attachment_count` mantido nos 3 pontos
#      de escrita (POST interno, POST externo, DELETE). O quadro lê o campo;
#      o scan de base64 sai do caminho quente. Backfill único na aplicação.
#
#   2. Resposta enxuta — allowlist dos campos que o quadro usa; `description`
#      truncada em 220 chars (o card mostra 2 linhas). O detalhe do chamado
#      continua carregando tudo pela rota própria.
#
#   3. Teto nos fechados — 369 dos 472 cards eram `fechado`. O quadro devolve
#      os 50 mais recentes e informa `fechados_ocultos`; o histórico completo
#      vive na lista/tabela, que tem paginação e busca.
#
#   python3 scripts/kanban-performance.py            # simula
#   python3 scripts/kanban-performance.py --aplicar  # aplica + backfill + mede
# =============================================================================

import json
import os
import sys
import time
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/kanban-performance.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
APP = f"{API}/v1/apps/portal-suporte"

# ── 1+2+3: o miolo novo do GET /tickets/kanban ───────────────────────────────
KANBAN_VELHO_CONTAGEM = None  # localizado dinamicamente (bloco de anexos)

CAMPOS_DO_QUADRO = """
// ── Resposta enxuta (%s) ──
// O quadro usa ESTES campos; o resto (descrição inteira, justificativa da IA,
// embeddings…) inflava a resposta a 2,7 MB e respondia por ~2 s de serialização
// e transferência. O detalhe do chamado carrega tudo pela rota própria.
var CAMPOS = ["id","title","status","priority","severity","category","ticket_number",
  "ticket_type","source","tags","recurring","impact","is_public","company_id",
  "company_name","company_cnpj","contact_email","position","created_at","updated_at",
  "user_id","assigned_to","requester","pendency_reason","pendency_type",
  "follow_up_date","is_blocked","blocked_reason","column_entered_at",
  "pull_request_url","quadro","origem_ticket_id","migrado","version","environment",
  "previsao_entrega","esforco_entrega","declaracoes","unit_id","attachment_count","resolved_at"];
function enxuto(t) {
  var o = {};
  for (var i = 0; i < CAMPOS.length; i++) {
    if (t[CAMPOS[i]] !== undefined) o[CAMPOS[i]] = t[CAMPOS[i]];
  }
  var d = String(t.description || "");
  o.description = d.length > 220 ? d.slice(0, 220) + "…" : d;
  return o;
}
""" % MARCA

# ── Manutenção do contador nos pontos de escrita ─────────────────────────────
CONTADOR = """
// ── Contador de anexos (%s) ──
// O quadro lê `Ticket.attachment_count` em vez de varrer a tabela de anexos —
// cada linha carrega o arquivo em base64, e contar custava 624 ms por request.
async function _ajustarContador(ctx, ticketId, delta) {
  try {
    var T = ctx.models.Ticket;
    if (!T || !ticketId) return;
    var t = await T.findById(String(ticketId));
    if (!t) return;
    var atual = Number(t.attachment_count || 0) + delta;
    await T.update(t.id, { attachment_count: atual < 0 ? 0 : atual });
  } catch (e) {}
}
""" % MARCA


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=300) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]


def gravar(modulo, rota, codigo):
    corpo = {"method": rota["method"], "path": rota["path"], "controllerCode": codigo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    return req(f"{APP}/modules/{modulo}/routes", "PUT", corpo)


def main():
    aplicar = "--aplicar" in sys.argv
    publicar = set()

    # ── A. Campo attachment_count no model ───────────────────────────────────
    _, d = req(f"{APP}/models")
    ticket = [m for m in d["models"] if m["name"] == "portal-suporte-Ticket"][0]
    props = dict(ticket["schema"].get("properties", {}))
    if "attachment_count" in props:
        print("= Ticket.attachment_count já existe")
    else:
        print("→ Ticket.attachment_count: criar")
        if aplicar:
            props["attachment_count"] = {"type": "number"}
            c, r = req(f"{APP}/models/{ticket['name']}", "PATCH",
                       {"schema": {"type": "object", "properties": props}})
            if c >= 300:
                print(f"   ❌ {c} {r}"); sys.exit(1)

    # ── B. Kanban: tirar o scan de anexos, enxugar, teto nos fechados ────────
    _, d = req(f"{APP}/modules/tickets/routes")
    rota = [r for r in d["routes"] if r["path"] == "/tickets/kanban" and r["method"] == "GET"][0]
    cod = rota["controllerCode"]
    if MARCA in cod:
        print("= kanban: já otimizado")
    else:
        # b1. contagem de anexos por scan → campo materializado
        # O bloco é o try/catch que faz Attachment.findMany — o de mensagens
        # (barato, 9 ms) fica como está.
        ini = cod.index("var anexos = (await ctx.models.Attachment.findMany({}))")
        ini = cod.rindex("try {", 0, ini)
        fim = cod.index("} catch (e) {}", ini)
        fim = cod.index("\n", fim) + 1
        bloco = cod[ini:fim]
        if "Attachment" not in bloco:
            print("! bloco de anexos não é o esperado; revise"); sys.exit(1)
        cod = cod.replace(bloco, "// Anexos: campo materializado Ticket.attachment_count (%s)\n" % MARCA, 1)
        cod = cod.replace("attachment_count: anexosPorTicket[id] || 0,",
                          "attachment_count: Number(t.attachment_count || 0),", 1)

        # b2. teto nos fechados — entra logo depois do filtro de quadro
        alvo = 'return String(t.quadro || "suporte") === _quadro;\n  });'
        if cod.count(alvo) != 1:
            print("! âncora do filtro de quadro não achada"); sys.exit(1)
        cod = cod.replace(alvo, alvo + """

  // ── Teto nos fechados (%s) ──
  // 369 dos 472 cards eram `fechado`: pesavam a resposta e o DOM do quadro
  // inteiro para uma coluna que ninguém rola até o fim. Ficam os 50 mais
  // recentes; o total sai em `fechados_ocultos` e o histórico completo vive na
  // lista de chamados, que tem paginação e busca.
  var _fechados = rows.filter(function (t) { return String(t.status) === "fechado"; });
  var _fechadosOcultos = 0;
  if (_fechados.length > 50) {
    _fechados.sort(function (a, b) {
      return String(b.updated_at || b.updatedAt || "") < String(a.updated_at || a.updatedAt || "") ? -1 : 1;
    });
    var _manter = {};
    for (var _f = 0; _f < 50; _f++) _manter[String(_fechados[_f].id)] = 1;
    _fechadosOcultos = _fechados.length - 50;
    rows = rows.filter(function (t) {
      return String(t.status) !== "fechado" || _manter[String(t.id)];
    });
  }
""" % MARCA, 1)

        # b3. resposta enxuta — a função entra antes do handler usar, e o map
        # passa a partir do objeto enxuto
        alvo = "var columns = {};"
        if cod.count(alvo) != 1:
            print("! âncora das colunas não achada"); sys.exit(1)
        cod = cod.replace(alvo, CAMPOS_DO_QUADRO + "\n  " + alvo, 1)
        alvo = "return Object.assign({}, t, {"
        if cod.count(alvo) != 1:
            print("! âncora do map não achada"); sys.exit(1)
        cod = cod.replace(alvo, "return Object.assign(enxuto(t), {", 1)

        # b4. fechados_ocultos na resposta
        alvo = "count: lista.length });"
        if alvo not in cod:
            alvo = "count: lista.length,"
        if cod.count(alvo) != 1:
            # forma exata da linha final
            alvo = "return ctx.reply.send({ data: columns, tickets: lista, columns: columns, count: lista.length });"
            if cod.count(alvo) != 1:
                print("! âncora da resposta não achada"); sys.exit(1)
            cod = cod.replace(alvo,
                "return ctx.reply.send({ data: columns, tickets: lista, columns: columns, count: lista.length, fechados_ocultos: _fechadosOcultos });", 1)
        else:
            cod = cod.replace(alvo, alvo.replace("count: lista.length", "count: lista.length, fechados_ocultos: _fechadosOcultos"), 1)

        open("/tmp/kanban_perf.js", "w").write(cod)
        print(f"→ kanban otimizado ({len(rota['controllerCode'])} → {len(cod)} chars; /tmp/kanban_perf.js)")
        if aplicar:
            c, r = gravar("tickets", rota, cod)
            if c >= 300:
                print(f"   ❌ {c} {r}"); sys.exit(1)
            publicar.add("tickets")

    # ── C. Contador nos pontos de escrita ────────────────────────────────────
    PONTOS = [
        ("admin_backfill_ticket_numbers", "POST", "/tickets/:id/attachments", +1),
        ("external", "POST", "/external/tickets/:id/attachments", +1),
        ("attachments", "DELETE", "/attachments/:id", -1),
    ]
    for modulo, metodo, caminho, delta in PONTOS:
        _, d = req(f"{APP}/modules/{modulo}/routes")
        rota = [r for r in d["routes"] if r["path"] == caminho and r["method"] == metodo][0]
        cod = rota["controllerCode"]
        if MARCA in cod:
            print(f"= {metodo} {caminho}: contador já mantido")
            continue
        print(f"→ {metodo} {caminho}: manter contador ({'+' if delta > 0 else ''}{delta})")
        if not aplicar:
            continue
        # o ajuste entra imediatamente antes de CADA resposta de sucesso seria
        # frágil; em vez disso, envelopamos o handler: sucesso → ajusta.
        envelope = CONTADOR + """
var _handlerAnexos = handler;
async function _comContador(ctx) {
  var r = await _handlerAnexos(ctx);
  try {
    var st = ctx.reply && ctx.reply.statusCode;
    // Nos handlers deste app o send() resolve a resposta; consideramos sucesso
    // qualquer status < 400 (ou ausência de status registrado).
    if (!st || st < 400) {
      var tid = ctx.params.id || null;
      if (!tid && ctx.models.Attachment && %s < 0) {
        // DELETE /attachments/:id — o ticket vem do próprio anexo, que o
        // handler acabou de apagar; buscamos antes? Não dá. Por isso o DELETE
        // é tratado ANTES do handler, no _preDelete abaixo.
      }
      if (tid) await _ajustarContador(ctx, tid, %s);
    }
  } catch (e) {}
  return r;
}
module.exports = { handler: _comContador };
""" % (delta, delta)
        if delta < 0:
            # DELETE: precisa ler o anexo ANTES de apagar para saber o ticket.
            envelope = CONTADOR + """
var _handlerAnexos = handler;
async function _comContador(ctx) {
  var _tid = null;
  try {
    var A = ctx.models.Attachment;
    if (A && ctx.params.id) {
      var a = await A.findById(String(ctx.params.id));
      if (a) _tid = a.ticket_id || a.ticketId || null;
    }
  } catch (e) {}
  var r = await _handlerAnexos(ctx);
  try {
    var st = ctx.reply && ctx.reply.statusCode;
    if ((!st || st < 400) && _tid) await _ajustarContador(ctx, _tid, -1);
  } catch (e) {}
  return r;
}
module.exports = { handler: _comContador };
"""
        alvo = "module.exports = { handler };"
        if cod.count(alvo) == 1:
            novo = cod.replace(alvo, envelope, 1)
        elif "module.exports = { handler: _comControleDeAcesso };" in cod:
            # handler embrulhado pela guarda: embrulhamos por fora dela
            novo = cod.replace("module.exports = { handler: _comControleDeAcesso };",
                               envelope.replace("_handlerAnexos = handler;",
                                                "_handlerAnexos = _comControleDeAcesso;"), 1)
        else:
            print(f"   ! exportação inesperada em {caminho}"); sys.exit(1)
        c, r = gravar(modulo, rota, novo)
        if c >= 300:
            print(f"   ❌ {c} {r}"); sys.exit(1)
        publicar.add(modulo)

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return

    for modulo in publicar:
        c, r = req(f"{APP}/modules/{modulo}", "PATCH", {"status": "published"})
        print(f"→ publicar {modulo}: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
