#!/usr/bin/env python3
# =============================================================================
# `GET /tickets/:id/co-assignees` passa a devolver a PESSOA, não o vínculo.
#
# Sintoma relatado no teste: o co-responsável aparece como uma bolinha vazia,
# só com o "x". A rota devolvia a linha crua da tabela de ligação —
# `{id, ticket_id, user_id, created_at}` — e a tela mostra `full_name || email`,
# que ali não existem. Nome vazio, bolinha vazia.
#
# E havia um segundo defeito escondido no mesmo lugar, pior que o primeiro: o
# `id` daquela linha é o id do VÍNCULO, mas o botão de remover chama
# `DELETE /tickets/:id/co-assignees/:userId`, que procura por `user_id`. Ou
# seja, remover co-responsável respondia 404 — nunca funcionou.
#
# Agora a rota devolve, por co-responsável:
#
#   id          o id da PESSOA (é o que a tela usa para remover e para não
#               oferecer duas vezes a mesma pessoa no seletor)
#   full_name   nome, com e-mail como reserva quando o perfil não tem nome
#   email, role
#   link_id     o id do vínculo, para quem precisar dele
#
# Uma varredura de perfis por chamado (não uma por co-responsável).
#
#   python3 scripts/corresponsavel-nome.py            # simula
#   python3 scripts/corresponsavel-nome.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/corresponsavel-nome.py"


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

VELHO = """  const filter = Object.assign({}, ctx.query || {});
  filter.ticket_id = ctx.params.id;
  const rows = await model.findMany(filter);
  return ctx.reply.send({ data: rows, count: rows.length });"""

NOVO = """  // Devolve a PESSOA, não a linha de ligação. A tela mostra
  // `full_name || email` e usa `id` para remover — com a linha crua, o nome
  // saía vazio e o remover mandava o id do vínculo para uma rota que procura
  // por `user_id`, respondendo 404. Ver %s.
  const ticketId = ctx.params.id;
  var rows = (await model.findMany({ ticket_id: ticketId })) || [];
  rows = rows.filter(function (c) {
    return String(c.ticket_id || c.ticketId) === String(ticketId);
  });

  var perfis = {};
  try {
    var P = ctx.models.Profile;
    if (P) {
      var todos = (await P.findMany({})) || [];
      for (var i = 0; i < todos.length; i++) perfis[String(todos[i].id)] = todos[i];
    }
  } catch (e) {}

  var data = rows.map(function (c) {
    var uid = String(c.user_id || c.userId || "");
    var p = perfis[uid] || {};
    return {
      id: uid,
      full_name: p.full_name || p.fullName || p.name || p.email || null,
      email: p.email || null,
      role: p.role || null,
      link_id: c.id,
      created_at: c.created_at || c.createdAt || null,
    };
  });
  return ctx.reply.send({ data: data, count: data.length });""" % MARCA


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
    rota = [r for r in d["routes"]
            if r["path"] == "/tickets/:id/co-assignees" and r["method"] == "GET"][0]
    codigo = rota["controllerCode"]
    if MARCA in codigo:
        print("= já aplicado")
        return
    if VELHO not in codigo:
        print("! o controller mudou de forma; revise o script")
        sys.exit(1)
    novo = codigo.replace(VELHO, NOVO, 1)
    print(f"→ GET /tickets/:id/co-assignees: {len(codigo)} → {len(novo)} caracteres")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return
    corpo = {"method": "GET", "path": "/tickets/:id/co-assignees", "controllerCode": novo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    c, r = req(f"{MOD}/routes", "PUT", corpo)
    print(f"→ gravar: HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
