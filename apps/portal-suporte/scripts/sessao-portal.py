#!/usr/bin/env python3
# =============================================================================
# Sessão do portal — etapas 1 e 2 do plano
# (docs/plans/plano-sessao-persistente-portal.md).
#
# POR QUE: o JWT da plataforma expira e não há rota de renovação (404 em
# /v1/auth/refresh, /token/refresh, /session). Quando ele morre, o cliente cai
# na chave de app — e a chave NÃO carrega pessoa: `ctx.user` vem
# `{type:"apiKey"}`, sem `id`. Como as guardas fazem `if (quem && …)`, a
# checagem inteira é PULADA. Hoje, JWT vencido = acesso de serviço.
#
# O QUE FAZ:
#
#   1) Model `Sessao` e três rotas no módulo `auth`:
#        POST /auth/sessao/criar    (exige JWT — é o que prova quem é)
#        POST /auth/sessao/validar  (renova por uso; devolve a pessoa)
#        POST /auth/sessao/encerrar (revoga)
#
#   2) Nas rotas que têm guarda de identidade, `quem` passa a considerar a
#      sessão do cabeçalho `x-portal-sessao`. O navegador volta a ter pessoa
#      mesmo com o JWT vencido — e as guardas voltam a valer.
#
# TOKEN: gerado no NAVEGADOR (crypto.getRandomValues, 256 bits). O sandbox não
# tem `crypto` nem `require` (sondado em 19/08), então gerar ou hashear aqui
# seria fraco. Ele chega partido: `sid.verificador` — o `sid` vira o id do
# registro (busca O(1), sem varrer tabela) e o verificador é a metade secreta.
# Vazar ids não basta para entrar.
#
#   python3 scripts/sessao-portal.py            # simula
#   python3 scripts/sessao-portal.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/sessao-portal.py"
DIAS = 30


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

# ── Model ────────────────────────────────────────────────────────────────────
SESSAO = {
    "name": "portal-suporte-Sessao",
    "alias": "Sessao",
    "schema": {
        "type": "object",
        "properties": {
            # id = "ses_" + sid (metade pública do token)
            "id": {"type": "string"},
            "verificador": {"type": "string"},
            "user_id": {"type": "string"},
            "criada_em": {"type": "string"},
            "ultimo_uso": {"type": "string"},
            "expira_em": {"type": "string"},
            "revogada": {"type": "boolean"},
            "agente": {"type": "string"},
        },
    },
}

# ── Resolvedor compartilhado (entra nas guardas e nas rotas de sessão) ───────
RESOLVEDOR = """
// ── Identidade por sessão do portal (%s) ──
// O JWT da plataforma expira e não há renovação; quando isso acontece o
// cliente usa a chave de app, que NÃO carrega pessoa. Sem isto, a guarda
// abaixo seria pulada e um JWT vencido viraria acesso de serviço.
async function _sessaoDoPortal(ctx) {
  try {
    var h = (ctx.headers && (ctx.headers["x-portal-sessao"] || ctx.headers["X-Portal-Sessao"])) || "";
    var partes = String(h).split(".");
    if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
    var S = ctx.models.Sessao;
    if (!S) return null;
    var linha = await S.findById("ses_" + partes[0]);
    if (!linha || linha.revogada === true) return null;
    if (String(linha.verificador || "") !== partes[1]) return null;
    if (linha.expira_em && new Date(linha.expira_em).getTime() < Date.now()) return null;
    return linha.user_id || null;
  } catch (e) { return null; }
}
""" % MARCA

# ── Rotas de sessão ──────────────────────────────────────────────────────────
CRIAR = ("""// %s — POST /auth/sessao/criar
// Só cria sessão quem JÁ provou identidade: exige JWT (ctx.user.id). Chave de
// app não serve aqui — seria criar identidade a partir de quem não tem.
""" % MARCA) + """
async function handler(ctx) {
  var S = ctx.models.Sessao;
  if (!S) return ctx.reply.status(500).send({ error: "Model Sessao missing" });
  var u = ctx.user || {};
  var quem = u.id || u.userId || null;
  if (!quem) {
    return ctx.reply.status(401).send({ error: "Criar sessão exige login (JWT)" });
  }
  var body = ctx.body || {};
  var sid = String(body.sid || "").trim();
  var verificador = String(body.verificador || "").trim();
  // 16 e 48 hex: o token nasce de 256 bits no navegador.
  if (!/^[a-f0-9]{16}$/.test(sid) || !/^[a-f0-9]{48}$/.test(verificador)) {
    return ctx.reply.status(400).send({ error: "Token de sessão inválido" });
  }
  var agora = Date.now();
  var expira = new Date(agora + %d * 24 * 60 * 60 * 1000).toISOString();
  await S.create({
    id: "ses_" + sid,
    verificador: verificador,
    user_id: String(quem),
    criada_em: new Date(agora).toISOString(),
    ultimo_uso: new Date(agora).toISOString(),
    expira_em: expira,
    revogada: false,
    agente: String(body.agente || "").slice(0, 120),
  });
  return ctx.reply.status(201).send({ success: true, data: { expira_em: expira } });
}
module.exports = { handler };
""" % DIAS

VALIDAR = ("""// %s — POST /auth/sessao/validar
// Chamada na abertura do portal. Renova por uso (rolling), mas grava no máximo
// uma vez por hora — validar não pode virar uma escrita por navegação.
""" % MARCA) + RESOLVEDOR + """
async function handler(ctx) {
  var S = ctx.models.Sessao;
  var P = ctx.models.Profile;
  if (!S) return ctx.reply.status(500).send({ error: "Model Sessao missing" });

  var body = ctx.body || {};
  var h = (ctx.headers && (ctx.headers["x-portal-sessao"] || ctx.headers["X-Portal-Sessao"])) || body.token || "";
  var partes = String(h).split(".");
  if (partes.length !== 2) return ctx.reply.status(401).send({ error: "Sessão ausente" });
  var linha = await S.findById("ses_" + partes[0]).catch(function () { return null; });
  if (!linha || linha.revogada === true || String(linha.verificador || "") !== partes[1]) {
    return ctx.reply.status(401).send({ error: "Sessão inválida" });
  }
  var agora = Date.now();
  if (linha.expira_em && new Date(linha.expira_em).getTime() < agora) {
    return ctx.reply.status(401).send({ error: "Sessão expirada" });
  }

  var expira = linha.expira_em;
  var ultimo = linha.ultimo_uso ? new Date(linha.ultimo_uso).getTime() : 0;
  if (agora - ultimo > 60 * 60 * 1000) {
    expira = new Date(agora + %d * 24 * 60 * 60 * 1000).toISOString();
    try {
      await S.update(linha.id, { ultimo_uso: new Date(agora).toISOString(), expira_em: expira });
    } catch (e) {}
  }

  // Devolve o perfil junto: sem isto o portal precisaria de outra viagem só
  // para saber o nível de quem entrou.
  var perfil = null;
  try {
    if (P) {
      var p = await P.findById(String(linha.user_id));
      if (p) {
        perfil = {
          id: p.id, full_name: p.full_name || null, email: p.email || null,
          role: p.role || null,
          feature_grants: p.feature_grants || p.featureGrants || [],
        };
      }
    }
  } catch (e) {}

  return ctx.reply.send({
    success: true,
    data: { user_id: linha.user_id, expira_em: expira, perfil: perfil },
  });
}
module.exports = { handler };
""" % DIAS

ENCERRAR = ("""// %s — POST /auth/sessao/encerrar
// Logout de verdade: a sessão morre no SERVIDOR, não só no navegador.
""" % MARCA) + """
async function handler(ctx) {
  var S = ctx.models.Sessao;
  if (!S) return ctx.reply.status(500).send({ error: "Model Sessao missing" });
  var body = ctx.body || {};
  var h = (ctx.headers && (ctx.headers["x-portal-sessao"] || ctx.headers["X-Portal-Sessao"])) || body.token || "";
  var partes = String(h).split(".");
  if (partes.length !== 2) return ctx.reply.send({ success: true });
  try {
    var linha = await S.findById("ses_" + partes[0]);
    if (linha && String(linha.verificador || "") === partes[1]) {
      await S.update(linha.id, { revogada: true });
    }
  } catch (e) {}
  return ctx.reply.send({ success: true });
}
module.exports = { handler };
"""

ROTAS = [
    ("POST", "/auth/sessao/criar", CRIAR),
    ("POST", "/auth/sessao/validar", VALIDAR),
    ("POST", "/auth/sessao/encerrar", ENCERRAR),
]

# ── Guarda: `quem` passa a olhar a sessão ────────────────────────────────────
PADROES = [
    ("var quem = u.id || u.userId || null;",
     "var quem = u.id || u.userId || (await _sessaoDoPortal(ctx));"),
    ("var _quem = _u.id || _u.userId || null;",
     "var _quem = _u.id || _u.userId || (await _sessaoDoPortal(ctx));"),
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
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    aplicar = "--aplicar" in sys.argv

    # 1. Model
    _, d = req(f"{APP}/models")
    if any(m["name"] == SESSAO["name"] for m in d["models"]):
        print("= Sessao: model já existe")
    else:
        print("→ Sessao: criar model")
        if aplicar:
            c, r = req(f"{APP}/models", "POST", SESSAO)
            print(f"   HTTP {c} {'' if c < 300 else r}")
            if c >= 300:
                sys.exit(1)

    # 2. Rotas de sessão
    for metodo, caminho, codigo in ROTAS:
        nome = caminho.strip("/").replace("/", "_")
        open(f"/tmp/ses_{nome}.js", "w").write(codigo)
        print(f"→ {metodo} {caminho}: {len(codigo)} chars (/tmp/ses_{nome}.js)")
        if aplicar:
            c, r = req(f"{APP}/modules/auth/routes", "PUT",
                       {"method": metodo, "path": caminho, "controllerCode": codigo})
            if c >= 300:
                print(f"   ❌ {c} {r}")
                sys.exit(1)

    # 3. Guardas de todos os módulos
    _, d = req(f"{APP}/modules")
    modulos = [m["name"] for m in (d.get("modules") or d)]
    tocados = {}
    for modulo in modulos:
        c, dm = req(f"{APP}/modules/{modulo}/routes")
        if c >= 300:
            continue
        for rota in dm["routes"]:
            cod = rota["controllerCode"]
            if MARCA in cod:
                continue
            alvo = next((p for p in PADROES if p[0] in cod), None)
            if not alvo:
                continue
            novo = cod.replace(alvo[0], alvo[1])
            # O resolvedor entra ANTES do primeiro uso — no topo do arquivo,
            # que é onde o escopo de função alcança tudo.
            novo = RESOLVEDOR + "\n" + novo
            tocados.setdefault(modulo, []).append((rota, novo))

    total = sum(len(v) for v in tocados.values())
    print(f"→ guardas a atualizar: {total} rotas em {len(tocados)} módulos")
    for modulo, itens in sorted(tocados.items()):
        print(f"   {modulo}: {len(itens)}")
        if not aplicar:
            continue
        for rota, novo in itens:
            corpo = {"method": rota["method"], "path": rota["path"], "controllerCode": novo}
            for extra in ("authMode", "webhookSecretName"):
                if rota.get(extra):
                    corpo[extra] = rota[extra]
            c, r = req(f"{APP}/modules/{modulo}/routes", "PUT", corpo)
            if c >= 300:
                print(f"      ❌ {rota['method']} {rota['path']}: {c} {r}")
                sys.exit(1)

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return

    for modulo in set(list(tocados.keys()) + ["auth"]):
        c, r = req(f"{APP}/modules/{modulo}", "PATCH", {"status": "published"})
        print(f"→ publicar {modulo}: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
