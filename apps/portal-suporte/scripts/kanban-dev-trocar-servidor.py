#!/usr/bin/env python3
# =============================================================================
# Kanban Dev — trocar o servidor HML de um card já em teste.
#
# Pedido do Willian, decidido pelo Leonardo (29/10/2026). Hoje o servidor só é
# escolhido na passagem para Pronto p/ Teste; quem errou a escolha, ou precisa
# liberar a máquina, não tem como mudar sem mover o card para trás.
#
# O PRELÚDIO VEM DA 393, LITERALMENTE.
#
# A rota precisa da mesma identidade, da mesma permissão e da MESMA lista de
# servidores da rota de mover. Escrever isso de novo criaria a terceira cópia da
# lista (a primeira está na tela, a segunda na 393) — e lista repetida é a que
# fica para trás quando um servidor entra. Então o gerador RECORTA o prelúdio e
# a guarda de sessão do literal da 393 e os reusa sem tocar.
#
# O que é próprio desta rota: a conferência de coluna, a de ocupação, a troca e
# o histórico.
#
#   python3 scripts/kanban-dev-trocar-servidor.py            # simula
#   python3 scripts/kanban-dev-trocar-servidor.py --sync-routes
# =============================================================================

import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
ROTAS = os.path.abspath(os.path.join(
    AQUI, "..", "..", "..", "packages", "api", "src", "apps", "portal-suporte",
    "routes.generated.ts"))
MARCA_393 = "// 393 tickets POST /dev/tickets/:id/mover"
MARCA = "scripts/kanban-dev-trocar-servidor.py"
CAMINHO = "/dev/tickets/:id/servidor-hml"

CORPO = r'''
async function handler(ctx) {
  var Ticket = ctx.models.Ticket;
  var Log = ctx.models.ActivityLog;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });

  // A MESMA porta da rota de mover: trocar o servidor de um card é mexer no
  // card, e quem não pode mover não pode trocar.
  var eu = await _perfilDe(ctx);
  if (!eu.servico && eu.nivel < _RANK.developer) {
    return ctx.reply.status(403).send({ error: "Mover card do quadro Dev exige nível developer" });
  }

  var id = ctx.params.id;
  var body = ctx.body || {};
  var card = await Ticket.findById(id);
  if (!card) return ctx.reply.status(404).send({ error: "Ticket not found" });
  if (String(card.quadro || "suporte") !== "dev") {
    return ctx.reply.status(400).send({ error: "Este card não é do quadro Dev" });
  }

  // Só faz sentido onde o servidor está reservado. Fora destas colunas o campo
  // não significa nada, e deixar trocar daria a impressão de que significa.
  if (!STATUS_TRAVAM_HML[String(card.status || "")]) {
    return ctx.reply.status(400).send({
      error: "O servidor HML só pode ser trocado com o card em Pronto p/ Teste ou Em Testes",
    });
  }

  var novo = String(body.environment || "").trim();
  if (!novo || (SERVIDORES_HML.indexOf(novo) < 0 && novo !== SEM_SERVIDOR_HML)) {
    return ctx.reply.status(400).send({
      error: "Informe o servidor HML, ou escolha sem servidor",
    });
  }

  var atual = String(card.environment || "");
  // Valor igual NÃO grava: regravar o mesmo dado mexeria no `updated_at` e
  // encheria o histórico de troca que não aconteceu.
  if (novo === atual) {
    return ctx.reply.send({ success: true, data: card, mudou: false });
  }

  // "Sem servidor" não ocupa nada, e por isso não disputa com ninguém.
  if (novo !== SEM_SERVIDOR_HML) {
    var outros = (await Ticket.findMany({})) || [];
    for (var i = 0; i < outros.length; i++) {
      var o = outros[i];
      if (String(o.id) === String(id)) continue;
      if (String(o.quadro || "suporte") !== "dev") continue;
      if (!STATUS_TRAVAM_HML[String(o.status || "")]) continue;
      if (String(o.environment || "") !== novo) continue;
      return ctx.reply.status(400).send({
        error: "O servidor HML '" + novo + "' já está em uso pelo card "
          + (o.ticket_number || o.id) + " (" + String(o.status) + ")",
      });
    }
  }

  var agora = new Date().toISOString();
  // O servidor ANTIGO fica livre sem nenhuma gravação: a ocupação é derivada
  // de quem está nas colunas de teste com aquele valor, e este card deixou de
  // estar com ele.
  var row = await Ticket.update(id, { environment: novo, updated_at: agora });

  try {
    if (Log) {
      await Log.create({
        ticket_id: id, user_id: eu.id,
        action: "status_changed",
        details: { campo: "environment", from: atual || null, to: novo, origem: "kanban_dev_servidor_hml" },
        created_at: agora, visible_to_client: false,
      });
    }
  } catch (e) {}

  return ctx.reply.send({ success: true, data: row || Object.assign({}, card, { environment: novo }), mudou: true });
}
'''


def literal_393(texto):
    at = texto.index(MARCA_393)
    abre = texto.index("compileController(", at)
    i = texto.index('"', abre)
    j = i + 1
    while True:
        if texto[j] == "\\":
            j += 2
            continue
        if texto[j] == '"':
            break
        j += 1
    return json.loads(texto[i:j + 1])


def pedacos(cod393):
    """Prelúdio e guarda de sessão, recortados do literal da 393."""
    corte = cod393.index("async function handler(ctx) {")
    prel = cod393[:corte]
    marca_guarda = "// ── Guarda de sessão"
    if cod393.count(marca_guarda) != 1:
        raise SystemExit(f"! a marca da guarda aparece {cod393.count(marca_guarda)}x na 393")
    guarda = cod393[cod393.index(marca_guarda):]
    for exigido in ("var SERVIDORES_HML", "var STATUS_TRAVAM_HML", "var SEM_SERVIDOR_HML",
                    "async function _perfilDe", "var _RANK"):
        if exigido not in prel:
            raise SystemExit(f"! o prelúdio da 393 não tem {exigido!r}")
    if "_gsComSessao" not in guarda or "module.exports" not in guarda:
        raise SystemExit("! a guarda recortada não exporta o handler embrulhado")
    if "async function handler" in guarda:
        raise SystemExit("! o recorte da guarda levou o handler da 393")
    return prel, guarda


def entrada(cod):
    """A entrada SEM vírgula no fim: ela entra como último elemento do array, e
    o arquivo gerado termina em `  }` + `]` — a forma que o teste de estrutura
    exige. Virgula sobrando ali foi defeito meu numa entrega anterior."""
    return (
        '  // 511 tickets PATCH %s (%s)\n'
        '  {\n'
        '    module: "tickets",\n'
        '    method: "PATCH",\n'
        '    path: "%s",\n'
        '    authMode: "actor",\n'
        '    webhookSecretName: null,\n'
        '    requiredPermissions: [],\n'
        '    source: "%s",\n'
        '    handler: compileController(%s),\n'
        '  }'
    ) % (CAMINHO, MARCA, CAMINHO, MARCA, json.dumps(cod))


def main():
    sync = "--sync-routes" in sys.argv
    texto = open(ROTAS, encoding="utf-8").read()
    total = texto.count('\n    method: "')

    if MARCA in texto:
        print("   = rota já registrada — regravando")
        i = texto.index("  // 511 tickets PATCH")
        # Duas formas possíveis, e a segunda é a normal: quando esta entrada é a
        # ÚLTIMA do array ela termina sem vírgula, e aí quem perde a vírgula é
        # o elemento anterior. Supor sempre a vírgula quebrava a regravação.
        com_virgula = texto.find("\n  },\n", i)
        ultima = texto.find("\n  }\n]", i)
        if ultima >= 0 and (com_virgula < 0 or ultima < com_virgula):
            bloco = texto[i:ultima + len("\n  }\n")]
            if bloco.count('\n    method: "') != 1:
                raise SystemExit("! o recorte da rota antiga pegaria mais de uma entrada")
            antes = texto[:i]
            if not antes.endswith("  },\n"):
                raise SystemExit(f"! o elemento anterior não termina em vírgula: {antes[-20:]!r}")
            texto = antes[: -len("  },\n")] + "  }\n" + texto[ultima + len("\n  }\n"):]
        else:
            j = com_virgula + len("\n  },\n")
            if texto[i:j].count('\n    method: "') != 1:
                raise SystemExit("! o recorte da rota antiga pegaria mais de uma entrada")
            texto = texto[:i] + texto[j:]
        total = texto.count('\n    method: "')

    prel, guarda = pedacos(literal_393(texto))
    cod = prel + CORPO.lstrip("\n") + "\n" + guarda
    # O que a geração promete, conferido e não suposto.
    if cod.count("var SERVIDORES_HML") != 1:
        raise SystemExit("! a lista de servidores apareceria mais de uma vez")
    if "STATUS_TRAVAM_HML[String(card.status" not in cod:
        raise SystemExit("! a conferência de coluna não entrou")
    if cod.index("_perfilDe(ctx)") > cod.index("Ticket.update(id,"):
        raise SystemExit("! a permissão ficaria depois da gravação")

    # A entrada entra no FIM do array, onde o casador de rotas a alcança sem
    # roubar caminho de ninguém (menos parâmetros ganha; empate pela ordem).
    #
    # O último elemento NÃO tem vírgula, então ela é acrescentada ao que era o
    # último e a nova entrada passa a ser a sem vírgula.
    fim = "\n  }\n]"
    if texto.count(fim) != 1:
        raise SystemExit(f"! o fecho do array aparece {texto.count(fim)}x")
    fecha = texto.rindex(fim)
    novo = texto[:fecha] + "\n  },\n" + entrada(cod) + "\n]" + texto[fecha + len(fim):]
    if novo.count('\n    method: "') != total + 1:
        raise SystemExit(f"! o total ficou {novo.count(chr(10) + '    method: ')}, esperado {total + 1}")

    if not sync:
        print(f"   → registraria PATCH {CAMINHO} ({len(cod)} chars)")
        print(f"   → {total} → {total + 1} rotas")
        print("\n   (simulação — use --sync-routes)")
        return
    open(ROTAS, "w", encoding="utf-8").write(novo)
    print(f"→ PATCH {CAMINHO} registrada ({total} → {total + 1} rotas)")


if __name__ == "__main__":
    main()
