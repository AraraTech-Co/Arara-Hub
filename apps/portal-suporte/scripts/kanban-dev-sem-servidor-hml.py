#!/usr/bin/env python3
# =============================================================================
# Kanban Dev — a opção "Sem servidor HML".
#
# Pedido do Willian, decidido pelo Leonardo (29/10/2026): mover para Pronto p/
# Teste passa a aceitar "Sem servidor HML", e o card nessa situação não ocupa
# servidor nenhum.
#
# O CAMPO CONTINUA OBRIGATÓRIO: não escolher nada segue dando 400. O que entra é
# uma escolha explícita a mais, e não a ausência de escolha.
#
# ONDE O VALOR MORA: em `Ticket.environment`, como valor reservado
# (`sem-servidor-hml`), e não num campo novo. Mapeei os leitores do campo antes
# de decidir — um escritor (esta rota) e seis leitores, nenhum dando outro
# sentido ao campo. O motivo de não criar campo: dois campos podem se
# contradizer (`sem_servidor: true` com um slug de servidor ao lado), e esta
# camada não tem gravação condicional para impedir esse estado. Um campo só não
# se contradiz.
#
# A TRAVA DE OCUPAÇÃO PRECISA DE UMA EXCEÇÃO, e é o ponto delicado: dois cards
# "sem servidor" não disputam nada. Sem a exceção, o segundo card levaria um 400
# dizendo que o "servidor sem-servidor-hml" está em uso pelo primeiro.
#
#   python3 scripts/kanban-dev-sem-servidor-hml.py            # simula
#   python3 scripts/kanban-dev-sem-servidor-hml.py --aplicar
# =============================================================================

import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
ROTAS = os.path.abspath(os.path.join(
    AQUI, "..", "..", "..", "packages", "api", "src", "apps", "portal-suporte",
    "routes.generated.ts"))
TELA = os.path.join(AQUI, "..", "app", "lib", "servidores-hml.ts")
MARCA = "// 393 tickets POST /dev/tickets/:id/mover"

ANTIGO = '''      var hml = String(body.environment || "").trim();
      if (!hml || SERVIDORES_HML.indexOf(hml) < 0) {
        return ctx.reply.status(400).send({
          error: "Informe o servidor HML onde o código foi publicado para teste",
        });
      }
      var ocupantes = (await Ticket.findMany({})) || [];
      for (var oi = 0; oi < ocupantes.length; oi++) {'''

NOVO = '''      var hml = String(body.environment || "").trim();
      // A escolha continua OBRIGATORIA: nao mandar nada segue dando 400. O que
      // entra e uma escolha explicita a mais.
      if (!hml || (SERVIDORES_HML.indexOf(hml) < 0 && hml !== SEM_SERVIDOR_HML)) {
        return ctx.reply.status(400).send({
          error: "Informe o servidor HML onde o código foi publicado para teste, ou escolha sem servidor",
        });
      }
      // "Sem servidor" nao ocupa nada, e por isso nao disputa com ninguem: dois
      // cards nessa situacao conviveriam, e sem esta excecao o segundo levaria
      // um 400 dizendo que o servidor "sem-servidor-hml" esta em uso.
      var ocupantes = hml === SEM_SERVIDOR_HML ? [] : ((await Ticket.findMany({})) || []);
      for (var oi = 0; oi < ocupantes.length; oi++) {'''


def valor_reservado():
    """O valor reservado, lido da TELA — que é a fonte da lista."""
    texto = open(TELA, encoding="utf-8").read()
    m = re.search(r"export const SEM_SERVIDOR_HML = '([^']+)'", texto)
    if not m:
        raise SystemExit("! SEM_SERVIDOR_HML não encontrado em servidores-hml.ts")
    return m.group(1)


def literal(texto, at):
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
    return i, j + 1, json.loads(texto[i:j + 1])


def main():
    aplicar = "--aplicar" in sys.argv
    reservado = valor_reservado()
    texto = open(ROTAS, encoding="utf-8").read()
    if texto.count(MARCA) != 1:
        raise SystemExit(f"! a marca da 393 aparece {texto.count(MARCA)}x")
    i, j, cod = literal(texto, texto.index(MARCA))

    if "SEM_SERVIDOR_HML" in cod:
        print("   = já aplicado")
        return
    if cod.count(ANTIGO) != 1:
        raise SystemExit(f"! âncora aparece {cod.count(ANTIGO)}x na 393")

    # A constante entra ao lado da lista, que é onde ela pertence.
    alvo_lista = 'var STATUS_TRAVAM_HML = { pronto_para_teste: 1, em_testes: 1 };'
    if cod.count(alvo_lista) != 1:
        raise SystemExit(f"! âncora da lista aparece {cod.count(alvo_lista)}x")
    novo_cod = cod.replace(
        alvo_lista,
        f'var SEM_SERVIDOR_HML = "{reservado}";\n' + alvo_lista)
    novo_cod = novo_cod.replace(ANTIGO, NOVO)

    # O que a mudança promete, conferido e não suposto.
    if f'"{reservado}"' not in novo_cod:
        raise SystemExit("! o valor reservado não entrou")
    if novo_cod.index("var SEM_SERVIDOR_HML") > novo_cod.index("hml !== SEM_SERVIDOR_HML"):
        raise SystemExit("! a constante ficaria declarada depois do uso")
    if f"'{reservado}'" in novo_cod or f'"{reservado}"' in novo_cod.split("var SEM_SERVIDOR_HML")[0]:
        raise SystemExit("! o valor reservado aparece solto, fora da constante")

    novo = texto[:i] + json.dumps(novo_cod) + texto[j:]
    if not aplicar:
        print(f"   → poria a opção na 393 ({len(cod)} → {len(novo_cod)} chars)")
        print(f"   → valor reservado lido da tela: {reservado}")
        print("\n   (simulação — use --aplicar)")
        return
    open(ROTAS, "w", encoding="utf-8").write(novo)
    print("→ opção 'sem servidor' aplicada na 393")


if __name__ == "__main__":
    main()
