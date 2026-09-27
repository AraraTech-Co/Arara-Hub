#!/usr/bin/env python3
# =============================================================================
# Recuperação de senha: o nono dígito brasileiro.
#
# SINTOMA (24/08, caso do André): número correto, formato correto — e a Avisa
# recusando com 400 "Could not validate the provided number".
#
# COMPARAÇÃO que fechou o diagnóstico:
#   funciona → 5519995537447  (55 + 19 + 9 9553-7447)
#   André    → 5519993188848  (55 + 19 + 9 9318-8848)
# Mesma estrutura, mesmo tamanho. Ou seja: não é formatação nossa.
#
# CAUSA: contas de WhatsApp registradas antes da adição do nono dígito
# continuam existindo SEM ele (551993188848, 12 dígitos). O provedor valida o
# número exatamente como está registrado do lado do WhatsApp — e não há como
# saber de fora qual variante uma pessoa usa.
#
# CORREÇÃO: em vez de adivinhar, tentar as DUAS. Envia na variante mais
# provável; se o provedor recusar, tenta a outra. A primeira que for aceita
# encerra. O desfecho registra QUAL variante funcionou — assim, com o tempo, dá
# para corrigir os cadastros em vez de ficar tentando duas vezes para sempre.
#
#   python3 scripts/senha-recuperacao-nono-digito.py            # simula
#   python3 scripts/senha-recuperacao-nono-digito.py --aplicar
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/senha-recuperacao-nono-digito.py"


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

VELHO = """  var destino = (fone.length === 10 || fone.length === 11) ? ("55" + fone) : fone;
  var _desfecho = { etapa: "inicio" };
  try {
    var token = await ctx.secrets.get("whatsapp_token");
    _desfecho.tem_token = !!token;
    if (token && ctx.fetch) {
      var _r = await ctx.fetch(AVISA_BASE + "/actions/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          number: destino,
          message: "Portal Arara Tech — seu código para redefinir a senha: " + codigo +
            "\\n\\nVale por 10 minutos. Se não foi você, ignore esta mensagem.",
        }),
      });
      _desfecho.etapa = "enviado";
      _desfecho.status = _r ? _r.status : null;"""

NOVO = """  // ── Variantes do nono dígito (%s) ──
  // Conta registrada antes da mudança existe no WhatsApp SEM o 9 (12 dígitos);
  // registrada depois, COM (13). De fora não dá para saber qual é a de cada
  // pessoa — o provedor só diz "não consegui validar". Então tentamos as duas,
  // na ordem mais provável, e paramos na primeira aceita.
  var _base = (fone.length === 10 || fone.length === 11) ? ("55" + fone) : fone;
  var _candidatos = [_base];
  if (_base.length === 13) {
    // 55 + DDD + 9XXXXXXXX  →  55 + DDD + XXXXXXXX (tira o nono dígito)
    _candidatos.push(_base.slice(0, 4) + _base.slice(5));
  } else if (_base.length === 12) {
    // o inverso: acrescenta o 9 depois do DDD
    _candidatos.push(_base.slice(0, 4) + "9" + _base.slice(4));
  }

  var destino = _candidatos[0];
  var _desfecho = { etapa: "inicio", tentativas: [] };
  try {
    var token = await ctx.secrets.get("whatsapp_token");
    _desfecho.tem_token = !!token;
    if (token && ctx.fetch) {
      var _r = null;
      for (var _ci = 0; _ci < _candidatos.length; _ci++) {
        destino = _candidatos[_ci];
        _r = await ctx.fetch(AVISA_BASE + "/actions/sendMessage", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({
            number: destino,
            message: "Portal Arara Tech — seu código para redefinir a senha: " + codigo +
              "\\n\\nVale por 10 minutos. Se não foi você, ignore esta mensagem.",
          }),
        });
        _desfecho.tentativas.push({ digitos: destino.length, status: _r ? _r.status : null });
        // Aceitou: para aqui. Insistir mandaria a MESMA mensagem duas vezes.
        if (_r && _r.status < 300) break;
      }
      _desfecho.etapa = "enviado";
      _desfecho.variante_usada = destino.length;
      _desfecho.status = _r ? _r.status : null;""" % MARCA


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
    if cod.count(VELHO) != 1:
        print(f"! âncora aparece {cod.count(VELHO)}x"); sys.exit(1)
    novo = cod.replace(VELHO, NOVO, 1)
    open("/tmp/senha_nono.js", "w").write(novo)
    if subprocess.run(["node", "--check", "/tmp/senha_nono.js"]).returncode != 0:
        sys.exit(1)
    print(f"→ solicitar: tenta as duas variantes ({len(cod)} → {len(novo)})")
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
