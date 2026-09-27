#!/usr/bin/env python3
# =============================================================================
# Remove do model `User` os registros com SENHA EM TEXTO PURO.
#
# De onde vieram: `POST /admin/users` e `POST /admin/users/:id/set-password`
# eram o mesmo stub gerado na integração — `model.create(body)`. Em vez de
# criar identidade ou trocar senha (que vivem na PLATAFORMA), gravavam o corpo
# da requisição num model do app. O corpo trazia `password` em claro.
#
# Auditoria de 17/08 encontrou 2 registros: um de 10/08 (tentativa de criar
# usuário, com e-mail e papel junto) e um de 17/08 (tentativa de trocar senha,
# só a senha). Senhas reais, digitadas por gente, guardadas sem hash.
#
# Este script apaga esses registros. Não devolve nem registra o valor das
# senhas em lugar nenhum — só a contagem.
#
# ⚠️ Apagar aqui NÃO invalida a senha: ela nunca chegou à plataforma, então
# nunca foi credencial de ninguém. Quem digitou deve trocar a senha REAL, que
# é a da conta Arara.
#
#   python3 scripts/senhas-limpar-texto-puro.py            # conta, não apaga
#   python3 scripts/senhas-limpar-texto-puro.py --apagar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMINHO = "/admin/users/limpar-senhas"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/admin_users"

CONTROLLER = """
// TEMPORÁRIO — scripts/senhas-limpar-texto-puro.py
async function handler(ctx) {
  var M = ctx.models.User;
  if (!M) return ctx.reply.send({ success: true, data: { encontrados: 0, apagados: 0 } });
  var apagar = !!(ctx.body && ctx.body.apagar);
  var rows = (await M.findMany({})) || [];
  var alvos = rows.filter(function (r) { return !!(r.password || r.senha); });
  var apagados = 0;
  if (apagar) {
    for (var i = 0; i < alvos.length; i++) {
      try { await M.delete(alvos[i].id); apagados++; } catch (e) {}
    }
  }
  // Devolve só metadado. O valor da senha não sai daqui nem para o log.
  return ctx.reply.send({ success: true, data: {
    totalNoModel: rows.length,
    encontrados: alvos.length,
    apagados: apagados,
    detalhe: alvos.map(function (r) {
      return { id: r.id, temEmail: !!r.email, criado: r.created_at || r.createdAt || null };
    }),
  } });
}
module.exports = { handler };
"""

STUB = """// Desativada — limpeza pontual de 17/08 (scripts/senhas-limpar-texto-puro.py).
async function handler(ctx) {
  return ctx.reply.status(410).send({ success: false, error: "Rota desativada" });
}
module.exports = { handler };
"""


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


def gravar(codigo):
    c, d = req(f"{MOD}/routes", "PUT",
               {"method": "POST", "path": CAMINHO, "controllerCode": codigo})
    if c >= 300:
        print(f"! rota: HTTP {c} {d}")
        sys.exit(1)
    req(MOD, "PATCH", {"status": "published"})


def main():
    apagar = "--apagar" in sys.argv
    gravar(CONTROLLER)
    try:
        c, d = req(f"{API}/v1/r/portal-suporte{CAMINHO}", "POST", {"apagar": apagar})
        if c >= 300 or not isinstance(d, dict):
            print(f"! HTTP {c} {d}")
            return
        dados = d["data"]
        print(f"   registros no model User : {dados['totalNoModel']}")
        print(f"   com senha em texto puro : {dados['encontrados']}")
        for a in dados["detalhe"]:
            print(f"      {a['id']}  criado {a['criado']}  {'(tinha e-mail junto)' if a['temEmail'] else '(só a senha)'}")
        if apagar:
            print(f"\n→ apagados: {dados['apagados']}")
        else:
            print("\n   (simulação — use --apagar)")
    finally:
        gravar(STUB)
        print("   (rota de limpeza desativada)")


if __name__ == "__main__":
    main()
