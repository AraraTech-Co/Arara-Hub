#!/usr/bin/env python3
# =============================================================================
# O rodízio passa a respeitar presença e limite de conversas simultâneas.
#
# Como eu o escrevi ontem, o rodízio olhava só papel e fila: distribuía para
# qualquer perfil `support`/`developer`/`admin`, inclusive quem está **Offline**
# no interruptor da inbox. Na prática isso é pior que não ter rodízio — a
# conversa sai da fila visível de todos e vai parar com quem foi almoçar,
# onde ninguém procura.
#
# O dado já existia e ninguém consumia: `WaAgentProfiles` guarda `online`,
# `max_concurrent` (padrão 5) e `last_seen_at`, escritos pelo próprio
# interruptor Online/Offline. Até agora servia só para pintar um pontinho
# verde na lista de atendentes.
#
# Regra nova, em ordem:
#
#   1. só entra quem está **online**;
#   2. quem já atingiu o `max_concurrent` sai da roda;
#   3. entre os que sobram, recebe quem está há mais tempo sem conversa nova;
#   4. empate vai para quem tem a fila aberta menor;
#   5. **ninguém online → não atribui**. A conversa fica na fila para alguém
#      puxar, que é o comportamento honesto: melhor visível para todos do que
#      escondida com quem não está.
#
#   python3 scripts/wa-rodizio-presenca.py            # simula
#   python3 scripts/wa-rodizio-presenca.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-rodizio-presenca.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/whatsapp"

VELHO = """    var candidatos = perfis.filter(function (p) {
      return p && p.role && papeisValidos[String(p.role).toLowerCase()] && p.active !== false;
    });
    if (!candidatos.length) return null;"""

NOVO = """    var candidatos = perfis.filter(function (p) {
      return p && p.role && papeisValidos[String(p.role).toLowerCase()] && p.active !== false;
    });
    if (!candidatos.length) return null;

    // Presença e limite — ver %s. Atribuir para quem
    // está Offline tira a conversa da fila visível e a esconde com quem não
    // está; pior do que não ter rodízio.
    var presenca = {};
    try {
      var agentes = (await ctx.models.WaAgentProfiles.findMany({})) || [];
      for (var g = 0; g < agentes.length; g++) {
        presenca[String(agentes[g].profile_id || agentes[g].profileId)] = agentes[g];
      }
    } catch (e) {}
    candidatos = candidatos.filter(function (p) {
      var a = presenca[String(p.id)];
      return a && (a.online === true || a.online === "true");
    });
    if (!candidatos.length) return null;   // ninguém online: deixa na fila""" % MARCA

VELHO_ORDEM = """    candidatos.sort(function (a, b) {
      var ua = ultima[a.id] || "", ub = ultima[b.id] || "";
      if (ua !== ub) return ua < ub ? -1 : 1;             // há mais tempo sem receber
      return (abertas[a.id] || 0) - (abertas[b.id] || 0); // desempate: fila menor
    });
    return candidatos[0] || null;"""

NOVO_ORDEM = """    // Quem encheu a agenda sai da roda. `max_concurrent` é por pessoa
    // (padrão 5) e vem do mesmo registro da presença.
    var comVaga = candidatos.filter(function (p) {
      var a = presenca[String(p.id)] || {};
      var teto = Number(a.max_concurrent || a.maxConcurrent || 5);
      return (abertas[p.id] || 0) < teto;
    });
    // Todos no teto: ninguém recebe automático. Empurrar mais uma para quem já
    // está no limite é o mesmo que não ter limite.
    if (!comVaga.length) return null;

    comVaga.sort(function (a, b) {
      var ua = ultima[a.id] || "", ub = ultima[b.id] || "";
      if (ua !== ub) return ua < ub ? -1 : 1;             // há mais tempo sem receber
      return (abertas[a.id] || 0) - (abertas[b.id] || 0); // desempate: fila menor
    });
    return comVaga[0] || null;"""


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
    rota = [r for r in d["routes"] if r["path"] == "/whatsapp/inbound"][0]
    codigo = rota["controllerCode"]
    if MARCA in codigo:
        print("= já aplicado")
        return
    for velho in (VELHO, VELHO_ORDEM):
        if codigo.count(velho) != 1:
            print("! o rodízio mudou de forma; revise o script")
            sys.exit(1)
    novo = codigo.replace(VELHO, NOVO, 1).replace(VELHO_ORDEM, NOVO_ORDEM, 1)

    open("/tmp/inbound_rodizio.js", "w").write(novo)
    print(f"→ inbound: {len(codigo)} → {len(novo)} caracteres (cópia em /tmp/inbound_rodizio.js)")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return

    corpo = {"method": "POST", "path": "/whatsapp/inbound", "controllerCode": novo}
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
