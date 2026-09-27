#!/usr/bin/env python3
# =============================================================================
# Fase 0 do Kanban Dev — o movimento do quadro passa a deixar rastro.
#
# ACHADO (18/08/2026): mudar o status de um chamado tem DOIS caminhos no portal,
# e só um deles registrava.
#
#   detalhe do chamado → POST /tickets/:id/status → grava ActivityLog
#                                                 → carimba resolved_at
#   arrastar no Kanban → POST /tickets/:id/move   → não grava NADA
#
# Consequências reais, hoje, no quadro que já está no ar:
#   - o histórico do chamado não mostra os movimentos feitos no quadro — que é
#     como a equipe trabalha o dia inteiro;
#   - card arrastado para Resolvido fica sem `resolved_at`, então o tempo de
#     resolução dele não existe para nenhum indicador.
#
# Este script faz a rota `move` gravar no MESMO formato da rota `status`
# (action / details.from / details.to / visible_to_client), para que as duas
# sejam lidas por um leitor só. `details.origem = "kanban_move"` diferencia a
# procedência sem exigir duas leituras.
#
# NÃO faz backfill: histórico que não foi gravado não existe, e carimbo
# retroativo inventado envenena justamente o indicador que se quer medir.
#
# Fora de escopo, de propósito (fica anotado): a rota `move` também não avisa
# os corresponsáveis, enquanto a `status` avisa. É inconsistência conhecida, de
# outra natureza, e entra na fase de notificações.
#
#   python3 scripts/kanban-move-historico.py            # simula
#   python3 scripts/kanban-move-historico.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/kanban-move-historico.py"


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

VELHO = """  try {
    const row = await model.update(id, patch);
    const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
    const fromStatus = before.status;
    const toStatus = row.status;
"""

NOVO = """  // ── Histórico da movimentação (%s) ──
  // Arrastar um card no Kanban chega AQUI; mudar o status pelo detalhe do
  // chamado chega em /tickets/:id/status. Só a segunda gravava ActivityLog —
  // então o jeito como a equipe trabalha o dia inteiro não deixava rastro, e
  // qualquer medida por etapa nascia cega. O formato abaixo é o MESMO da outra
  // rota, para as duas serem lidas por um leitor só.
  var _RESOLVIDOS = {
    resolvido: 1, resolvido_com_manual: 1, resolvido_sem_manual: 1,
    post_mortem: 1, migracao_concluida: 1, fechado: 1
  };
  var _de = before.status;
  var _para = patch.status != null ? String(patch.status) : _de;
  var _mudou = _de !== _para;
  var _ehResolvido = !!_RESOLVIDOS[_para];
  var _eraResolvido = !!_RESOLVIDOS[String(_de || "")];
  // Carimbo de resolução, pelo mesmo motivo: card ARRASTADO para Resolvido
  // ficava sem `resolved_at`, e sem ele não há tempo de resolução para medir.
  if (_mudou && _ehResolvido && !before.resolved_at && !before.resolvedAt) {
    patch.resolved_at = patch.updated_at;
  }
  if (_mudou && !_ehResolvido && _eraResolvido) {
    patch.resolved_at = null;
  }

  try {
    const row = await model.update(id, patch);
    const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
    const fromStatus = before.status;
    const toStatus = row.status;
    if (fromStatus !== toStatus) {
      // Nunca derruba a movimentação: registrar é importante, mas não a ponto
      // de o card não se mover porque o log falhou.
      try {
        var _Log = ctx.models.ActivityLog;
        if (_Log) {
          await _Log.create({
            ticket_id: id,
            user_id: actor,
            action: _ehResolvido ? "ticket_completed" : "status_changed",
            details: {
              from: fromStatus,
              to: toStatus,
              resolved_at: patch.resolved_at || null,
              completed_by: _ehResolvido ? actor : null,
              origem: "kanban_move",
            },
            created_at: patch.updated_at,
            visible_to_client: true,
          });
        }
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
        with urllib.request.urlopen(r, timeout=240) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    alvo = [r for r in d["routes"] if r["path"] == "/tickets/:id/move" and r["method"] == "POST"]
    if not alvo:
        print("! POST /tickets/:id/move não existe")
        sys.exit(1)
    rota = alvo[0]
    codigo = rota["controllerCode"]
    if MARCA in codigo:
        print("= já aplicado")
        return
    if codigo.count(VELHO) != 1:
        print(f"! âncora aparece {codigo.count(VELHO)}x — o controller mudou; revise o script")
        sys.exit(1)

    novo = codigo.replace(VELHO, NOVO, 1)
    open("/tmp/move_historico.js", "w").write(novo)
    print(f"→ move: {len(codigo)} → {len(novo)} caracteres (cópia em /tmp/move_historico.js)")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return

    corpo = {"method": "POST", "path": "/tickets/:id/move", "controllerCode": novo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    c, r = req(f"{MOD}/routes", "PUT", corpo)
    print(f"→ gravar: HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar tickets: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
