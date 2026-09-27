#!/usr/bin/env python3
# =============================================================================
# Acompanhamento do cliente — passo 3: o aviso de abertura pelo WhatsApp.
#
# HOJE QUEM ABRE CHAMADO PELO WHATSAPP NÃO FICA SABENDO O NÚMERO. Conferido no
# controller de POST /whatsapp/:id/ticket: ele cria o chamado, guarda o número,
# liga a conversa — e não envia nada de volta.
#
# Esta alteração acrescenta:
#   1. o código de acompanhamento no chamado (6 caracteres, alfabeto sem
#      confusão, validade = enquanto aberto + 7 dias);
#   2. o envio da mensagem para o `remote_jid` da conversa;
#   3. o REGISTRO DO DESFECHO do envio — sem ele, falha de entrega é invisível,
#      que foi exatamente o que escondeu o problema do André por semanas.
#
# O envio vai dentro de try/catch e NUNCA derruba a criação do chamado: um
# chamado criado e não avisado é ruim; um chamado que deixou de existir porque
# o WhatsApp falhou é muito pior.
#
#   python3 scripts/acompanhamento-whatsapp.py            # simula
#   python3 scripts/acompanhamento-whatsapp.py --aplicar
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/acompanhamento-whatsapp.py"


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

VELHO = """    is_public: false,
    position: 0,
  });
"""

NOVO = """    is_public: false,
    position: 0,
    // ── Acompanhamento pelo cliente (%s) ──
    // Código de 6 caracteres, alfabeto sem 0 O 1 I L: a pessoa lê da mensagem
    // e digita.
    //
    // `acomp_expira_em` é só um TETO distante (1 ano). A regra de verdade —
    // vale enquanto aberto, e mais 7 dias depois de fechar — é conferida na
    // LEITURA, em POST /tickets/acompanhar. Assim não é preciso um gancho no
    // fechamento, e um chamado que fique aberto seis meses não perde o acesso
    // no meio do caminho.
    acomp_codigo: _gerarCodigoAcomp(),
    acomp_expira_em: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    acomp_tentativas: 0,
    acomp_bloqueado_ate: "",
    acomp_whatsapp: _numeroDoContato(conv),
  });

  // ── Aviso de abertura ────────────────────────────────────────────────────
  // Dentro de try/catch e SEM derrubar a criação: chamado criado e não avisado
  // é ruim; chamado que deixou de existir porque o WhatsApp falhou é pior.
  await _avisarAbertura(ctx, conv, ticket);
""" % MARCA

# Blocos auxiliares, injetados antes do handler.
AUXILIARES = """
// ── Acompanhamento pelo cliente (%s) ─────────────────────────────────────────
// Sem 0 O 1 I L: confundir zero com ó gera "código inválido" e um chamado sobre
// o chamado.
var _ALFABETO_ACOMP = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function _gerarCodigoAcomp() {
  // ⚠️ DÍVIDA CONHECIDA: o sandbox não tem `crypto`, e `Math.random` no V8 é
  // xorshift128+ — quem coleta alguns códigos calcula os próximos. Pedimos
  // `ctx.randomBytes` à plataforma
  // (docs/pedido-hefler-aleatoriedade-sandbox.md); quando existir, trocar SÓ
  // esta função. A trava de 5 tentativas segura quem CHUTA, não quem calcula.
  var s = "";
  for (var i = 0; i < 6; i++) {
    s += _ALFABETO_ACOMP.charAt(Math.floor(Math.random() * _ALFABETO_ACOMP.length));
  }
  return s;
}

/** O número do contato sai do `remote_jid` da conversa. */
function _numeroDoContato(conv) {
  var jid = String((conv && (conv.remote_jid || conv.remoteJid)) || "");
  var d = jid.replace(/@.*$/, "").replace(/\\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

async function _avisarAbertura(ctx, conv, ticket) {
  var desfecho = { etapa: "inicio" };
  var destino = _numeroDoContato(conv);
  try {
    if (!destino || destino.length < 12) {
      desfecho.etapa = "sem_numero";
      return;
    }
    var token = await ctx.secrets.get("whatsapp_token");
    desfecho.tem_token = !!token;
    if (!token || !ctx.fetch) {
      desfecho.etapa = "sem_token";
      return;
    }

    var texto = "Seu chamado foi aberto: " + String(ticket.ticket_number || "") + "\\n\\n"
      + "Para acompanhar o andamento, acesse:\\n"
      + "https://suporte.arara-tech.com/acompanhar\\n\\n"
      + "Use o código: " + String(ticket.acomp_codigo || "") + "\\n\\n"
      + "Guarde esta mensagem — o código é só deste chamado.";

    // Conta registrada antes do nono dígito existe SEM ele. De fora não dá para
    // saber qual variante a pessoa usa, então tentamos as duas e paramos na
    // primeira aceita (mesma lição de scripts/senha-recuperacao-nono-digito.py).
    var candidatos = [destino];
    if (destino.length === 13) candidatos.push(destino.slice(0, 4) + destino.slice(5));
    else if (destino.length === 12) candidatos.push(destino.slice(0, 4) + "9" + destino.slice(4));

    var r = null;
    desfecho.tentativas = [];
    for (var i = 0; i < candidatos.length; i++) {
      r = await ctx.fetch("https://www.avisaapi.com.br/api/actions/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ number: candidatos[i], message: texto }),
      });
      desfecho.tentativas.push({ digitos: candidatos[i].length, status: r ? r.status : null });
      if (r && r.status < 300) break;
    }
    desfecho.etapa = "enviado";
    desfecho.status = r ? r.status : null;
  } catch (e) {
    desfecho.etapa = "falhou";
    desfecho.erro = String((e && e.message) || e).slice(0, 160);
  }

  // 200 do provedor NÃO é prova de entrega (lição de 17/08 com o sendList),
  // mas sem registro nenhum a falha é invisível — foi o que escondeu o caso do
  // André por semanas. Sem o código e sem o telefone inteiro.
  try {
    var Ev = ctx.models.WaConversationEvents;
    if (Ev) {
      await Ev.create({
        id: "acomp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        conversation_id: String((conv && conv.id) || ""),
        kind: "acompanhamento_aviso",
        payload: JSON.stringify({
          quando: new Date().toISOString(),
          chamado: ticket.ticket_number,
          destino: destino ? destino.slice(0, 4) + "…" + destino.slice(-2) : "",
          desfecho: desfecho,
        }).slice(0, 900),
        created_at: new Date().toISOString(),
      });
    }
  } catch (e) {}
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
        return e.code, e.read().decode("utf-8", "replace")[:400]


def main():
    aplicar = "--aplicar" in sys.argv
    _, d = req(f"{MOD}/routes")
    rota = [r for r in d["routes"] if r["path"] == "/whatsapp/:id/ticket" and r["method"] == "POST"][0]
    cod = rota["controllerCode"]

    if MARCA in cod:
        print("= já aplicado")
        return
    if cod.count(VELHO) != 1:
        print(f"! âncora aparece {cod.count(VELHO)}x — o controller mudou; conferir antes")
        sys.exit(1)

    novo = cod.replace(VELHO, NOVO, 1)
    # auxiliares vão antes do handler
    alvo = "async function handler(ctx) {"
    if novo.count(alvo) != 1:
        print(f"! âncora do handler aparece {novo.count(alvo)}x")
        sys.exit(1)
    novo = novo.replace(alvo, AUXILIARES + "\n" + alvo, 1)

    open("/tmp/wa_acomp.js", "w").write(novo)
    if subprocess.run(["node", "--check", "/tmp/wa_acomp.js"]).returncode != 0:
        sys.exit(1)
    print(f"→ /whatsapp/:id/ticket: código + envio + registro ({len(cod)} → {len(novo)} chars)")
    if not aplicar:
        print("   (simulação — use --aplicar)")
        return

    corpo = {"method": "POST", "path": "/whatsapp/:id/ticket", "controllerCode": novo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    c, r = req(f"{MOD}/routes", "PUT", corpo)
    print(f"→ gravar: HTTP {c} {'' if c < 300 else r}")
    if c >= 300:
        sys.exit(1)
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar whatsapp: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
