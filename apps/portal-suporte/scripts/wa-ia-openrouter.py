#!/usr/bin/env python3
# =============================================================================
# IA humanizada: Anthropic → OpenRouter (decisão do Leonardo, 21/08/2026).
#
# POR QUE OPENROUTER: o sandbox é fail-closed por host, e cada host novo custa
# uma linha de env do Hefler mais uma espera. Com um agregador, é UM host
# (`openrouter.ai`) liberado uma vez — trocar de modelo depois é mudar o texto
# no painel, sem passar por ninguém.
#
# O QUE MUDA (4 pontos, os únicos que amarravam o provedor):
#   1. Catálogo de modelos do painel  → os 4 escolhidos
#   2. Segredo do cofre               → `ia_api_key` (era `anthropic_api_key`)
#   3. Sonda de dependências          → openrouter.ai/api/v1/models
#   4. As DUAS chamadas reais         → dialeto OpenAI (/chat/completions):
#        Authorization: Bearer …  ·  {model, messages:[system,user]}
#        resposta em choices[0].message.content
#
# O prompt, os níveis de iniciativa e as travas do §"nunca" ficam intactos —
# eles não têm nada a ver com o provedor.
#
# ⚠️ LIMITE DE 8 s: o `ctx.fetch` do sandbox tem timeout de 8 segundos. Modelo
# grande (o 550b) pode estourar isso em resposta longa. O erro passa a dizer
# exatamente isso e sugerir o `lightning`, em vez de virar "erro de rede".
#
#   python3 scripts/wa-ia-openrouter.py            # simula
#   python3 scripts/wa-ia-openrouter.py --aplicar
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-ia-openrouter.py"


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

# ── 1. Catálogo ──────────────────────────────────────────────────────────────
CAT_VELHO = """var IA_MODELOS = {
  "claude-opus-4-8": "Opus 4.8 — o mais capaz, mais caro",
  "claude-sonnet-5": "Sonnet 5 — equilíbrio entre qualidade e custo",
  "claude-haiku-4-5": "Haiku 4.5 — o mais rápido e barato",
};"""
CAT_NOVO = """// Modelos via OpenRouter (%s). Trocar de modelo daqui em
// diante é editar esta lista — o host já está liberado, não depende de
// ninguém. O rótulo é o que a equipe lê no painel.
var IA_MODELOS = {
  "nvidia/nemotron-3-ultra-550b-a55b:free": "Nemotron 3 Ultra — o mais capaz (pode ser lento)",
  "nvidia/nemotron-3.5-lightning:free": "Nemotron 3.5 Lightning — o mais rápido",
  "google/gemma-4-26b-a4b-it:free": "Gemma 4 — mais criativo",
  "z-ai/glm-5.2:free": "GLM 5.2 — alternativa",
};
var IA_BASE = "https://openrouter.ai/api/v1";""" % MARCA

# ── 2 e 3. Sonda de dependências ─────────────────────────────────────────────
CHAVE_VELHA = """  try { temChave = !!(await ctx.secrets.get("anthropic_api_key")); } catch (e) {}"""
CHAVE_NOVA = """  // Segredo neutro de provedor: trocar de fornecedor não renomeia mais nada.
  try { temChave = !!(await ctx.secrets.get("ia_api_key")); } catch (e) {}"""

SONDA_VELHA = """    var r = await ctx.fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: { "x-api-key": "probe", "anthropic-version": "2023-06-01" },
    });"""
SONDA_NOVA = """    var r = await ctx.fetch(IA_BASE + "/models", { method: "GET" });"""

# ── Padrão do config ─────────────────────────────────────────────────────────
PADRAO_VELHO = """  modelo: "claude-opus-4-8","""
PADRAO_NOVO = """  modelo: "nvidia/nemotron-3-ultra-550b-a55b:free","""

# ── 4a. Simulador ────────────────────────────────────────────────────────────
SIM_CHAVE_VELHA = """  try { chave = await ctx.secrets.get("anthropic_api_key"); } catch (e) {}"""
SIM_CHAVE_NOVA = """  try { chave = await ctx.secrets.get("ia_api_key"); } catch (e) {}"""

SIM_ERRO_VELHO = """      error: "Falta a chave da Anthropic no cofre (segredo `anthropic_api_key`)." """.rstrip()
SIM_ERRO_NOVO = """      error: "Falta a chave da IA no cofre. Cole a chave do OpenRouter no painel (campo Chave da API)." """.rstrip()

SIM_CHAMADA_VELHA = """    var resp = await ctx.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: r.cfg.modelo,
        max_tokens: 700,
        system: prompt,
        messages: [{ role: "user", content: mensagem }],
      }),
    });"""
SIM_CHAMADA_NOVA = """    var resp = await ctx.fetch(IA_BASE + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + chave,
        "X-Title": "Portal Suporte Arara Tech",
      },
      body: JSON.stringify({
        model: r.cfg.modelo,
        max_tokens: 700,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: mensagem },
        ],
      }),
    });"""

SIM_RECUSA_VELHA = """        error: "A Anthropic recusou (HTTP " + (resp ? resp.status : "?") + ").","""
SIM_RECUSA_NOVA = """        error: "O provedor recusou (HTTP " + (resp ? resp.status : "?") + ").","""

SIM_FALA_VELHA = """    var fala = corpo && corpo.content && corpo.content[0] && corpo.content[0].text;"""
SIM_FALA_NOVA = """    var fala = corpo && corpo.choices && corpo.choices[0] && corpo.choices[0].message &&
               corpo.choices[0].message.content;"""

SIM_HOST_VELHO = """      error: "O host api.anthropic.com ainda não está liberado na plataforma (SANDBOX_FETCH_ALLOWLIST)." """.rstrip()
SIM_HOST_NOVO = """      error: /tempo|timeout|abort/i.test(String((e && e.message) || ""))
        ? "O modelo demorou mais que os 8 s que o sandbox permite. Troque para o Nemotron Lightning no campo Modelo."
        : "O host openrouter.ai ainda não está liberado na plataforma (SANDBOX_FETCH_ALLOWLIST_BY_APP)." """.rstrip()

# ── 4b. Inbound ──────────────────────────────────────────────────────────────
INB_CHAVE_VELHA = """    try { chaveIa = await ctx.secrets.get("anthropic_api_key"); } catch (e) {}"""
INB_CHAVE_NOVA = """    try { chaveIa = await ctx.secrets.get("ia_api_key"); } catch (e) {}"""

INB_MOTIVO_VELHO = """            motivo: !chaveIa ? "sem anthropic_api_key no cofre" : "sem prompt configurado no painel","""
INB_MOTIVO_NOVO = """            motivo: !chaveIa ? "sem ia_api_key no cofre" : "sem prompt configurado no painel","""

INB_CHAMADA_VELHA = """        var resp = await ctx.fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": chaveIa,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: iaModelo,
            max_tokens: 700,
            system: iaPrompt,
            messages: [{ role: "user", content: String(textoCliente || "") }],
          }),
        });"""
INB_CHAMADA_NOVA = """        var resp = await ctx.fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + chaveIa,
            "X-Title": "Portal Suporte Arara Tech",
          },
          body: JSON.stringify({
            model: iaModelo,
            max_tokens: 700,
            messages: [
              { role: "system", content: iaPrompt },
              { role: "user", content: String(textoCliente || "") },
            ],
          }),
        });"""

INB_FALA_VELHA = """        var fala = corpo && corpo.content && corpo.content[0] && corpo.content[0].text;"""
INB_FALA_NOVA = """        var fala = corpo && corpo.choices && corpo.choices[0] && corpo.choices[0].message &&
                   corpo.choices[0].message.content;"""

TROCAS = [
    CAT_VELHO and (CAT_VELHO, CAT_NOVO),
    (CHAVE_VELHA, CHAVE_NOVA),
    (SONDA_VELHA, SONDA_NOVA),
    (PADRAO_VELHO, PADRAO_NOVO),
    (SIM_CHAVE_VELHA, SIM_CHAVE_NOVA),
    (SIM_ERRO_VELHO, SIM_ERRO_NOVO),
    (SIM_CHAMADA_VELHA, SIM_CHAMADA_NOVA),
    (SIM_RECUSA_VELHA, SIM_RECUSA_NOVA),
    (SIM_FALA_VELHA, SIM_FALA_NOVA),
    (SIM_HOST_VELHO, SIM_HOST_NOVO),
    (INB_CHAVE_VELHA, INB_CHAVE_NOVA),
    (INB_MOTIVO_VELHO, INB_MOTIVO_NOVO),
    (INB_CHAMADA_VELHA, INB_CHAMADA_NOVA),
    (INB_FALA_VELHA, INB_FALA_NOVA),
]

ALVOS = [
    ("GET", "/whatsapp/ia"),
    ("PUT", "/whatsapp/ia"),
    ("POST", "/whatsapp/ia/simular"),
    ("POST", "/whatsapp/inbound"),
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
    _, d = req(f"{MOD}/routes")
    por = {(r["method"], r["path"]): r for r in d["routes"]}
    mudou = False

    for metodo, caminho in ALVOS:
        rota = por.get((metodo, caminho))
        if not rota:
            print(f"! {metodo} {caminho} não existe"); sys.exit(1)
        cod = rota["controllerCode"]
        if MARCA in cod:
            print(f"= {metodo} {caminho}: já migrado")
            continue
        aplicadas = 0
        for velho, novo in TROCAS:
            n = cod.count(velho)
            if n == 0:
                continue
            if n > 1:
                print(f"! {caminho}: âncora ambígua ({n}x)"); sys.exit(1)
            cod = cod.replace(velho, novo, 1)
            aplicadas += 1
        if not aplicadas:
            print(f"! {caminho}: nenhuma âncora encontrada"); sys.exit(1)
        nome = caminho.strip("/").replace("/", "_") + "_" + metodo
        open(f"/tmp/ia_{nome}.js", "w").write(cod)
        if subprocess.run(["node", "--check", f"/tmp/ia_{nome}.js"]).returncode != 0:
            print(f"! sintaxe em {caminho}"); sys.exit(1)
        print(f"→ {metodo} {caminho}: {aplicadas} trocas ({len(rota['controllerCode'])} → {len(cod)})")
        if not aplicar:
            continue
        corpo = {"method": metodo, "path": caminho, "controllerCode": cod}
        for extra in ("authMode", "webhookSecretName"):
            if rota.get(extra):
                corpo[extra] = rota[extra]
        c, r = req(f"{MOD}/routes", "PUT", corpo)
        if c >= 300:
            print(f"   ❌ {c} {r}"); sys.exit(1)
        mudou = True

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    if mudou:
        c, r = req(MOD, "PATCH", {"status": "published"})
        print(f"→ publicar whatsapp: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
