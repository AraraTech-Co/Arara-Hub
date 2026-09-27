#!/usr/bin/env python3
# =============================================================================
# Escalada implícita — todo caminho para pendencia_dev cria o card Dev.
#
# ACHADO (20/08): existem DOIS jeitos de "escalar para o Dev" e só um criava o
# card. O botão "Escalar para o Dev" cria; arrastar o chamado para a coluna
# Pendência com subtipo "dev" (ou trocar o status) só marcava `pendencia_dev`
# e parava aí. Auditoria via ActivityLog + pendency_type:
#
#   TCK000043 "Reforma Tributária"  em_atendimento, type=dev, SEM card  ← ativo
#   TCK000392 / TCK000126           idem, mas já resolvido/fechado
#
# A equipe de Dev nunca viu esses chamados. Correção: a rota de status (que é
# por onde o arrasto para Pendência passa, via diálogo de subtipo) passa a
# criar o card automaticamente ao aterrissar em pendencia_dev — idempotente
# (não cria segundo card enquanto houver um aberto), com o motivo vindo da
# própria justificativa da pendência.
#
#   python3 scripts/kanban-dev-escalada-implicita.py            # simula
#   python3 scripts/kanban-dev-escalada-implicita.py --aplicar
#   python3 scripts/kanban-dev-escalada-implicita.py --orfao TCK000043
#       cria o card do órfão ATIVO citado (um a um, decisão explícita)
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "escalada_pendencia"


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

BLOCO = '''
  // ── Escalada implícita (scripts/kanban-dev-escalada-implicita.py) ──
  // Chegar em pendencia_dev por QUALQUER caminho (arrastar p/ Pendência com
  // subtipo dev, troca de status) cria o card no quadro Dev — antes só o botão
  // "Escalar para o Dev" criava, e 3 chamados escalados pelo arrasto ficaram
  // órfãos, invisíveis para a equipe de Dev (caso TCK000043).
  if (toStatus === "pendencia_dev" && String(ticket.quadro || "suporte") === "suporte") {
    try {
      var _todos = (await Ticket.findMany({})) || [];
      var _jaTem = false;
      for (var _i2 = 0; _i2 < _todos.length; _i2++) {
        if (String(_todos[_i2].origem_ticket_id || "") === String(id) &&
            ["aplicado_no_cliente", "descartado"].indexOf(String(_todos[_i2].status)) < 0) { _jaTem = true; break; }
      }
      if (!_jaTem) {
        var _max = 0, _usados = {};
        for (var _j2 = 0; _j2 < _todos.length; _j2++) {
          var _tn = String(_todos[_j2].ticket_number || "");
          _usados[_tn] = 1;
          if (_tn.indexOf("TCK") === 0) {
            var _n2 = parseInt(_tn.slice(3), 10);
            if (!isNaN(_n2) && _n2 > _max) _max = _n2;
          }
        }
        var _numero = null;
        for (var _a2 = 1; _a2 < 80; _a2++) {
          var _cand = "TCK" + String(_max + _a2).padStart(6, "0");
          if (!_usados[_cand]) { _numero = _cand; break; }
        }
        if (_numero) {
          var _motivo = String(body.pendency_reason || "").trim() || "Escalado pela pendência DEV no quadro de Suporte.";
          var _card = await Ticket.create({
            ticket_number: _numero,
            quadro: "dev",
            status: "no_status",
            origem_ticket_id: id,
            title: ticket.title || "",
            description: _motivo + "\\n\\n— Escalado do chamado " + (ticket.ticket_number || id) + ".",
            priority: ticket.priority || "medium",
            severity: ticket.severity || null,
            module: ticket.module || null,
            company_id: ticket.company_id || null,
            company_name: ticket.company_name || null,
            unit_id: ticket.unit_id || null,
            source: "escalada_suporte",
            user_id: actor || null,
            is_public: false,
            position: 0,
            created_at: now,
            updated_at: now,
          });
          try {
            if (Log) {
              await Log.create({
                ticket_id: _card.id, user_id: actor, action: "ticket_created",
                details: { ticket_number: _numero, origem: "escalada_pendencia", origem_ticket_id: id },
                created_at: now, visible_to_client: false,
              });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
'''


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


def orfao(numero):
    """Cria o card Dev de um chamado órfão específico, movendo-o de volta para
    pendencia_dev pelo caminho novo (que agora cria o card e deixa rastro)."""
    _, d = req(f"{API}/v1/r/portal-suporte/tickets")
    rows = d.get("data", d) if isinstance(d, dict) else d
    alvo = [t for t in rows if t.get("ticket_number") == numero]
    if not alvo:
        print(f"! {numero} não encontrado"); sys.exit(1)
    t = alvo[0]
    print(f"→ {numero} ({t.get('status')}): movendo para pendencia_dev pelo caminho novo")
    c, r = req(f"{API}/v1/r/portal-suporte/tickets/{t['id']}/status", "POST",
               {"status": "pendencia_dev",
                "pendency_reason": t.get("pendency_reason") or "Escalado ao Dev (regularização do órfão de 20/08)",
                "pendency_type": "dev"})
    print(f"   HTTP {c} {'' if c < 300 else r}")


def main():
    if "--orfao" in sys.argv:
        orfao(sys.argv[sys.argv.index("--orfao") + 1])
        return
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    mudou = False
    for rota in d["routes"]:
        if rota["path"] != "/tickets/:id/status":
            continue
        cod = rota["controllerCode"]
        if MARCA in cod:
            print(f"= {rota['method']}: já aplicado")
            continue
        alvo = "  var row = await Ticket.update(id, patch);"
        if cod.count(alvo) != 1:
            print(f"! {rota['method']}: âncora {cod.count(alvo)}x"); sys.exit(1)
        novo = cod.replace(alvo, alvo + BLOCO, 1)
        open(f"/tmp/status_escalada_{rota['method']}.js", "w").write(novo)
        if subprocess.run(["node", "--check", f"/tmp/status_escalada_{rota['method']}.js"]).returncode != 0:
            print("! sintaxe"); sys.exit(1)
        print(f"→ {rota['method']} /tickets/:id/status: +escalada implícita ({len(cod)} → {len(novo)})")
        if not aplicar:
            continue
        corpo = {"method": rota["method"], "path": rota["path"], "controllerCode": novo}
        for extra in ("authMode", "webhookSecretName"):
            if rota.get(extra):
                corpo[extra] = rota[extra]
        c, r = req(f"{MOD}/routes", "PUT", corpo)
        if c >= 300:
            print(f"   ❌ {c} {r}"); sys.exit(1)
        mudou = True
    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    if mudou:
        c, r = req(MOD, "PATCH", {"status": "published"})
        print(f"→ publicar: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
