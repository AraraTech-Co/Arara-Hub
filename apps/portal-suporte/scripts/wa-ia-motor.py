#!/usr/bin/env python3
# =============================================================================
# Fatia 3 — o motor passa a obedecer o painel da IA.
#
# O ramo da IA no `POST /whatsapp/inbound` estava com prompt e modelo FIXOS no
# código: mudar o tom exigia eu reescrever o controller. Agora ele lê a
# configuração gravada pelo painel (`SystemSettings.wa_ia`) e usa a MESMA
# função de montagem do prompt — a de `scripts/wa-ia-config.py`. Duas montagens
# seriam duas verdades, e a divergência apareceria como "a IA respondeu
# diferente do que a prévia mostrava".
#
# Além disso:
#
#   teto de 3     conta as respostas da IA nesta conversa (eventos
#                 `ia_resposta`) e, ao atingir, entrega para humano com uma
#                 frase de transição. Não depende de a IA reconhecer que
#                 travou — que é justamente onde IA falha.
#   carimbo       cada resposta grava modelo, nível e versão do prompt. Sem
#                 isso não há como responder "por que ela disse isso?".
#
#   python3 scripts/wa-ia-motor.py            # simula
#   python3 scripts/wa-ia-motor.py --aplicar
# =============================================================================

import json
import os
import re
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/wa-ia-motor.py"


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

NOVO_RAMO = """  if (iaLigada) {
    // Configuração e prompt vêm do painel (ver %s).
    var iaCfg = null;
    try {
      var linhaCfg = cfg && cfg.wa_ia;
      if (typeof linhaCfg === "string") { try { linhaCfg = JSON.parse(linhaCfg); } catch (e) { linhaCfg = null; } }
      iaCfg = linhaCfg;
    } catch (e) {}
    var iaModelo = (iaCfg && iaCfg.modelo) || "claude-opus-4-8";
    var iaNivel = (iaCfg && iaCfg.nivel) || "conservadora";
    var iaVersao = (iaCfg && iaCfg.versao) || 0;
    var iaPrompt = (iaCfg && iaCfg.promptMontado) || null;

    // TETO: conta o que a IA já respondeu NESTA conversa. Não depende de ela
    // reconhecer que travou — que é onde IA falha.
    var respostasIa = 0;
    try {
      var eventos = (await ctx.models.WaConversationEvents.findMany({})) || [];
      for (var ev = 0; ev < eventos.length; ev++) {
        if (String(eventos[ev].conversation_id) === String(conv.id) &&
            eventos[ev].kind === "ia_resposta") respostasIa++;
      }
    } catch (e) {}

    var chaveIa = null;
    try { chaveIa = await ctx.secrets.get("anthropic_api_key"); } catch (e) {}

    if (respostasIa >= 3) {
      await _entregarAoHumano("Vou chamar um analista para continuar com você daqui.");
      return;
    }
    if (!chaveIa || !iaPrompt) {
      try {
        await ctx.models.WaConversationEvents.create({
          id: "iae_" + Date.now().toString(36),
          conversation_id: conv.id, kind: "ia_indisponivel",
          payload: JSON.stringify({
            motivo: !chaveIa ? "sem anthropic_api_key no cofre" : "sem prompt configurado no painel",
          }),
          created_at: agora,
        });
      } catch (e) {}
    } else {
      try {
        var resp = await ctx.fetch("https://api.anthropic.com/v1/messages", {
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
        });
        var corpo = resp && resp.body;
        if (typeof corpo === "string") { try { corpo = JSON.parse(corpo); } catch (e) {} }
        var fala = corpo && corpo.content && corpo.content[0] && corpo.content[0].text;
        if (resp && resp.status < 300 && fala) {
          await _dizer(fala);
          // Carimbo: com qual configuração ela disse isso.
          try {
            await ctx.models.WaConversationEvents.create({
              id: "iar_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              conversation_id: conv.id, kind: "ia_resposta",
              payload: JSON.stringify({ modelo: iaModelo, nivel: iaNivel, versaoPrompt: iaVersao }),
              created_at: agora,
            });
          } catch (e) {}
          try { await Conv.update(conv.id, { updated_at: agora }); } catch (e) {}
          return;   // IA atendeu; menu não entra por cima
        }
      } catch (e) {
        // Host fora da allowlist do sandbox cai aqui. Segue para o menu.
      }
    }
  }
""" % MARCA


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
    rota = [r for r in d["routes"] if r["path"] == "/whatsapp/inbound"][0]
    codigo = rota["controllerCode"]
    if MARCA in codigo:
        print("= já aplicado")
        return

    ini = codigo.find("  if (iaLigada) {")
    fim = codigo.find("  if (!menuLigado) {")
    if ini < 0 or fim < 0 or fim <= ini:
        print("! não achei o ramo da IA; revise o script")
        sys.exit(1)
    novo = codigo[:ini] + NOVO_RAMO + "\n" + codigo[fim:]

    open("/tmp/inbound_ia.js", "w").write(novo)
    print(f"→ inbound: {len(codigo)} → {len(novo)} caracteres (cópia em /tmp/inbound_ia.js)")
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
