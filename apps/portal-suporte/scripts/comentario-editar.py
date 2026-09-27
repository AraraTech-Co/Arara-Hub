#!/usr/bin/env python3
# =============================================================================
# Editar comentário da equipe — com rastro.
#
# Esses comentários são registro de atendimento: alguém lê semanas depois para
# entender o que foi feito, às vezes numa discussão sobre o que aconteceu. Se o
# texto puder mudar sem deixar rastro, o histórico deixa de ser confiável
# exatamente quando mais importa. Por isso a edição existe, mas nunca é silenciosa.
#
# As regras, combinadas com o Leonardo em 03/09/2026:
#
#   1. Só o AUTOR edita o próprio comentário. Nem admin edita o dos outros —
#      quem discorda escreve um comentário novo, que é como se corrige um
#      registro sem apagar o que foi dito.
#   2. Nos primeiros 15 MINUTOS a correção é livre: consertar o dedo trocado
#      não merece virar histórico. Passou disso, o texto anterior é guardado.
#   3. Depois da janela, o comentário fica marcado como editado, com a data, e
#      o original continua acessível ("ver original").
#   4. NÃO existe exclusão. Comentário errado se corrige com outro comentário.
#   5. Só comentário INTERNO (`is_internal`). Mensagem que já foi para o cliente
#      pode ter saído por e-mail ou WhatsApp: editar aqui criaria divergência
#      entre o que o portal mostra e o que a pessoa recebeu.
#
# Campos novos em TicketMessage:
#   editado_em      ISO — quando foi editado (ausente = nunca editado)
#   texto_original  o texto anterior à PRIMEIRA edição fora da janela
#
# `texto_original` só é gravado uma vez: o valor que interessa é o que foi lido
# por outras pessoas, não o penúltimo rascunho.
#
#   python3 scripts/comentario-editar.py            # simula
#   python3 scripts/comentario-editar.py --aplicar  # grava e publica
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/comentario-editar.py"
JANELA_MIN = 15


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
MODELS = f"{APP}/models"
MOD = f"{APP}/modules/tickets"

CAMPOS = {
    "editado_em": {"type": "string"},
    "texto_original": {"type": "string"},
}

# `_sessaoDoPortal` é reaproveitado: a identidade tem que ser a mesma do resto
# do módulo, senão o autor de um lado não é o autor do outro.
CONTROLLER = '''// %(marca)s — PATCH /tickets/:id/messages/:messageId
//
// Editar comentário da equipe, com rastro. Ver o cabeçalho do script para o
// porquê de cada regra.
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

var JANELA_MS = %(janela)d * 60 * 1000;

async function handler(ctx) {
  var M = ctx.models.TicketMessage;
  if (!M) return ctx.reply.status(500).send({ error: "Model TicketMessage missing" });

  var u = ctx.user || {};
  var quem = u.id || u.userId || (await _sessaoDoPortal(ctx));
  if (!quem) return ctx.reply.status(401).send({ success: false, error: "Requer sessão do portal" });

  var texto = (ctx.body && ctx.body.message) || "";
  texto = String(texto).trim();
  if (!texto) return ctx.reply.status(400).send({ success: false, error: "Comentário vazio" });

  var msg = await M.findById(ctx.params.messageId);
  if (!msg) return ctx.reply.status(404).send({ success: false, error: "Comentário não encontrado" });
  if (String(msg.ticket_id) !== String(ctx.params.id)) {
    return ctx.reply.status(404).send({ success: false, error: "Comentário não é deste chamado" });
  }

  // Só o autor. Nem admin edita o dos outros: quem discorda comenta de novo.
  if (String(msg.user_id || "") !== String(quem)) {
    return ctx.reply.status(403).send({ success: false, error: "Só quem escreveu pode editar este comentário" });
  }
  // Mensagem que já saiu para o cliente pode ter ido por e-mail ou WhatsApp.
  if (msg.is_internal !== true) {
    return ctx.reply.status(403).send({ success: false, error: "Mensagem enviada ao cliente não pode ser editada" });
  }
  if (texto === String(msg.message || "")) {
    return ctx.reply.send({ success: true, data: msg });
  }

  var agora = Date.now();
  var nascido = new Date(msg.created_at || 0).getTime();
  var dentroDaJanela = nascido > 0 && (agora - nascido) < JANELA_MS;

  var patch = { message: texto };
  if (!dentroDaJanela) {
    patch.editado_em = new Date(agora).toISOString();
    // Só na PRIMEIRA vez: o que interessa guardar é o texto que outras pessoas
    // leram, não o penúltimo rascunho.
    if (!msg.texto_original) patch.texto_original = String(msg.message || "");
  }

  var row = await M.update(ctx.params.messageId, patch);
  return ctx.reply.send({ success: true, data: row });
}

module.exports = { handler };
''' % {"marca": MARCA, "janela": JANELA_MIN}


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
        return e.code, e.read().decode("utf-8", "replace")[:400]


def main():
    aplicar = "--aplicar" in sys.argv

    # ── 1. Campos no TicketMessage ───────────────────────────────────────────
    _, d = req(MODELS)
    por_nome = {m["name"]: m for m in d["models"]}
    modelo = por_nome.get("portal-suporte-TicketMessage")
    if not modelo:
        print("❌ model TicketMessage não encontrado")
        sys.exit(1)
    props = dict(modelo["schema"].get("properties", {}))
    faltando = {k: v for k, v in CAMPOS.items() if k not in props}
    if not faltando:
        print("   = TicketMessage: campos já existem")
    else:
        print(f"   {'→' if aplicar else ' '} TicketMessage: +{', '.join(sorted(faltando))}")
        if aplicar:
            props.update(faltando)
            c, r = req(f"{MODELS}/{modelo['name']}", "PATCH",
                       {"schema": {"type": "object", "properties": props}})
            print(f"      HTTP {c} {'' if c < 300 else r}")
            if c >= 300:
                sys.exit(1)

    # ── 2. A rota ────────────────────────────────────────────────────────────
    c, d = req(f"{MOD}/routes")
    if c >= 300:
        print(f"❌ HTTP {c} ao listar rotas")
        sys.exit(1)
    alvo = ("PATCH", "/tickets/:id/messages/:messageId")
    atual = next((r for r in d["routes"] if (r["method"], r["path"]) == alvo), None)
    if atual and MARCA in (atual.get("controllerCode") or ""):
        print("   = rota de edição: já publicada")
        if not aplicar:
            print("\n   (simulação — use --aplicar)")
        return

    print(f"   {'→' if aplicar else ' '} {alvo[0]:6} {alvo[1]}")
    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return

    corpo = {"method": alvo[0], "path": alvo[1], "controllerCode": CONTROLLER}
    # A plataforma cria E atualiza rota com PUT — não existe POST em /routes.
    c, r = req(f"{MOD}/routes", "PUT", corpo)
    if c >= 300:
        print(f"      ❌ HTTP {c} {r}")
        sys.exit(1)
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar tickets: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
