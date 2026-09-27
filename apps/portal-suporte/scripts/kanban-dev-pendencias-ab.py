#!/usr/bin/env python3
# =============================================================================
# Pendências A e B do Kanban Dev (anotadas na Fase 0 e na separação de quadros).
#
# A) `POST /tickets/:id/move` avisava responsável e solicitante, mas NÃO os
#    corresponsáveis — a rota `status` avisa. Mesma mudança de estado, dois
#    comportamentos. Agora as duas avisam igual.
#
# B) Cinco leitores de lista devolviam TODOS os tickets — com o quadro Dev
#    existindo, card Dev entrava em stats, dashboard, export, my-stats e na
#    lista geral (all-tickets-table). Agora todos aceitam `?quadro=`:
#      ausente     → suporte (o comportamento que os consumidores atuais esperam)
#      ?quadro=dev → só o quadro Dev
#      ?quadro=todos → tudo (para auditoria)
#
#   python3 scripts/kanban-dev-pendencias-ab.py            # simula
#   python3 scripts/kanban-dev-pendencias-ab.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/kanban-dev-pendencias-ab.py"


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

# ── A: corresponsáveis no move ───────────────────────────────────────────────
MOVE_VELHO = """      if (row.assigned_to || row.assignedTo) recipients[String(row.assigned_to || row.assignedTo)] = 1;
      if (row.user_id || row.userId) recipients[String(row.user_id || row.userId)] = 1;
      if (actor) delete recipients[String(actor)];"""
MOVE_NOVO = """      if (row.assigned_to || row.assignedTo) recipients[String(row.assigned_to || row.assignedTo)] = 1;
      if (row.user_id || row.userId) recipients[String(row.user_id || row.userId)] = 1;
      // Corresponsáveis também são avisados (%s) — a rota `status`
      // já fazia isso; mesma mudança de estado não pode avisar gente diferente
      // conforme o caminho que a movimentação tomou.
      try {
        var _Co = ctx.models.TicketCoAssignee;
        if (_Co) {
          var _cos = (await _Co.findMany({ ticket_id: id })) || [];
          for (var _c = 0; _c < _cos.length; _c++) {
            if (String(_cos[_c].ticket_id || _cos[_c].ticketId) === String(id)) {
              recipients[String(_cos[_c].user_id || _cos[_c].userId)] = 1;
            }
          }
        }
      } catch (e) {}
      if (actor) delete recipients[String(actor)];""" % MARCA

# ── B: quadro nos leitores ───────────────────────────────────────────────────
LISTA_VELHO = """  const rows = await model.findMany(filter);"""
LISTA_NOVO = """  // Separação de quadros (%s): sem `?quadro=`, esta leitura é do
  // quadro de Suporte — cards do Kanban Dev não entram em lista, stats nem
  // export por acidente. `?quadro=dev` lê o Dev; `?quadro=todos`, tudo.
  var _quadro = String((ctx.query && ctx.query.quadro) || "suporte");
  // `quadro` é NOSSO parâmetro, não coluna do banco: sem o delete ele entrava
  // no `filter` e `?quadro=todos` casava com nada (corrigido em produção).
  delete filter.quadro;
  const rows = (await model.findMany(filter) || []).filter(function (_t) {
    return _quadro === "todos" || String(_t.quadro || "suporte") === _quadro;
  });""" % MARCA

ROTAS_B = [
    ("GET", "/tickets"),
    ("GET", "/tickets/stats"),
    ("GET", "/tickets/dashboard"),
    ("GET", "/tickets/export"),
    ("GET", "/tickets/my-stats"),
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


def gravar(rota, codigo):
    corpo = {"method": rota["method"], "path": rota["path"], "controllerCode": codigo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    return req(f"{MOD}/routes", "PUT", corpo)


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    por = {(r["method"], r["path"]): r for r in d["routes"]}
    mudou = False

    # A
    rota = por[("POST", "/tickets/:id/move")]
    cod = rota["controllerCode"]
    if MARCA in cod:
        print("= move: corresponsáveis já avisados")
    elif cod.count(MOVE_VELHO) != 1:
        print(f"! move: âncora {cod.count(MOVE_VELHO)}x"); sys.exit(1)
    else:
        novo = cod.replace(MOVE_VELHO, MOVE_NOVO, 1)
        open("/tmp/ab_move.js", "w").write(novo)
        print(f"→ move: +corresponsáveis ({len(cod)} → {len(novo)})")
        if aplicar:
            c, r = gravar(rota, novo)
            if c >= 300: print(f"   ❌ {c} {r}"); sys.exit(1)
            mudou = True

    # B
    for metodo, caminho in ROTAS_B:
        rota = por[(metodo, caminho)]
        cod = rota["controllerCode"]
        if MARCA in cod:
            print(f"= {caminho}: já filtra quadro")
            continue
        if cod.count(LISTA_VELHO) != 1:
            print(f"! {caminho}: âncora {cod.count(LISTA_VELHO)}x"); sys.exit(1)
        novo = cod.replace(LISTA_VELHO, LISTA_NOVO, 1)
        nome = caminho.strip("/").replace("/", "_")
        open(f"/tmp/ab_{nome}.js", "w").write(novo)
        print(f"→ {caminho}: +quadro ({len(cod)} → {len(novo)})")
        if aplicar:
            c, r = gravar(rota, novo)
            if c >= 300: print(f"   ❌ {c} {r}"); sys.exit(1)
            mudou = True

    if not aplicar:
        print("\n   (simulação — use --aplicar; confira node --check /tmp/ab_*.js)")
        return
    if mudou:
        c, r = req(MOD, "PATCH", {"status": "published"})
        print(f"→ publicar: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
