#!/usr/bin/env python3
# =============================================================================
# Espelho TEMPORÁRIO da rota de entrada, para testar o caminho sem o portão.
#
# A rota real (`POST /whatsapp/inbound`) é protegida por `webhook_secret`: a
# plataforma compara o `?token=` com o segredo do cofre ANTES de rodar o nosso
# código. O segredo é `serverOnly` e nunca volta — então não há como bater na
# rota real de fora para testar o que vem DEPOIS do portão.
#
# Este espelho é o mesmo controller, com duas diferenças:
#
#   - responde à chave de serviço (rota de diagnóstico, não é pública);
#   - a conferência de token vira `pular`, porque quem chega aqui já passou
#     pela credencial do app.
#
# Serve para responder três perguntas que o portão esconde:
#   1. o payload da Avisa é entendido? (evento de grupo → "ignorado", sem gravar)
#   2. o caminho grava? (evento 1:1 com número fictício → cria conversa)
#   3. quanto tempo leva? (o sandbox derruba em 15 s; varredura de tabela
#      grande é candidata natural a estourar)
#
#   python3 scripts/wa-inbound-espelho.py --instalar
#   python3 scripts/wa-inbound-espelho.py --grupo      # não grava nada
#   python3 scripts/wa-inbound-espelho.py --um-a-um    # grava; limpe depois
#   python3 scripts/wa-inbound-espelho.py --limpar     # apaga o que o teste criou
#   python3 scripts/wa-inbound-espelho.py --remover
# =============================================================================

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAMINHO = "/whatsapp/diagnostico/espelho"
LIMPEZA = "/whatsapp/diagnostico/limpar-teste"
# Número fictício, faixa que não existe em celular do Brasil (prefixo 0000).
FICTICIO = "5519000000001"


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

LIMPEZA_JS = """
// TEMPORÁRIO — scripts/wa-inbound-espelho.py. Apaga só o que o teste criou.
async function handler(ctx) {
  var alvo = "%s";
  var Conv = ctx.models.WhatsAppConversation;
  var Msg = ctx.models.WhatsAppMessage;
  var apagadas = 0, apagadasMsg = 0;
  var convs = (await Conv.findMany({})) || [];
  for (var i = 0; i < convs.length; i++) {
    var rj = String(convs[i].remote_jid || convs[i].remoteJid || "");
    if (rj.indexOf(alvo) < 0) continue;
    var msgs = (await Msg.findMany({ conversation_id: convs[i].id })) || [];
    for (var j = 0; j < msgs.length; j++) {
      if (String(msgs[j].conversation_id) !== String(convs[i].id)) continue;
      try { await Msg.delete(msgs[j].id); apagadasMsg++; } catch (e) {}
    }
    try { await Conv.delete(convs[i].id); apagadas++; } catch (e) {}
  }
  return ctx.reply.send({ success: true, data: { conversas: apagadas, mensagens: apagadasMsg } });
}
module.exports = { handler };
""" % FICTICIO


def req(url, metodo="GET", dados=None, cru=None, tipo=None):
    if cru is not None:
        corpo = cru
    else:
        corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = tipo or "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]


def publicar():
    c, d = req(MOD, "PATCH", {"status": "published"})
    print(f"→ publicar whatsapp: HTTP {c} {'' if c < 300 else d}")


def controller_espelho():
    """Pega o controller REAL e troca só a conferência de token."""
    c, d = req(f"{MOD}/routes")
    rota = [r for r in d["routes"] if r["path"] == "/whatsapp/inbound"][0]
    codigo = rota["controllerCode"]
    alvo = 'if (!esperado || String(recebido) !== String(esperado)) {'
    if alvo not in codigo:
        print("! a conferência de token mudou de forma; revise o script")
        sys.exit(1)
    novo = codigo.replace(
        alvo,
        "if (false) {  // ESPELHO: portão dispensado, ver scripts/wa-inbound-espelho.py",
    )
    return "// TEMPORÁRIO — espelho de /whatsapp/inbound. Remover ao terminar.\n" + novo


def evento(chat, texto, grupo=False, envelope=False):
    corpo = {"conversation": texto}
    if envelope:
        # Mensagem temporária: o texto desce um nível, dentro de `.message`.
        corpo = {"ephemeralMessage": {"message": {"conversation": texto}},
                 "messageContextInfo": {"deviceListMetadataVersion": 2}}
    payload = {
        "event": {
            "Info": {
                "Chat": chat,
                "ID": "teste_" + str(int(time.time())),
                "PushName": "Teste tecnico",
                "IsGroup": grupo,
                "IsFromMe": False,
                "SenderAlt": "5519000000001@s.whatsapp.net",
            },
            "Message": corpo,
        }
    }
    return urllib.parse.urlencode({"token": "dispensado", "jsonData": json.dumps(payload)}).encode()


def disparar(chat, grupo, envelope=False):
    corpo = evento(chat, "Teste tecnico do portal — ignore.", grupo, envelope)
    t0 = time.time()
    c, d = req(f"{API}/v1/r/portal-suporte{CAMINHO}", "POST", cru=corpo,
               tipo="application/x-www-form-urlencoded")
    print(f"HTTP {c} em {time.time() - t0:.1f}s")
    print(json.dumps(d, indent=2, ensure_ascii=False) if isinstance(d, dict) else d)


def main():
    if "--instalar" in sys.argv:
        c, d = req(f"{MOD}/routes", "PUT",
                   {"method": "POST", "path": CAMINHO, "controllerCode": controller_espelho()})
        print(f"→ espelho: HTTP {c} {'' if c < 300 else d}")
        c2, d2 = req(f"{MOD}/routes", "PUT",
                     {"method": "POST", "path": LIMPEZA, "controllerCode": LIMPEZA_JS})
        print(f"→ limpeza: HTTP {c2} {'' if c2 < 300 else d2}")
        publicar()
    elif "--grupo" in sys.argv:
        disparar("120363000000000000@g.us", True)
    elif "--um-a-um" in sys.argv:
        disparar(f"{FICTICIO}@s.whatsapp.net", False)
    elif "--lid" in sys.argv:
        # Reproduz o formato que chegou de verdade: Chat em @lid e o texto
        # embrulhado em ephemeralMessage — as duas coisas que o tradutor
        # antigo não entendia.
        disparar(f"{FICTICIO}@lid", False, envelope=True)
    elif "--limpar" in sys.argv:
        c, d = req(f"{API}/v1/r/portal-suporte{LIMPEZA}", "POST", {})
        print(f"HTTP {c}", json.dumps(d, ensure_ascii=False) if isinstance(d, dict) else d)
    elif "--remover" in sys.argv:
        # A API remove por id da rota, não por método+caminho.
        _, listagem = req(f"{MOD}/routes")
        ids = {(x["method"], x["path"]): x["id"] for x in listagem["routes"]}
        for p in (CAMINHO, LIMPEZA):
            rid = ids.get(("POST", p))
            if not rid:
                print(f"= {p}: já não existe")
                continue
            c, d = req(f"{MOD}/routes/{rid}", "DELETE")
            print(f"→ remover {p}: HTTP {c} {'' if c < 300 else d}")
        publicar()
    else:
        print(__doc__ or "use --instalar | --grupo | --um-a-um | --limpar | --remover")


if __name__ == "__main__":
    main()
