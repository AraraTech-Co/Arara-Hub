#!/usr/bin/env python3
# =============================================================================
# `POST /tickets/bulk-action` CRIAVA chamado em vez de aplicar a ação.
#
# O controller era um stub gerado na integração:
#
#     const body = Object.assign({}, ctx.body || {});
#     const row = await model.create(body);      // ← cria um chamado NOVO
#
# A tela manda `{ ids, action, ...extra }`. Ou seja: cada ação em lote no quadro
# criava um chamado cujos campos eram `ids` (um array) e `action` (um texto) —
# sem título e sem status. Sem título o card aparece EM BRANCO; sem status o
# quadro o joga em Backlog, porque é lá que ele agrupa tudo que não tem status.
#
# Foi isso que encheu o Backlog de cards vazios: 8 → 30 sem ninguém abrir
# chamado. E a mensagem "N tickets atualizados" aparecia normalmente, porque a
# tela conta o que ENVIOU, não o que o servidor fez. Falha silenciosa clássica.
#
# As três ações que a tela usa (kanban-board.tsx):
#   archive        → is_archived + archived_at
#   assign         → assigned_to (vazio desatribui)
#   set_priority   → priority
#
# Ação desconhecida agora dá 400 em vez de criar coisa: é melhor recusar do que
# inventar. E a resposta conta quantos foram REALMENTE atualizados.
#
#   python3 scripts/bulk-action-conserto.py            # simula
#   python3 scripts/bulk-action-conserto.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/bulk-action-conserto.py"


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

DE = '''async function handler(ctx) {
  const model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const body = Object.assign({}, ctx.body || {});
  
  const row = await model.create(body);
  return ctx.reply.status(201).send(row);
}'''

PARA = '''async function handler(ctx) {
  // ── %s ──
  // Era um stub que fazia `model.create(body)`: a tela manda
  // `{ ids, action, ...extra }` e o servidor criava um CHAMADO com esses
  // campos. Sem título o card nasce em branco; sem status o quadro o joga em
  // Backlog. Foi o que encheu o Backlog de cards vazios.
  const model = ctx.models.Ticket;
  if (!model) return ctx.reply.status(500).send({ error: "Model Ticket missing" });

  const body = ctx.body || {};
  const ids = body.ids || body.ticketIds || [];
  const action = String(body.action || "");
  if (!Array.isArray(ids) || ids.length === 0) {
    return ctx.reply.status(400).send({ error: "ids obrigatório" });
  }

  const agora = new Date().toISOString();
  let patch = null;
  if (action === "archive") {
    patch = { is_archived: true, archived_at: agora };
  } else if (action === "assign") {
    // Vazio DESATRIBUI — é como a tela oferece ("__unassign__").
    patch = { assigned_to: body.assignTo || null };
  } else if (action === "set_priority") {
    if (!body.priority) return ctx.reply.status(400).send({ error: "priority obrigatório" });
    patch = { priority: String(body.priority) };
  } else {
    // Recusar é melhor que inventar: era exatamente o "inventar" que criava
    // chamado a partir de um payload que não era chamado.
    return ctx.reply.status(400).send({ error: "Ação não suportada: " + (action || "(vazia)") });
  }
  patch.updated_at = agora;

  let atualizados = 0;
  const falhas = [];
  for (let i = 0; i < ids.length; i++) {
    try {
      await model.update(String(ids[i]), patch);
      atualizados++;
    } catch (e) {
      falhas.push(String(ids[i]));
    }
  }
  // A tela mostra "N tickets atualizados" a partir daqui. Antes ela contava o
  // que TINHA ENVIADO e dizia sucesso mesmo quando nada acontecia.
  return ctx.reply.send({ ok: true, updated: atualizados, failed: falhas.length });
}''' % MARCA


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
    aplicar = "--aplicar" in sys.argv
    c, d = req(f"{MOD}/routes")
    if c >= 300:
        print(f"❌ HTTP {c} {d}")
        sys.exit(1)
    r = next((x for x in d["routes"] if x["path"] == "/tickets/bulk-action"), None)
    if not r:
        print("❌ rota não existe")
        sys.exit(1)
    codigo = r["controllerCode"] or ""
    if MARCA in codigo:
        print("   = já corrigida")
        return
    if DE not in codigo:
        print("   ! stub não encontrado — o controller mudou; conferir à mão")
        sys.exit(1)

    novo = codigo.replace(DE, PARA)
    print(f"   {'→' if aplicar else ' '} POST /tickets/bulk-action: aplicar a ação em vez de criar chamado")
    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    corpo = {"method": r["method"], "path": r["path"], "controllerCode": novo}
    for extra in ("authMode", "webhookSecretName"):
        if r.get(extra):
            corpo[extra] = r[extra]
    cc, resp = req(f"{MOD}/routes", "PUT", corpo)
    if cc >= 300:
        print(f"      ❌ HTTP {cc} {resp}")
        sys.exit(1)
    cc, resp = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar tickets: HTTP {cc} {'' if cc < 300 else resp}")


if __name__ == "__main__":
    main()
