#!/usr/bin/env python3
# =============================================================================
# Fecha no SERVIDOR a regra que hoje só existe na interface.
#
# O card do Kanban já separa atender de reclassificar, mas isso é trava de
# tela: as rotas de chamado não verificavam nível nenhum, então qualquer
# credencial aceita pelo app mudava prioridade, status ou apagava chamado por
# chamada direta. Trava de interface não é autorização.
#
# A regra é a mesma da tela, para não haver duas verdades:
#
#   support+    atender — criar, atribuir, escalar, comentar, apontar hora,
#               checklist, co-responsável, reordenar
#   developer+  reclassificar — prioridade, severidade, status, mover de coluna
#   admin       excluir chamado
#
# `PUT/PATCH /tickets/:id` é sensível ao CAMPO: mexer em prioridade ou
# severidade exige developer; o resto do mesmo endpoint segue em support. Um
# guarda de rota inteira aqui trancaria o atendente fora de editar o próprio
# chamado, que é o trabalho dele.
#
# Chave de serviço (sem pessoa) continua passando, como no resto do módulo —
# é como os scripts de manutenção e o enriquecimento operam.
#
#   python3 scripts/tickets-permissoes.py            # simula
#   python3 scripts/tickets-permissoes.py --aplicar  # grava e publica
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
MOD = f"{API}/v1/apps/portal-suporte/modules/" + os.environ.get("MODULO", "tickets")

# (método, caminho) → nível mínimo. `campo` marca as rotas sensíveis ao corpo.
NIVEIS = {
    ("POST",   "/tickets"): "support",
    ("PATCH",  "/tickets/:id/assign"): "support",
    ("POST",   "/tickets/:id/assign"): "support",
    ("POST",   "/tickets/:id/escalate"): "support",
    ("POST",   "/tickets/:id/messages"): "support",
    ("POST",   "/tickets/:id/co-assignees"): "support",
    ("DELETE", "/tickets/:id/co-assignees/:userId"): "support",
    ("POST",   "/tickets/:id/participants"): "support",
    ("DELETE", "/tickets/:id/participants/:participantId"): "support",
    ("POST",   "/tickets/:id/checklists"): "support",
    ("PATCH",  "/tickets/:id/checklists"): "support",
    ("PATCH",  "/tickets/:id/checklists/:checklistId"): "support",
    ("DELETE", "/tickets/:id/checklists/:checklistId"): "support",
    ("POST",   "/tickets/:id/time-entries"): "support",
    ("DELETE", "/tickets/:id/time-entries/:entryId"): "support",
    ("POST",   "/tickets/reorder"): "support",
    ("PATCH",  "/tickets/:id/archive"): "support",
    ("POST",   "/tickets/:id/post-mortem"): "developer",
    ("PATCH",  "/tickets/:id/status"): "developer",
    ("POST",   "/tickets/:id/status"): "developer",
    ("POST",   "/tickets/:id/move"): "developer",
    ("DELETE", "/tickets/:id"): "admin",
}
# Sensíveis ao campo: base support, mas prioridade/severidade exigem developer.
POR_CAMPO = {("PUT", "/tickets/:id"), ("PATCH", "/tickets/:id"), ("POST", "/tickets/bulk-action")}

MARCA = "scripts/tickets-permissoes.py"
if os.environ.get("MODULO") == "admin_companies":
    NIVEIS = {
        # Cadastrar filial, caixa e contato é trabalho de quem atende: é o
        # atendente que descobre a unidade nova no meio do chamado. Sem guarda
        # nenhuma, porém, um CLIENTE logado podia criar filial com o próprio
        # login — a rota não olhava papel.
        ("POST",   "/admin/companies/:id/units"): "support",
        ("PUT",    "/admin/companies/:id/units/:unitId"): "support",
        ("DELETE", "/admin/companies/:id/units/:unitId"): "support",
        ("POST",   "/admin/companies/:id/units/:unitId/caixas"): "support",
        ("POST",   "/admin/companies/:id/units/:unitId/caixas/bulk"): "support",
        ("PUT",    "/admin/companies/:id/units/:unitId/caixas/:caixaId"): "support",
        ("DELETE", "/admin/companies/:id/units/:unitId/caixas/:caixaId"): "support",
        ("POST",   "/admin/companies/:id/units/:unitId/whatsapps"): "support",
        ("PUT",    "/admin/companies/:id/units/:unitId/whatsapps/:whatsappId"): "support",
        ("DELETE", "/admin/companies/:id/units/:unitId/whatsapps/:whatsappId"): "support",
        ("POST",   "/admin/companies/:id/contacts"): "support",
        ("PUT",    "/admin/companies/:id/contacts/:contactId"): "support",
        ("DELETE", "/admin/companies/:id/contacts/:contactId"): "support",
        # A EMPRESA em si continua com admin: é ela que amarra o cadastro.
        ("POST",   "/admin/companies"): "admin",
        ("PATCH",  "/admin/companies/:id"): "admin",
        ("DELETE", "/admin/companies/:id"): "admin",
    }
    POR_CAMPO = set()

GUARDA = '''
// ── Controle de acesso (injetado por scripts/tickets-permissoes.py) ──────────
// A regra é a MESMA da interface, para não haver duas verdades: atender vale a
// partir de `support`; reclassificar (prioridade, severidade, status) exige
// `developer`. Sem isto, a trava do card era só de tela — qualquer credencial
// aceita mudava prioridade por chamada direta.
//
// Chave de serviço (sem pessoa) passa, como no resto do módulo: é assim que os
// scripts de manutenção e o enriquecimento do quadro operam.
var _RANK = { user: 10, support: 20, developer: 30, admin: 40 };
var _APELIDOS = { master: "admin", gerente: "admin", member: "support", agent: "support", vendedor: "user" };
function _canonico(cru) {
  var v = String(cru || "").trim().toLowerCase();
  return _RANK[v] !== undefined ? v : (_APELIDOS[v] || "");
}
var _handlerOriginal = handler;
async function _comControleDeAcesso(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || null;
  if (quem && ctx.models && ctx.models.Profile) {
    var minimo = "%(minimo)s";
%(porCampo)s
    var perfil = await ctx.models.Profile.findById(quem);
    if ((_RANK[_canonico(perfil ? perfil.role : "")] || 0) < _RANK[minimo]) {
      return ctx.reply.status(403).send({ success: false, error: "Sem permissão para esta operação" });
    }
  }
  return _handlerOriginal(ctx);
}
module.exports = { handler: _comControleDeAcesso };
'''

POR_CAMPO_JS = '''    // Sensível ao CAMPO: só sobe a exigência quando o corpo mexe em
    // classificação. Trancar a rota inteira em `developer` deixaria o
    // atendente sem editar o próprio chamado.
    var _b = ctx.body || {};
    var _acao = String(_b.action || _b.type || "");
    if (_b.priority !== undefined || _b.severity !== undefined ||
        _acao === "set_priority" || _acao === "set_status") {
      minimo = "developer";
    }
'''


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
        return e.code, e.read().decode("utf-8", "replace")[:200]


def main():
    aplicar = "--aplicar" in sys.argv
    _, dados = req(f"{MOD}/routes")
    rotas = {(r["method"], r["path"]): r for r in dados["routes"]}

    alvos = list(NIVEIS.items()) + [(k, "support") for k in POR_CAMPO]
    mudadas = 0
    for chave, minimo in alvos:
        r = rotas.get(chave)
        if not r:
            print(f"   — {chave[0]:6} {chave[1]}: não existe, pulando")
            continue
        codigo = r["controllerCode"] or ""
        if MARCA in codigo:
            print(f"   = {chave[0]:6} {chave[1]}: já tem guarda")
            continue
        alvo = "module.exports = { handler };"
        if alvo not in codigo:
            print(f"   ! {chave[0]:6} {chave[1]}: assinatura inesperada, pulando")
            continue

        guarda = GUARDA % {
            "minimo": minimo,
            "porCampo": POR_CAMPO_JS if chave in POR_CAMPO else "",
        }
        novo = codigo.replace(alvo, guarda)
        etiqueta = f"{minimo}+ (por campo)" if chave in POR_CAMPO else f"{minimo}+"
        print(f"   {'→' if aplicar else ' '} {chave[0]:6} {chave[1]:42} {etiqueta}")
        if not aplicar:
            continue

        corpo = {"method": chave[0], "path": chave[1], "controllerCode": novo}
        for extra in ("authMode", "webhookSecretName"):
            if r.get(extra):
                corpo[extra] = r[extra]
        c, resp = req(f"{MOD}/routes", "PUT", corpo)
        if c >= 300:
            print(f"      ❌ HTTP {c} {resp}")
            sys.exit(1)
        mudadas += 1

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    if mudadas:
        # Publicar promove o rascunho INTEIRO — ver kanban-enriquecer.py.
        c, resp = req(MOD, "PATCH", {"status": "published"})
        print(f"→ publicar tickets: HTTP {c} {'' if c < 300 else resp}")


if __name__ == "__main__":
    main()
