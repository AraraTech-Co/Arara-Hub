#!/usr/bin/env python3
# =============================================================================
# "Esqueci a senha" por WhatsApp — o fluxo completo (20/08/2026).
#
# DESENHO (decisões de 17/08 + entrega do Hefler de 20/08):
#   - O código vai para o WhatsApp DO CADASTRO (Profile.phone, conferido por
#     código na criação) — nunca para um número digitado na hora. É o que
#     separa recuperação de sequestro de conta.
#   - Quem grava a senha é a plataforma (POST /v1/users/:id/password, bcrypt).
#     Profile.id === users.id (identidade canônica).
#   - A resposta de "solicitar" é SEMPRE genérica: não confirmamos se um
#     e-mail existe (anti-enumeração).
#
# LIMITES ASSUMIDOS, com nome:
#   - O código de 6 dígitos usa Math.random: o sandbox NÃO tem crypto (sondado
#     em 19/08). A proteção real é o desenho: expira em 10 min, 5 tentativas
#     por código, 3 envios/hora por pessoa, e o canal é o WhatsApp já conferido.
#   - A chamada final ao /v1/users/:id/password depende de
#     `portal-suporte:api.arara-tech.com` na SANDBOX_FETCH_ALLOWLIST_BY_APP
#     (pedido ao Hefler). Até lá, a rota responde 503 com mensagem honesta.
#     Quando a linha entrar, o fluxo liga SOZINHO — sem novo deploy.
#   - A chave que autoriza na plataforma vem do cofre (`portal_api_key`,
#     serverOnly). Só JWT grava segredo, então o FRONT auto-provisiona quando
#     um admin logado abre a tela de Membros.
#
# ROTAS (módulo auth):
#   POST /auth/senha/solicitar  { email }                    → sempre 200 genérico
#   POST /auth/senha/redefinir  { email, codigo, senha }     → grava na plataforma
#
#   python3 scripts/senha-recuperacao-whatsapp.py            # simula
#   python3 scripts/senha-recuperacao-whatsapp.py --aplicar
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/senha-recuperacao-whatsapp.py"


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

RESET = {
    "name": "portal-suporte-SenhaReset",
    "alias": "SenhaReset",
    "schema": {
        "type": "object",
        "properties": {
            # id = "psr_" + profile_id: um pedido ativo por pessoa (o novo
            # sobrescreve o velho — não acumula códigos válidos).
            "id": {"type": "string"},
            "codigo": {"type": "string"},
            "expira_em": {"type": "string"},
            "tentativas": {"type": "number"},
            "usado": {"type": "boolean"},
            "criado_em": {"type": "string"},
            "envios": {"type": "array"},
        },
    },
}

COMUM = """
var AVISA_BASE = "https://www.avisaapi.com.br/api";
function _agora() { return new Date().toISOString(); }
function _limpaEmail(e) { return String(e || "").trim().toLowerCase(); }
async function _perfilPorEmail(ctx, email) {
  var P = ctx.models.Profile;
  if (!P) return null;
  var todos = (await P.findMany({})) || [];
  for (var i = 0; i < todos.length; i++) {
    if (_limpaEmail(todos[i].email) === email) return todos[i];
  }
  return null;
}
"""

SOLICITAR = ("""// %s — POST /auth/senha/solicitar
// Resposta SEMPRE genérica: quem pede não descobre se o e-mail existe.
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var R = ctx.models.SenhaReset;
  var generica = { success: true, data: {
    mensagem: "Se este e-mail tiver cadastro com WhatsApp, o código foi enviado." } };
  if (!R) return ctx.reply.send(generica);

  var email = _limpaEmail((ctx.body || {}).email);
  if (!email) return ctx.reply.send(generica);
  var perfil = await _perfilPorEmail(ctx, email);
  var fone = perfil ? String(perfil.phone || "").replace(/\\D/g, "") : "";
  if (!perfil || fone.length < 10) return ctx.reply.send(generica);

  var agora = Date.now();
  var rid = "psr_" + String(perfil.id);
  var atual = await R.findById(rid).catch(function () { return null; });

  // Teto de envio: 3 por hora por pessoa. O provedor cobra por mensagem e um
  // laço de spam no "esqueci a senha" viraria conta de telefone.
  var envios = (atual && Array.isArray(atual.envios)) ? atual.envios.filter(function (t) {
    return agora - new Date(t).getTime() < 60 * 60 * 1000;
  }) : [];
  if (envios.length >= 3) return ctx.reply.send(generica);

  // 6 dígitos. Math.random porque o sandbox não tem crypto (sondado); a
  // proteção é expiração (10 min) + 5 tentativas + canal já conferido.
  var codigo = String(Math.floor(100000 + Math.random() * 900000));
  var linha = {
    codigo: codigo,
    expira_em: new Date(agora + 10 * 60 * 1000).toISOString(),
    tentativas: 0,
    usado: false,
    criado_em: _agora(),
    envios: envios.concat([_agora()]),
  };
  if (atual) await R.update(rid, linha);
  else await R.create(Object.assign({ id: rid }, linha));

  // Envio pela Avisa — mesmo caminho do atendimento.
  try {
    var token = await ctx.secrets.get("whatsapp_token");
    if (token && ctx.fetch) {
      await ctx.fetch(AVISA_BASE + "/actions/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          number: fone,
          message: "Portal Arara Tech — seu código para redefinir a senha: " + codigo +
            "\\n\\nVale por 10 minutos. Se não foi você, ignore esta mensagem.",
        }),
      });
    }
  } catch (e) {}
  return ctx.reply.send(generica);
}
module.exports = { handler };
"""

REDEFINIR = ("""// %s — POST /auth/senha/redefinir
// Valida o código e grava a senha NA PLATAFORMA (bcrypt lá; nada fica aqui).
""" % MARCA) + COMUM + """
async function handler(ctx) {
  var R = ctx.models.SenhaReset;
  if (!R) return ctx.reply.status(500).send({ error: "Model SenhaReset missing" });
  var body = ctx.body || {};
  var email = _limpaEmail(body.email);
  var codigo = String(body.codigo || "").replace(/\\D/g, "");
  var senha = String(body.senha || "");
  if (!email || codigo.length !== 6) {
    return ctx.reply.status(400).send({ error: "Informe e-mail e o código de 6 dígitos" });
  }
  if (senha.length < 8) {
    return ctx.reply.status(400).send({ error: "A senha precisa ter pelo menos 8 caracteres" });
  }
  var perfil = await _perfilPorEmail(ctx, email);
  var rid = perfil ? "psr_" + String(perfil.id) : "psr_inexistente";
  var linha = await R.findById(rid).catch(function () { return null; });
  var invalido = { error: "Código inválido ou expirado. Peça um novo." };
  if (!perfil || !linha || linha.usado === true) return ctx.reply.status(400).send(invalido);
  if (new Date(linha.expira_em).getTime() < Date.now()) return ctx.reply.status(400).send(invalido);
  if (Number(linha.tentativas || 0) >= 5) return ctx.reply.status(400).send(invalido);
  if (String(linha.codigo) !== codigo) {
    try { await R.update(rid, { tentativas: Number(linha.tentativas || 0) + 1 }); } catch (e) {}
    return ctx.reply.status(400).send(invalido);
  }

  // Código certo. A senha é gravada NA PLATAFORMA — Profile.id === users.id.
  var chave = null;
  try { chave = await ctx.secrets.get("portal_api_key"); } catch (e) {}
  if (!chave) {
    return ctx.reply.status(503).send({
      error: "Recuperação quase pronta: falta um administrador abrir a tela de Membros uma vez (provisiona a credencial). Avise a equipe.",
    });
  }
  var r;
  try {
    r = await ctx.fetch("https://api.arara-tech.com/v1/users/" + perfil.id + "/password", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": chave },
      body: JSON.stringify({ password: senha }),
    });
  } catch (e) {
    // Host fora da allowlist do sandbox: liga sozinho quando a plataforma
    // incluir portal-suporte:api.arara-tech.com (pedido registrado, 20/08).
    return ctx.reply.status(503).send({
      error: "A gravação da senha aguarda uma liberação da plataforma. Já foi pedida — tente novamente mais tarde ou fale com o suporte.",
    });
  }
  if (!r || r.status >= 300) {
    return ctx.reply.status(502).send({ error: "A plataforma recusou a troca (HTTP " + (r ? r.status : "?") + "). Fale com o suporte." });
  }
  await R.update(rid, { usado: true });
  return ctx.reply.send({ success: true, data: { mensagem: "Senha redefinida. Entre com a nova senha." } });
}
module.exports = { handler };
"""

ROTAS = [
    ("POST", "/auth/senha/solicitar", SOLICITAR),
    ("POST", "/auth/senha/redefinir", REDEFINIR),
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
    _, d = req(f"{APP}/models")
    if any(m["name"] == RESET["name"] for m in d["models"]):
        print("= SenhaReset: model já existe")
    else:
        print("→ SenhaReset: criar model")
        if aplicar:
            c, r = req(f"{APP}/models", "POST", RESET)
            if c >= 300:
                print(f"   ❌ {c} {r}"); sys.exit(1)
    for metodo, caminho, codigo in ROTAS:
        nome = caminho.strip("/").replace("/", "_")
        open(f"/tmp/psr_{nome}.js", "w").write(codigo)
        if subprocess.run(["node", "--check", f"/tmp/psr_{nome}.js"]).returncode != 0:
            print(f"! sintaxe em {caminho}"); sys.exit(1)
        print(f"→ {metodo} {caminho}: {len(codigo)} chars")
        if aplicar:
            c, r = req(f"{APP}/modules/auth/routes", "PUT",
                       {"method": metodo, "path": caminho, "controllerCode": codigo})
            if c >= 300:
                print(f"   ❌ {c} {r}"); sys.exit(1)
    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    c, r = req(f"{APP}/modules/auth", "PATCH", {"status": "published"})
    print(f"→ publicar auth: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
