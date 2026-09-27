#!/usr/bin/env python3
# =============================================================================
# Faz o servidor avisar quem recebe um chamado ou uma conversa.
#
# `POST/PATCH /tickets/:id/assign` já chamava `ctx.notify`. Faltavam os dois
# caminhos em que a pessoa recebe trabalho SEM ter pedido — que são justamente
# os que precisam de aviso:
#
#   POST /tickets/:id/escalate        escalonamento para outro atendente
#   POST /whatsapp/:id/reassign       conversa empurrada por um admin
#
# `POST /whatsapp/:id/assign` fica de fora de propósito: ali a pessoa está
# ASSUMINDO a conversa por conta própria. Notificar quem acabou de clicar é o
# tipo de ruído que faz o sino perder credibilidade.
#
# Mesma regra dos dois: nunca notifica quem executou a ação, e a falha do
# aviso nunca derruba a operação (try/catch em volta) — perder o chamado
# porque o sino falhou seria trocar um problema pequeno por um grande.
#
#   python3 scripts/notificacoes-servidor.py            # simula
#   python3 scripts/notificacoes-servidor.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/notificacoes-servidor.py"
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
APP = f"{API}/v1/apps/portal-suporte/modules"

# ── Escalonamento de chamado ─────────────────────────────────────────────────
ESCALATE_ALVO = "  return ctx.reply.send("
ESCALATE_AVISO = """  // Aviso para quem RECEBEU o chamado — %s.
  // Escalonamento empurra trabalho para alguém que não pediu; sem isto, a
  // pessoa só descobre se abrir o quadro por acaso.
  if (toUserId && String(toUserId) !== String(actor || "") && typeof ctx.notify === "function") {
    try {
      var _num = ticket.ticket_number || ticket.ticketNumber || id;
      await ctx.notify({
        userId: String(toUserId),
        title: "Chamado escalado para você",
        body: "O chamado " + _num + " \\"" + (ticket.title || "") + "\\" foi escalado para você" +
              (reason ? ": " + reason : "") + ".",
        severity: "warning",
        href: "%s/admin/tickets/view?id=" + encodeURIComponent(id),
        sourceApp: "portal-suporte",
      });
    } catch (e) {}
  }
""" % (MARCA, PORTAL)

# ── Reatribuição de conversa ─────────────────────────────────────────────────
REASSIGN_ALVO = "  return ok(ctx, { ok: true });"
REASSIGN_AVISO = """  // Aviso para o atendente que recebeu a conversa — %s.
  // Vale para reatribuição e rodízio: nos dois a conversa chega sem o
  // atendente pedir, e sem aviso ele só vê se estiver com a aba aberta.
  if (agentId && String(agentId) !== String(userId(ctx) || "") && typeof ctx.notify === "function") {
    try {
      var _quem = conv.contact_name || conv.remote_jid || "cliente";
      await ctx.notify({
        userId: String(agentId),
        title: "Conversa atribuída a você",
        body: "A conversa com " + _quem + " está com você agora.",
        severity: "info",
        href: "%s/inbox?c=" + encodeURIComponent(id),
        sourceApp: "portal-suporte",
      });
    } catch (e) {}
  }
  return ok(ctx, { ok: true });""" % (MARCA, PORTAL)

MUDANCAS = [
    ("tickets", "POST", "/tickets/:id/escalate", ESCALATE_ALVO, ESCALATE_AVISO + ESCALATE_ALVO),
    ("whatsapp", "POST", "/whatsapp/:id/reassign", REASSIGN_ALVO, REASSIGN_AVISO),
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
    publicar = set()
    for modulo, metodo, caminho, alvo, troca in MUDANCAS:
        _, d = req(f"{APP}/{modulo}/routes")
        rota = [r for r in d["routes"] if r["path"] == caminho and r["method"] == metodo]
        if not rota:
            print(f"   ! {caminho}: não existe")
            continue
        rota = rota[0]
        codigo = rota["controllerCode"]
        if MARCA in codigo:
            print(f"   = {caminho}: já avisa")
            continue
        if codigo.count(alvo) != 1:
            print(f"   ! {caminho}: âncora aparece {codigo.count(alvo)}x, revise o script")
            continue
        novo = codigo.replace(alvo, troca, 1)
        print(f"   {'→' if aplicar else ' '} {caminho}: +{len(novo) - len(codigo)} caracteres")
        if not aplicar:
            continue
        corpo = {"method": metodo, "path": caminho, "controllerCode": novo}
        for extra in ("authMode", "webhookSecretName"):
            if rota.get(extra):
                corpo[extra] = rota[extra]
        c, r = req(f"{APP}/{modulo}/routes", "PUT", corpo)
        if c >= 300:
            print(f"      ❌ HTTP {c} {r}")
            sys.exit(1)
        publicar.add(modulo)

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    for modulo in publicar:
        # Publicar promove o rascunho INTEIRO — ver scripts/kanban-enriquecer.py.
        c, r = req(f"{APP}/{modulo}", "PATCH", {"status": "published"})
        print(f"→ publicar {modulo}: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
