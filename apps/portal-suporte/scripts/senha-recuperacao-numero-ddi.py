#!/usr/bin/env python3
# =============================================================================
# Recuperação de senha: o código não chegava — número sem DDI, e envio no escuro.
#
# DIAGNÓSTICO (24/08): o pedido do André era gerado corretamente (registro
# criado, telefone com 11 dígitos, longe do teto de 3 envios/hora), o token
# estava no cofre e a Avisa respondia. Mesmo assim nada chegava.
#
# CAUSA: o módulo de WhatsApp normaliza o destino com `numeroCanonico()` —
# número BR de 10-11 dígitos ganha o **55** na frente. Minha rota de
# recuperação mandava o número CRU do cadastro (`19993188848`), então a Avisa
# aceitava a requisição e tentava entregar para um número inexistente.
#
# SEGUNDO PROBLEMA, que escondeu o primeiro: o envio estava dentro de um
# `try/catch` vazio. Para a resposta ao usuário ser sempre genérica (correto,
# anti-enumeração), eu havia engolido TAMBÉM o resultado do provedor — ou seja,
# falha de entrega era invisível para todo mundo. Agora o desfecho fica
# registrado em `WaConversationEvents` (sem o código, sem o telefone inteiro).
#
#   python3 scripts/senha-recuperacao-numero-ddi.py            # simula
#   python3 scripts/senha-recuperacao-numero-ddi.py --aplicar
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/senha-recuperacao-numero-ddi.py"


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

VELHO = """  // Envio pela Avisa — mesmo caminho do atendimento.
  try {
    var token = await ctx.secrets.get("whatsapp_token");
    if (token && ctx.fetch) {
      await ctx.fetch(AVISA_BASE + "/actions/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          number: fone,"""

NOVO = """  // ── Envio pela Avisa (%s) ──
  // O número do cadastro vem SEM DDI (ex.: 19993188848). O módulo de WhatsApp
  // normaliza com `numeroCanonico()` — 10 ou 11 dígitos ganham o "55". Mandar
  // cru fazia a Avisa aceitar e tentar entregar para um número inexistente:
  // resposta 200, mensagem em lugar nenhum. Foi o que travou o André em 24/08.
  var destino = (fone.length === 10 || fone.length === 11) ? ("55" + fone) : fone;
  var _desfecho = { etapa: "inicio" };
  try {
    var token = await ctx.secrets.get("whatsapp_token");
    _desfecho.tem_token = !!token;
    if (token && ctx.fetch) {
      var _r = await ctx.fetch(AVISA_BASE + "/actions/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          number: destino,""" % MARCA

VELHO2 = """          message: "Portal Arara Tech — seu código para redefinir a senha: " + codigo +
            "\\n\\nVale por 10 minutos. Se não foi você, ignore esta mensagem.",
        }),
      });
    }
  } catch (e) {}
  return ctx.reply.send(generica);"""

NOVO2 = """          message: "Portal Arara Tech — seu código para redefinir a senha: " + codigo +
            "\\n\\nVale por 10 minutos. Se não foi você, ignore esta mensagem.",
        }),
      });
      _desfecho.etapa = "enviado";
      _desfecho.status = _r ? _r.status : null;
      // 200 do provedor NÃO é prova de entrega (lição de 17/08 com o sendList),
      // mas um status != 2xx é prova de que NÃO saiu.
      var _corpo = _r && _r.body;
      if (typeof _corpo === "string") { try { _corpo = JSON.parse(_corpo); } catch (e2) {} }
      if (_r && _r.status >= 300) {
        _desfecho.erro_provedor = String((_corpo && (_corpo.message || _corpo.error)) || "").slice(0, 160);
      }
    }
  } catch (e) {
    _desfecho.etapa = "falhou";
    _desfecho.erro = String((e && e.message) || e).slice(0, 160);
  }

  // Registro do DESFECHO. A resposta ao usuário continua genérica (ninguém
  // descobre se um e-mail existe), mas a equipe deixa de ficar cega quando a
  // mensagem não sai. Sem o código e sem o telefone inteiro.
  try {
    var _Ev = ctx.models.WaConversationEvents;
    if (_Ev) {
      await _Ev.create({
        id: "psr_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        conversation_id: "recuperacao_senha",
        kind: "senha_codigo_envio",
        payload: JSON.stringify({
          quando: _agora(),
          destino_final: destino.slice(0, 4) + "…" + destino.slice(-2),
          digitos: destino.length,
          desfecho: _desfecho,
        }).slice(0, 900),
        created_at: _agora(),
      });
    }
  } catch (e) {}
  return ctx.reply.send(generica);"""


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
    rota = [r for r in d["routes"] if r["path"] == "/auth/senha/solicitar"][0]
    cod = rota["controllerCode"]
    if MARCA in cod:
        print("= já aplicado")
        return
    for velho in (VELHO, VELHO2):
        if cod.count(velho) != 1:
            print(f"! âncora aparece {cod.count(velho)}x"); sys.exit(1)
    novo = cod.replace(VELHO, NOVO, 1).replace(VELHO2, NOVO2, 1)
    open("/tmp/senha_ddi.js", "w").write(novo)
    if subprocess.run(["node", "--check", "/tmp/senha_ddi.js"]).returncode != 0:
        sys.exit(1)
    print(f"→ solicitar: +DDI +registro de desfecho ({len(cod)} → {len(novo)})")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return
    corpo = {"method": "POST", "path": "/auth/senha/solicitar", "controllerCode": novo}
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
