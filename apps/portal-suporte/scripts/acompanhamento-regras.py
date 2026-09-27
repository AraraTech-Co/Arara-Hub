#!/usr/bin/env python3
# =============================================================================
# Acompanhamento do cliente — passo 2: a rota pública.
#
#   POST /tickets/acompanhar   pública   número + código → resumo e linha do tempo
#
# A LINHA DO TEMPO SAI DE UMA LISTA EXPLÍCITA de eventos que PODEM aparecer, e
# não do histórico filtrado por uma marca de "visível ao cliente". Basta alguém
# esquecer de marcar uma vez para um comentário interno aparecer ao cliente — e
# esse erro é invisível até alguém ler o que não devia. Padrão é esconder;
# aparecer é exceção declarada, item por item.
#
#   python3 scripts/acompanhamento-regras.py            # simula
#   python3 scripts/acompanhamento-regras.py --aplicar
# =============================================================================

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/acompanhamento-regras.py"
SEGREDO = "portal_publico_token"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
MOD = f"{API}/v1/apps/portal-suporte/modules/tickets"

# ── Bloco compartilhado: geração e conferência do código ─────────────────────
# A FONTE DE ALEATORIEDADE está isolada em `_sorteio()` de propósito. O sandbox
# não tem `crypto` (sondado em 19/08), então hoje usamos `Math.random`, que é
# previsível — quem coleta alguns códigos calcula os próximos. Pedimos
# `ctx.randomBytes` ao Hefler (docs/pedido-hefler-aleatoriedade-sandbox.md);
# quando existir, trocar SÓ esta função.
CODIGO = """
// Sem 0 O 1 I L: a pessoa lê de uma mensagem e digita. Confundir zero com ó
// gera "código inválido" e um chamado sobre o chamado.
var _ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function _sorteio(n) {
  // ⚠️ DÍVIDA CONHECIDA: `Math.random` no V8 é xorshift128+ — bom para
  // embaralhar lista, ruim para segredo. Trocar por ctx.randomBytes assim que
  // a plataforma expuser. A trava de tentativas segura quem CHUTA; não segura
  // quem calcula.
  var s = "";
  for (var i = 0; i < n; i++) {
    s += _ALFABETO.charAt(Math.floor(Math.random() * _ALFABETO.length));
  }
  return s;
}

function _gerarCodigo() { return _sorteio(6); }

/** Normaliza o que a pessoa digitou: maiúsculas, sem espaço, sem confusão. */
function _normalizar(cru) {
  return String(cru || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0").replace(/[IL]/g, "1");
}
"""

ACOMPANHAR = ("""// %s — POST /tickets/acompanhar  (pública)
// Número + código do chamado. Sem os dois, nada.
""" % MARCA) + CODIGO + """
// Etapas que o cliente vê, na ordem. Status que não estiver aqui NÃO aparece —
// é a lista que impede vazamento por esquecimento.
var _ETAPAS = {
  novos_chamados: "Aberto",
  triagem: "Em triagem",
  em_atendimento: "Em atendimento",
  pendencia_suporte: "Aguardando terceiro",
  pendencia_dev: "Com o time de desenvolvimento",
  aguardando_cliente: "Aguardando sua resposta",
  em_teste: "Em teste e homologação",
  resolvido: "Resolvido",
  resolvido_com_manual: "Resolvido",
  resolvido_sem_manual: "Resolvido",
  post_mortem: "Resolvido",
  fechado: "Encerrado",
};

async function handler(ctx) {
  var T = ctx.models.Ticket;
  if (!T) return ctx.reply.status(500).send({ error: "Model Ticket missing" });

  // Mensagem ÚNICA: não dizer se errou o número ou o código, nem se o chamado
  // existe. Distinguir os casos entrega um oráculo a quem está tentando.
  var recusa = { error: "Número ou código inválido." };

  var b = ctx.body || {};
  var numero = String(b.numero || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  var codigo = _normalizar(b.codigo);
  if (!numero || codigo.length !== 6) return ctx.reply.status(400).send(recusa);

  var todos = (await T.findMany({ ticket_number: numero })) || [];
  var t = todos[0];
  if (!t) return ctx.reply.status(400).send(recusa);

  var agora = Date.now();

  // Trava por tentativas, no CHAMADO — quem erra cinco vezes espera uma hora.
  if (t.acomp_bloqueado_ate && new Date(t.acomp_bloqueado_ate).getTime() > agora) {
    return ctx.reply.status(429).send({
      error: "Muitas tentativas. Espere uma hora e tente de novo.",
    });
  }

  var guardado = _normalizar(t.acomp_codigo);
  if (!guardado || guardado !== codigo) {
    var n = Number(t.acomp_tentativas || 0) + 1;
    var mudanca = { acomp_tentativas: n };
    if (n >= 5) {
      mudanca.acomp_bloqueado_ate = new Date(agora + 60 * 60 * 1000).toISOString();
      mudanca.acomp_tentativas = 0;
    }
    try { await T.update(t.id, mudanca); } catch (e) {}
    return ctx.reply.status(400).send(recusa);
  }

  // Teto distante gravado na criação.
  if (t.acomp_expira_em && new Date(t.acomp_expira_em).getTime() < agora) {
    return ctx.reply.status(400).send({
      error: "Este código expirou. Fale com o suporte para receber outro.",
    });
  }

  // A regra de verdade, conferida na LEITURA: vale enquanto o chamado está
  // aberto, e mais 7 dias depois de encerrado. Fazer assim evita um gancho no
  // fechamento e não tira o acesso de um chamado que fique meses aberto.
  //
  // Sete dias, e não zero: é justo quando resolve que a pessoa quer reler o
  // que foi feito.
  var TERMINAIS = ["resolvido", "resolvido_com_manual", "resolvido_sem_manual", "post_mortem", "fechado", "cancelado"];
  if (TERMINAIS.indexOf(String(t.status || "")) >= 0) {
    var fim = t.resolved_at || t.updated_at || t.created_at;
    if (fim && agora - new Date(fim).getTime() > 7 * 24 * 60 * 60 * 1000) {
      return ctx.reply.status(400).send({
        error: "Este chamado foi encerrado e o acompanhamento não está mais disponível.",
      });
    }
  }

  // Acertou: zera o contador.
  if (Number(t.acomp_tentativas || 0) > 0) {
    try { await T.update(t.id, { acomp_tentativas: 0, acomp_bloqueado_ate: "" }); } catch (e) {}
  }

  // ── Linha do tempo ────────────────────────────────────────────────────────
  var linha = [];
  linha.push({ quando: t.created_at, tipo: "etapa", texto: "Chamado aberto" });

  var H = ctx.models.TicketColumnHistory;
  if (H) {
    var hist = (await H.findMany({ ticket_id: t.id })) || [];
    hist.sort(function (a, b2) {
      return String(a.entered_at || "").localeCompare(String(b2.entered_at || ""));
    });
    for (var i = 0; i < hist.length; i++) {
      var rotulo = _ETAPAS[String(hist[i].status || "")];
      // Status fora da lista simplesmente não vira evento. Nada de "outro".
      if (!rotulo) continue;
      linha.push({ quando: hist[i].entered_at, tipo: "etapa", texto: rotulo });
    }
  }

  var M = ctx.models.TicketMessage;
  if (M) {
    var msgs = (await M.findMany({ ticket_id: t.id })) || [];
    for (var j = 0; j < msgs.length; j++) {
      var m = msgs[j];
      // `is_internal` verdadeiro OU indefinido fica de fora: mensagem sem a
      // marca é tratada como interna. Na dúvida, esconder.
      if (m.is_internal !== false) continue;
      linha.push({
        quando: m.created_at,
        tipo: "mensagem",
        texto: String(m.message || "").slice(0, 4000),
        de: m.user_id ? "suporte" : "voce",
      });
    }
  }

  if (t.resolved_at) {
    linha.push({ quando: t.resolved_at, tipo: "etapa", texto: "Resolvido" });
  }

  linha.sort(function (a, b2) {
    return String(a.quando || "").localeCompare(String(b2.quando || ""));
  });

  // Resposta ENXUTA e declarada campo a campo. Devolver a linha do chamado
  // inteira mandaria ao cliente coisas como justificativa da IA, pontuação
  // interna de prioridade e o quadro do Dev.
  return ctx.reply.send({
    success: true,
    data: {
      numero: t.ticket_number,
      titulo: t.title,
      etapa: _ETAPAS[String(t.status || "")] || "Em andamento",
      aberto_em: t.created_at,
      resolvido_em: t.resolved_at || null,
      previsao: t.previsao_entrega || null,
      encerrado: ["fechado"].indexOf(String(t.status || "")) >= 0,
      linha_do_tempo: linha,
    },
  });
}
module.exports = { handler };
"""

ROTAS = [("POST", "/tickets/acompanhar", ACOMPANHAR, SEGREDO)]


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
    c, d = req(f"{MOD}/routes")
    existentes = {(r["method"], r["path"]) for r in d["routes"]} if c < 300 else set()

    for metodo, caminho, codigo, _ in ROTAS:
        arq = "/tmp/acomp_" + caminho.strip("/").replace("/", "_") + ".js"
        open(arq, "w").write(codigo)
        if subprocess.run(["node", "--check", arq]).returncode != 0:
            print(f"   ❌ sintaxe: {arq}")
            sys.exit(1)
        ja = (metodo, caminho) in existentes
        print(f"   {'↻' if ja else '→'} {metodo} {caminho}: {len(codigo)} chars (pública)")
        if not aplicar:
            continue
        c, r = req(f"{MOD}/routes", "PUT", {
            "method": metodo, "path": caminho, "controllerCode": codigo,
            "authMode": "webhook_secret", "webhookSecretName": SEGREDO,
        })
        if c >= 300:
            print(f"      ❌ HTTP {c} {r}")
            sys.exit(1)

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    c, r = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar tickets: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
