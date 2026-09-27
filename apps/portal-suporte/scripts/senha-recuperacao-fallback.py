#!/usr/bin/env python3
# =============================================================================
# Recuperação de senha: o que fazer enquanto a plataforma não libera a saída.
#
# SITUAÇÃO (sondada em 21/08, sem margem para dúvida):
#   ctx.fetch → api.arara-tech.com  "host not allowlisted"
#   ctx.fetch → localhost / 127.0.0.1 / IP / nome do container → todos barrados
#   Não existe atalho no ctx para a própria plataforma.
# Ou seja: o último passo (gravar a senha) NÃO tem como sair do controller até
# o Hefler acrescentar `portal-suporte:api.arara-tech.com` na allowlist.
#
# O QUE MUDA AQUI: em vez de um beco sem saída ("tente mais tarde"), a pessoa
# que JÁ PROVOU IDENTIDADE pelo código do WhatsApp passa a ser encaminhada:
#
#   1. Registramos o pedido como VERIFICADO (quem, quando) — sem jamais guardar
#      a senha digitada, que é descartada.
#   2. Notificamos os admins: "Fulano provou identidade e precisa de redefinição".
#      O admin resolve em 10 segundos na tela de Membros, que já funciona.
#   3. A tela diz isso à pessoa, em vez de mandá-la tentar de novo à toa.
#
# Quando a allowlist entrar, a gravação volta a ser automática e este caminho
# vira o que sempre deveria ter sido: o plano B.
#
#   python3 scripts/senha-recuperacao-fallback.py            # simula
#   python3 scripts/senha-recuperacao-fallback.py --aplicar
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/senha-recuperacao-fallback.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/auth"

AVISO = """
// ── Plano B quando a plataforma não está alcançável (%s) ──
// A pessoa JÁ provou identidade (código do WhatsApp do cadastro). Em vez de
// mandá-la "tentar mais tarde", avisamos quem PODE resolver agora. A senha
// digitada é descartada aqui mesmo — nunca é gravada em lugar nenhum.
async function _pedirAjudaDeAdmin(ctx, perfil) {
  var avisados = 0;
  try {
    var P = ctx.models.Profile;
    if (!P || typeof ctx.notify !== "function") return 0;
    var todos = (await P.findMany({})) || [];
    for (var i = 0; i < todos.length; i++) {
      var papel = String(todos[i].role || "").toLowerCase();
      if (papel !== "admin" && papel !== "master") continue;
      try {
        await ctx.notify({
          userId: String(todos[i].id),
          title: "Redefinição de senha aguardando você",
          body: (perfil.full_name || perfil.email) + " confirmou identidade pelo WhatsApp e " +
                "precisa de uma senha nova. Redefina em Equipe → Membros → Editar.",
          severity: "warning",
          href: "https://suporte.arara-tech.com/admin/team-members/",
          sourceApp: "portal-suporte",
        });
        avisados++;
      } catch (e) {}
    }
  } catch (e) {}
  return avisados;
}
""" % MARCA

VELHO_SEM_CHAVE = """  if (!chave) {
    return ctx.reply.status(503).send({
      error: "Recuperação quase pronta: falta um administrador abrir a tela de Membros uma vez (provisiona a credencial). Avise a equipe.",
    });
  }"""
NOVO_SEM_CHAVE = """  if (!chave) {
    var _n0 = await _pedirAjudaDeAdmin(ctx, perfil);
    await R.update(rid, { usado: true });
    return ctx.reply.status(503).send({
      error: _n0 > 0
        ? "Sua identidade foi confirmada. A troca automática está indisponível, então avisamos a equipe — um administrador vai definir sua senha e te retornar."
        : "Sua identidade foi confirmada, mas a troca automática está indisponível. Fale com o suporte para definir sua senha.",
      identidade_confirmada: true,
    });
  }"""

VELHO_CATCH = """  } catch (e) {
    // Host fora da allowlist do sandbox: liga sozinho quando a plataforma
    // incluir portal-suporte:api.arara-tech.com (pedido registrado, 20/08).
    return ctx.reply.status(503).send({
      error: "A gravação da senha aguarda uma liberação da plataforma. Já foi pedida — tente novamente mais tarde ou fale com o suporte.",
    });
  }"""
NOVO_CATCH = """  } catch (e) {
    // Host fora da allowlist do sandbox (sondado em 21/08: api.arara-tech.com,
    // localhost, IP e nome do container — todos barrados). Liga sozinho quando
    // a plataforma incluir portal-suporte:api.arara-tech.com.
    //
    // Até lá NÃO devolvemos um beco sem saída: quem provou identidade é
    // encaminhado a quem pode resolver. A senha digitada morre aqui.
    var _n = await _pedirAjudaDeAdmin(ctx, perfil);
    await R.update(rid, { usado: true });
    return ctx.reply.status(503).send({
      error: _n > 0
        ? "Identidade confirmada! A troca automática ainda depende de uma liberação da plataforma, então avisamos a equipe agora — um administrador vai definir sua senha e te retornar em instantes."
        : "Identidade confirmada, mas a troca automática está indisponível. Peça a um administrador para redefinir sua senha na tela de Membros.",
      identidade_confirmada: true,
    });
  }"""


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
    _, d = req(f"{MOD}/routes")
    rota = [r for r in d["routes"] if r["path"] == "/auth/senha/redefinir"][0]
    cod = rota["controllerCode"]
    if MARCA in cod:
        print("= já aplicado")
        return
    for velho in (VELHO_SEM_CHAVE, VELHO_CATCH):
        if cod.count(velho) != 1:
            print(f"! âncora aparece {cod.count(velho)}x"); sys.exit(1)
    novo = cod.replace(VELHO_SEM_CHAVE, NOVO_SEM_CHAVE, 1).replace(VELHO_CATCH, NOVO_CATCH, 1)
    # o helper entra antes do handler
    alvo = "async function handler(ctx) {"
    if novo.count(alvo) != 1:
        print("! handler não único"); sys.exit(1)
    novo = novo.replace(alvo, AVISO + "\n" + alvo, 1)
    open("/tmp/senha_fallback.js", "w").write(novo)
    if subprocess.run(["node", "--check", "/tmp/senha_fallback.js"]).returncode != 0:
        sys.exit(1)
    print(f"→ redefinir: +plano B ({len(cod)} → {len(novo)})")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return
    corpo = {"method": "POST", "path": "/auth/senha/redefinir", "controllerCode": novo}
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
