#!/usr/bin/env python3
# Vincular a conversa a um chamado que já existe (PRD 06).
#
#   GET  /whatsapp/:id/chamados-vinculaveis  — candidatos, escopo do servidor
#   POST /whatsapp/:id/ticket/vincular       — grava o vínculo
#
# Sync local: python3 scripts/chamado-vincular.py --sync-routes
#
# Nenhum dos dois fontes é escrito aqui inteiro: os dois são COPIADOS do
# `POST /whatsapp/:id/ticket` e só o corpo de `async function handler` é
# trocado. É de propósito — a trava de conta, a guarda de sessão e o controle
# de acesso por nível ficam byte a byte iguais aos da rota irmã, que é a que
# hoje liga conversa e chamado, em vez de reescritos (e esquecidos) aqui.
# =============================================================================

import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = os.path.normpath(
    os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
)
MARCA = "scripts/chamado-vincular.py"
IRMA = 'path: "/whatsapp/:id/ticket",'

# O escopo dos dois handlers sai da CONVERSA, no servidor. Quem chama não
# escolhe de quem são os chamados que vai ver nem a qual pode vincular: a
# conversa diz a empresa (ou, sem empresa, o cliente), e nada fora disso entra.
AJUDANTES = r"""
  // "Encerrado" não tem UM critério no servidor: `POST /tickets/acompanhar` usa
  // os seis status abaixo (TERMINAIS), enquanto `PATCH /tickets/:id/assign` e o
  // relógio de auto-fechamento usam só os três `resolvido*`. Aqui vale o mais
  // largo, que é o mesmo da tela (app/lib/ticket-status.ts, RESOLVED_STATUSES):
  // o pedido é vincular ao chamado que AINDA está pendente.
  var _ENCERRADOS = {
    resolvido: 1,
    resolvido_com_manual: 1,
    resolvido_sem_manual: 1,
    post_mortem: 1,
    cancelado: 1,
    fechado: 1,
  };
  function _encerrado(t) {
    if (!t) return false;
    if (t.is_archived || t.isArchived) return true;
    return !!_ENCERRADOS[String(t.status || "")];
  }
  // Card do quadro de Dev é o MESMO model, com `quadro: "dev"` e um vocabulário
  // de status próprio (app/lib/kanban-dev.ts: `aplicado_no_cliente`,
  // `descartado`…), que `_ENCERRADOS` não cobre. Conversa de WhatsApp é do
  // suporte, então card de Dev não entra — nem na lista, nem no vínculo. O
  // idioma é o das rotas de chamado: sem `quadro`, é suporte.
  function _ehDoDev(t) {
    return !!t && String(t.quadro || "suporte") === "dev";
  }
"""

LISTAR = r"""async function handler(ctx) {
  // scripts/chamado-vincular.py — candidatos para vincular (PRD 06)
""" + AJUDANTES + r"""
  var m = model(ctx);
  if (!m.Conv || !m.Ticket) return fail(ctx, 500, "Models missing");
  var id = ctx.params.id;
  var conv = await m.Conv.findById(id);
  var _barrado = await _barrarPorConta(ctx, conv);
  if (_barrado) return _barrado;
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");

  // Sem empresa e sem cliente não há escopo que se possa provar, e a resposta
  // é lista VAZIA — nunca "todos os chamados".
  var _empresa = conv.company_id || conv.companyId || null;
  var _cliente = conv.client_user_id || conv.clientUserId || null;
  if (!_empresa && !_cliente) return ok(ctx, []);

  // A leitura pagina com `limit`/`offset`: a camada devolve no máximo 500 por
  // chamada, da mais nova para a mais velha
  // (packages/api/src/lib/models.ts, ORDER BY created_at DESC LIMIT/OFFSET).
  // O filtro de empresa/cliente vai NA plataforma, com o nome de campo que os
  // gravadores usam (snake_case).
  var _PAGINA = 500;
  var _MAX_PAGINAS = 20;
  var _linhas = [];
  for (var _k = 0; _k < _MAX_PAGINAS; _k++) {
    var _f = { limit: _PAGINA, offset: _k * _PAGINA };
    if (_empresa) _f.company_id = _empresa;
    else _f.client_user_id = _cliente;
    var _pag;
    try {
      _pag = (await m.Ticket.findMany(_f)) || [];
    } catch (_e) {
      // Lista cortada parece lista completa na tela: o atendente concluiria
      // que não há chamado para vincular e abriria outro, duplicado.
      return fail(ctx, 503, "Não foi possível listar os chamados deste cliente. Tente de novo.");
    }
    for (var _j = 0; _j < _pag.length; _j++) _linhas.push(_pag[_j]);
    if (_pag.length < _PAGINA) break;
    if (_k === _MAX_PAGINAS - 1) {
      return fail(ctx, 503, "Não foi possível listar os chamados deste cliente. Tente de novo.");
    }
  }

  var _meu = String(conv.ticket_id || conv.ticketId || "");
  var _cands = [];
  for (var _i = 0; _i < _linhas.length; _i++) {
    var _t = _linhas[_i];
    if (_meu && String(_t.id) === _meu) continue;
    if (_ehDoDev(_t)) continue;
    if (_encerrado(_t)) continue;
    _cands.push(_t);
  }
  _cands.sort(function (a, b) {
    var ta = String(a.created_at || a.createdAt || "");
    var tb = String(b.created_at || b.createdAt || "");
    if (ta === tb) return 0;
    return ta < tb ? 1 : -1;
  });

  // Só o que a janela desenha. Descrição, anexo e histórico do chamado não
  // saem por aqui: esta rota é para ESCOLHER um chamado, não para ler um.
  var _saida = [];
  for (var _s = 0; _s < _cands.length && _s < 20; _s++) {
    var _c = _cands[_s];
    _saida.push({
      id: _c.id,
      ticket_number: _c.ticket_number || _c.ticketNumber || null,
      title: _c.title || null,
      status: _c.status || null,
      created_at: _c.created_at || _c.createdAt || null,
    });
  }
  return ok(ctx, _saida);
}"""

VINCULAR = r"""async function handler(ctx) {
  // scripts/chamado-vincular.py — grava o vínculo (PRD 06)
""" + AJUDANTES + r"""
  var m = model(ctx);
  if (!m.Conv || !m.Ticket) return fail(ctx, 500, "Models missing");
  var id = ctx.params.id;
  var conv = await m.Conv.findById(id);
  var _barrado = await _barrarPorConta(ctx, conv);
  if (_barrado) return _barrado;
  if (!conv) return fail(ctx, 404, "Conversa não encontrada");
  // Mesma recusa da rota irmã: trocar o chamado de uma conversa que já tem um
  // apagaria o vínculo anterior sem deixar rastro na tela.
  if (conv.ticket_id || conv.ticketId) return fail(ctx, 409, "Conversa já possui chamado");

  var _body = ctx.body || {};
  var _tid = String(_body.ticketId || _body.ticket_id || "").trim();
  if (!_tid) return fail(ctx, 400, "ticketId obrigatório");
  var _t = await m.Ticket.findById(_tid);
  if (!_t) return fail(ctx, 404, "Chamado não encontrado");
  // A lista da janela não protege nada: quem chama a rota escolhe o `ticketId`.
  // Então as duas exclusões da listagem são conferidas AQUI também.
  if (_ehDoDev(_t)) return fail(ctx, 409, "Este chamado é do quadro de Dev");
  if (_encerrado(_t)) return fail(ctx, 409, "Este chamado já está encerrado");

  // ── A guarda que importa: o chamado tem de ser do cliente DESTA conversa ──
  // Sem ela, um id de chamado qualquer vinculava, e o painel do contato passava
  // a mostrar número, título e status de chamado de outro cliente, com link
  // para abrir. O escopo sai da conversa, nunca do corpo do pedido.
  var _empresa = conv.company_id || conv.companyId || null;
  var _cliente = conv.client_user_id || conv.clientUserId || null;
  if (!_empresa && !_cliente) {
    return fail(ctx, 409, "Esta conversa não tem cliente identificado. Identifique o contato antes de vincular.");
  }
  var _tEmpresa = _t.company_id || _t.companyId || null;
  var _tCliente = _t.client_user_id || _t.clientUserId || null;
  var _mesmo = _empresa
    ? String(_tEmpresa || "") === String(_empresa)
    : String(_tCliente || "") === String(_cliente);
  if (!_mesmo) return fail(ctx, 403, "Este chamado é de outro cliente");

  var ts = nowIso();
  var me = userId(ctx);
  // Só o vínculo. Status, fase e dono da conversa não mudam, e o chamado não é
  // tocado: encerrar a conversa continua não resolvendo o chamado, e vincular
  // não reabre nem reclassifica nada.
  await m.Conv.update(id, { ticket_id: _t.id, updated_at: ts });

  // Mesmo formato do `ticket_created` que a rota irmã grava, para o histórico
  // do chamado dizer que uma segunda conversa foi ligada a ele. Dentro de
  // try/catch e sem derrubar o vínculo: vínculo feito e não registrado é ruim;
  // vínculo que deixou de existir porque o histórico falhou é pior.
  try {
    var _Log = ctx.models.ActivityLog;
    if (_Log) {
      await _Log.create({
        ticket_id: _t.id,
        user_id: me || null,
        action: "ticket_linked",
        details: {
          ticket_number: _t.ticket_number || _t.ticketNumber || null,
          origem: "whatsapp",
          conversation_id: String(id),
        },
        created_at: ts,
        visible_to_client: false,
      });
    }
  } catch (_e) {}

  return ok(ctx, { id: _t.id, ticket_number: _t.ticket_number || _t.ticketNumber || null });
}"""

NOVAS = [
    ("GET", 'path: "/whatsapp/:id/chamados-vinculaveis",', LISTAR),
    ("POST", 'path: "/whatsapp/:id/ticket/vincular",', VINCULAR),
]


def _fonte_da_irma(text):
    """Devolve o fonte decodificado do literal da rota POST /whatsapp/:id/ticket."""
    if text.count(IRMA) != 1:
        print(f"! rota irmã aparece {text.count(IRMA)}x — nada feito")
        sys.exit(1)
    pos = text.find(IRMA)
    ini = text.find("handler: compileController(", pos)
    if ini < 0:
        print("! handler da rota irmã não encontrado — nada feito")
        sys.exit(1)
    fim = text.find("\n", ini)
    linha = text[ini:fim]
    lit = linha[len("handler: compileController("):].rstrip().rstrip(",")
    if not lit.endswith(")"):
        print("! literal da rota irmã em formato inesperado — nada feito")
        sys.exit(1)
    return json.loads(lit[:-1])


def _trocar_handler(fonte, novo):
    """Troca SÓ o corpo de `async function handler`, casando as chaves."""
    marca = "async function handler(ctx) {"
    if fonte.count(marca) != 1:
        print(f"! {fonte.count(marca)} `async function handler` no fonte da irmã — nada feito")
        sys.exit(1)
    ini = fonte.find(marca)
    nivel = 0
    i = ini + len(marca) - 1
    fim = -1
    while i < len(fonte):
        if fonte[i] == "{":
            nivel += 1
        elif fonte[i] == "}":
            nivel -= 1
            if nivel == 0:
                fim = i + 1
                break
        i += 1
    if fim < 0:
        print("! chave do handler da irmã não fecha — nada feito")
        sys.exit(1)
    return fonte[:ini] + novo + fonte[fim:]


def sync_routes():
    text = open(ROUTES, encoding="utf-8").read()
    fonte = _fonte_da_irma(text)
    feitas = 0
    for metodo, rota, corpo in NOVAS:
        if rota in text:
            print(f"= {metodo} {rota} já presente")
            continue
        esc = json.dumps(_trocar_handler(fonte, corpo), ensure_ascii=False)
        bloco = (
            '  // whatsapp ' + metodo + ' ' + rota[len('path: "'):-2] + ' (' + MARCA + ')\n'
            '  {\n'
            '    module: "whatsapp",\n'
            '    method: "' + metodo + '",\n'
            '    ' + rota + '\n'
            '    authMode: "actor",\n'
            '    webhookSecretName: null,\n'
            '    requiredPermissions: [],\n'
            '    source: "local-scripts/chamado-vincular.py",\n'
            '    handler: compileController(' + esc + '),\n'
            '  },\n'
        )
        # Entra logo DEPOIS do bloco da irmã: a âncora é o fecho dele.
        pos = text.find(IRMA)
        fecho = text.find("\n  },\n", pos)
        if fecho < 0:
            print("! fim do bloco da rota irmã não encontrado — nada feito")
            sys.exit(1)
        corte = fecho + len("\n  },\n")
        text = text[:corte] + bloco + text[corte:]
        feitas += 1
    if feitas:
        open(ROUTES, "w", encoding="utf-8").write(text)
        print(f"✓ {feitas} rota(s) em routes.generated.ts")


if __name__ == "__main__":
    if "--sync-routes" in sys.argv:
        sync_routes()
    else:
        print("Use --sync-routes")
