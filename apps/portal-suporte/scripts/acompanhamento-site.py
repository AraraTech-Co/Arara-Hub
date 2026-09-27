#!/usr/bin/env python3
# =============================================================================
# Acompanhamento do cliente — quem abre pelo SITE também recebe o código.
#
# O aviso de abertura existia só para chamado nascido pelo WhatsApp
# (scripts/acompanhamento-whatsapp.py). Quem preenchia o formulário do site
# ficava sem número e sem código: abria o chamado e não tinha como acompanhar.
#
# E havia um furo silencioso antes disso — o formulário PEDIA o telefone e não
# o enviava, e o `Ticket` nem tinha onde guardá-lo. O dado era digitado pela
# pessoa e descartado no caminho.
#
# Este script:
#   1. cria `Ticket.contact_phone` — o número que o cliente informou, que serve
#      ao atendimento independentemente do código;
#   2. em `POST /tickets`, gera o código de acompanhamento quando há telefone;
#   3. envia a mensagem com número do chamado + código, e REGISTRA o desfecho
#      no histórico do próprio chamado.
#
# O alfabeto, a validade e o tratamento do nono dígito são os MESMOS do aviso
# por WhatsApp — de propósito. Duas regras de token seria a próxima confusão.
#
# O envio nunca derruba a criação: chamado criado e não avisado é ruim; chamado
# que deixou de existir porque o WhatsApp falhou é muito pior.
#
#   python3 scripts/acompanhamento-site.py            # simula
#   python3 scripts/acompanhamento-site.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/acompanhamento-site.py"


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
MOD = f"{APP}/modules/tickets"

AJUDANTES = '''
// ── %(marca)s ──────────────────────────────────
// Mesmo alfabeto e mesma validade do aviso por WhatsApp
// (scripts/acompanhamento-whatsapp.py). Duas regras de token seria a próxima
// confusão: o cliente que abre pelos dois caminhos veria comportamentos
// diferentes para a mesma coisa.
var _ALFABETO_SITE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function _gerarCodigoSite() {
  // ⚠️ MESMA DÍVIDA do aviso por WhatsApp: o sandbox não tem `crypto` e
  // `Math.random` no V8 é xorshift128+ — quem coleta alguns códigos calcula os
  // próximos. Pedido em docs/pedido-hefler-aleatoriedade-sandbox.md; quando
  // `ctx.randomBytes` existir, trocar as DUAS funções.
  var s = "";
  for (var i = 0; i < 6; i++) {
    s += _ALFABETO_SITE.charAt(Math.floor(Math.random() * _ALFABETO_SITE.length));
  }
  return s;
}

/** Normaliza o que a pessoa digitou no formulário para o formato do provedor. */
function _numeroDoFormulario(bruto) {
  var d = String(bruto || "").replace(/\\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  if (d.length === 12 || d.length === 13) return d;
  return "";
}

async function _avisarAberturaSite(ctx, ticket) {
  var desfecho = { etapa: "inicio" };
  var destino = String(ticket.acomp_whatsapp || "");
  try {
    if (!destino || destino.length < 12) { desfecho.etapa = "sem_numero"; return desfecho; }
    var token = await ctx.secrets.get("whatsapp_token");
    if (!token || !ctx.fetch) { desfecho.etapa = "sem_token"; return desfecho; }

    var texto = "Seu chamado foi aberto: " + String(ticket.ticket_number || "") + "\\n\\n"
      + "Para acompanhar o andamento, acesse:\\n"
      + "https://suporte.arara-tech.com/acompanhar\\n\\n"
      + "Use o código: " + String(ticket.acomp_codigo || "") + "\\n\\n"
      + "Guarde esta mensagem — o código é só deste chamado.";

    // Conta registrada antes do nono dígito existe SEM ele, e de fora não dá
    // para saber qual variante a pessoa usa. Tenta as duas e para na primeira
    // aceita (mesma lição de scripts/senha-recuperacao-nono-digito.py).
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
  return desfecho;
}
''' % {"marca": MARCA}

# 1) campos do acompanhamento no corpo, antes de criar
DE_CRIA = '''      body.ticket_number = await allocateTicketNumber(model, Seq);
      const row = await model.create(body);'''
PARA_CRIA = '''      body.ticket_number = await allocateTicketNumber(model, Seq);
      // ── Acompanhamento pelo cliente (%(marca)s) ──
      // Só quando há telefone: sem número não há para onde mandar o código, e
      // gerar um que ninguém recebe só enche o registro.
      //
      // `acomp_expira_em` é um TETO distante (1 ano). A regra de verdade — vale
      // enquanto aberto, e mais 7 dias depois de fechar — é conferida na
      // LEITURA, em POST /tickets/acompanhar. Assim não é preciso um gancho no
      // fechamento, e um chamado que fique meses aberto não perde o acesso.
      var _fone = _numeroDoFormulario(body.contact_phone);
      if (_fone && !body.acomp_codigo) {
        body.acomp_whatsapp = _fone;
        body.acomp_codigo = _gerarCodigoSite();
        body.acomp_expira_em = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        body.acomp_tentativas = 0;
        body.acomp_bloqueado_ate = "";
      }
      const row = await model.create(body);''' % {"marca": MARCA}

# 2) envio depois de criado, sem derrubar a criação
DE_RET = '''      return ctx.reply.status(201).send({ data: row });'''
PARA_RET = '''      // ── Aviso de abertura (%(marca)s) ──
      // Fora do try da criação de propósito: o chamado já existe e a resposta
      // não pode depender do provedor de WhatsApp. O desfecho vira registro no
      // histórico do chamado — 200 do provedor NÃO é prova de entrega, mas sem
      // registro nenhum a falha fica invisível, que é como o caso do André
      // passou semanas escondido.
      if (row && row.acomp_codigo) {
        try {
          var _d = await _avisarAberturaSite(ctx, row);
          if (Log) {
            await Log.create({
              ticket_id: row.id,
              user_id: null,
              action: "acompanhamento_aviso",
              details: {
                desfecho: _d,
                destino: String(row.acomp_whatsapp || "").slice(0, 4) + "…" + String(row.acomp_whatsapp || "").slice(-2),
              },
              created_at: new Date().toISOString(),
              visible_to_client: false,
            });
          }
        } catch (e) {}
      }
      return ctx.reply.status(201).send({ data: row });''' % {"marca": MARCA}


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


def novo_controller(codigo):
    if MARCA in codigo:
        return None
    for de in (DE_CRIA, DE_RET):
        if de not in codigo:
            return False
    novo = codigo.replace(DE_CRIA, PARA_CRIA).replace(DE_RET, PARA_RET)
    # ajudantes entram antes do handler
    alvo = "async function handler(ctx)"
    return novo.replace(alvo, AJUDANTES + "\n" + alvo, 1)


def main():
    aplicar = "--aplicar" in sys.argv

    # ── 1. Campo contact_phone ───────────────────────────────────────────────
    _, d = req(f"{APP}/models")
    modelo = next(m for m in d["models"] if m["name"].endswith("-Ticket"))
    props = dict(modelo["schema"].get("properties", {}))
    if "contact_phone" in props:
        print("   = Ticket.contact_phone: já existe")
    else:
        print(f"   {'→' if aplicar else ' '} Ticket.contact_phone: criar")
        if aplicar:
            props["contact_phone"] = {"type": "string"}
            c, r = req(f"{APP}/models/{modelo['name']}", "PATCH",
                       {"schema": {"type": "object", "properties": props}})
            print(f"      HTTP {c} {'' if c < 300 else r}")
            if c >= 300:
                sys.exit(1)

    # ── 2. POST /tickets ─────────────────────────────────────────────────────
    c, d = req(f"{MOD}/routes")
    if c >= 300:
        print(f"❌ HTTP {c}")
        sys.exit(1)
    rota = next((r for r in d["routes"] if (r["method"], r["path"]) == ("POST", "/tickets")), None)
    if not rota:
        print("❌ POST /tickets não existe")
        sys.exit(1)

    novo = novo_controller(rota["controllerCode"] or "")
    if novo is None:
        print("   = POST /tickets: já avisa")
        return
    if novo is False:
        print("   ! POST /tickets: assinatura inesperada — nada feito")
        sys.exit(1)

    print(f"   {'→' if aplicar else ' '} POST /tickets: gerar código e avisar quando houver telefone")
    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    corpo = {"method": "POST", "path": "/tickets", "controllerCode": novo}
    for extra in ("authMode", "webhookSecretName"):
        if rota.get(extra):
            corpo[extra] = rota[extra]
    cc, resp = req(f"{MOD}/routes", "PUT", corpo)
    if cc >= 300:
        print(f"      ❌ HTTP {cc} {resp}")
        sys.exit(1)
    cc, resp = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar tickets: HTTP {cc} {'' if cc < 300 else resp}")


if __name__ == "__main__":
    main()
