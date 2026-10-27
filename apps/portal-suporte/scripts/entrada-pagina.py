#!/usr/bin/env python3
# A entrada do WhatsApp lê as conversas PAGINANDO, nas duas leituras.
#
# Sync local: python3 scripts/entrada-pagina.py --sync-routes
#
# Troca duas linhas do handler de POST /whatsapp/inbound e acrescenta um ajudante
# no topo do módulo:
#
#   var all = await Conv.findMany({});                                (caminho da mensagem)
#   try { todas = (await Conv.findMany({})) || []; } catch (e) {}     (rodízio)
#
# A camada devolve no máximo 500 por chamada, da mais nova para a mais velha
# (packages/api/src/lib/models.ts: ORDER BY created_at DESC LIMIT/OFFSET), e
# aceita `limit`/`offset` como paginação de verdade. Com uma chamada só, as duas
# leituras viam apenas as 500 conversas mais novas de TODAS: a primeira deixava
# de achar a conversa do contato (a mensagem criava duplicada, e a reabertura de
# 7 dias não achava a fechada), e a segunda contava a menos as conversas abertas
# de cada atendente, entregando conversa a quem já estava no teto.
#
# O ajudante vai no TOPO DO MÓDULO, e não dentro do handler: as duas leituras
# estão em funções diferentes, e declarar dentro de uma delas deixa a outra com
# `_todasAsConversas is not defined` — que no rodízio seria engolido pelo
# `catch`, fazendo a conta de abertas dar ZERO e entregar conversa a todo mundo.
# Pior do que o defeito que este script conserta. Por isso recebe `ctx`.
#
# A edição é ancorada e idempotente: cada âncora tem de aparecer exatamente uma
# vez, senão nada é escrito.
# =============================================================================

import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = os.path.normpath(
    os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
)
MARCA = "485 whatsapp POST /whatsapp/inbound"
CARIMBO = "scripts/entrada-pagina.py"

ANCORA_TOPO = "async function handler(ctx) {"
ANCORA_MSG = "  var all = await Conv.findMany({});\n"
ANCORA_RODIZIO = "    try { todas = (await Conv.findMany({})) || []; } catch (e) {}\n"

NOVO_TOPO = r"""// ── Leitura paginada das conversas (scripts/entrada-pagina.py) ─────────────
//
// A camada devolve no máximo 500 por chamada, da mais nova para a mais velha
// (packages/api/src/lib/models.ts), e `limit`/`offset` paginam de verdade;
// `take`/`skip` não, que a camada trata como filtro de campo. As duas leituras
// de conversas desta rota passam por aqui.
async function _diagPaginaConversas(ctx, _falha, _lidas) {
  // Mesmo critério das outras sondas desta rota: conta antes e só grava
  // enquanto houver menos de 6; se a CONTAGEM falhar, não grava. Sonda
  // silenciosa é aceitável, sonda que grava sem limite não — ela viraria carga
  // justamente quando o banco está pior.
  try {
    var _EvP = ctx.models.WaConversationEvents;
    if (!_EvP) return;
    var _jaTemP = null;
    try {
      _jaTemP = (await _EvP.findMany({ kind: "diag_pagina_conversas" })) || [];
    } catch (_e) {
      return;
    }
    var _qtdP = _jaTemP.filter(function (e) { return e.kind === "diag_pagina_conversas"; }).length;
    if (_qtdP >= 6) return;
    await _EvP.create({
      id: "dpc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      conversation_id: "diagnostico",
      kind: "diag_pagina_conversas",
      payload: JSON.stringify({ pagina: _falha.pagina, erro: _falha.erro, lidas: _lidas }).slice(0, 900),
      created_at: new Date().toISOString(),
    });
  } catch (_e) {}
}
// `_toleraPrimeira` é a única diferença entre as duas leituras desta rota.
//
// Varredura incompleta NÃO derruba o caminho da mensagem: mensagem de cliente
// perdida é pior que varredura curta, então página que falha no meio, ou teto de
// páginas atingido, seguem com o que já foi lido e registram a falha.
//
// Mas a PRIMEIRA página é outra coisa no caminho da mensagem: seguir com lista
// vazia faria toda mensagem que chegasse durante a instabilidade do banco não
// achar conversa aberta nenhuma e abrir outra — duplicata em massa, que é o que
// esta leitura existe para evitar. Aí vale o comportamento de sempre: a falha
// sobe, como subia quando a leitura era uma chamada só. No rodízio a falha
// continua tolerada em qualquer página, como já era: lá o efeito de contar a
// menos é distribuir pior, não duplicar conversa.
async function _todasAsConversas(ctx, _Cv, _toleraPrimeira) {
  var _PAG_CONV = 500;
  var _MAX_PAG_CONV = 20;
  var _acc = [];
  var _pgFalhou = null;
  for (var _pk = 0; _pk < _MAX_PAG_CONV; _pk++) {
    var _pgConv = null;
    try {
      _pgConv = (await _Cv.findMany({ limit: _PAG_CONV, offset: _pk * _PAG_CONV })) || [];
    } catch (_pe) {
      if (_pk === 0 && !_toleraPrimeira) throw _pe;
      _pgFalhou = { pagina: _pk, erro: String((_pe && _pe.message) || _pe) };
      break;
    }
    for (var _pj = 0; _pj < _pgConv.length; _pj++) _acc.push(_pgConv[_pj]);
    if (_pgConv.length < _PAG_CONV) break;
    if (_pk === _MAX_PAG_CONV - 1) _pgFalhou = { pagina: _pk, erro: "teto de paginas" };
  }
  if (_pgFalhou) await _diagPaginaConversas(ctx, _pgFalhou, _acc.length);
  return _acc;
}
async function handler(ctx) {"""

NOVO_MSG = "  var all = await _todasAsConversas(ctx, Conv, false);\n"
NOVO_RODIZIO = "    try { todas = (await _todasAsConversas(ctx, Conv, true)) || []; } catch (e) {}\n"


def sync_routes():
    text = open(ROUTES, encoding="utf-8").read()
    at = text.find(MARCA)
    if at < 0:
        print("! rota do inbound não encontrada — nada feito")
        sys.exit(1)
    ini = text.find("handler: compileController(", at)
    if ini < 0:
        print("! handler do inbound não encontrado — nada feito")
        sys.exit(1)
    fim = text.find("\n", ini)
    linha = text[ini:fim]
    lit = linha[len("handler: compileController("):].rstrip().rstrip(",")
    if not lit.endswith(")"):
        print("! literal do inbound em formato inesperado — nada feito")
        sys.exit(1)
    fonte = json.loads(lit[:-1])

    if CARIMBO in fonte:
        print("= entrada já pagina")
        return
    alvos = (
        ("topo do módulo", ANCORA_TOPO, NOVO_TOPO),
        ("caminho da mensagem", ANCORA_MSG, NOVO_MSG),
        ("rodízio", ANCORA_RODIZIO, NOVO_RODIZIO),
    )
    for nome, ancora, _ in alvos:
        n = fonte.count(ancora)
        if n != 1:
            print(f"! âncora do {nome} aparece {n}x — nada feito")
            sys.exit(1)
    for _, ancora, novo in alvos:
        fonte = fonte.replace(ancora, novo)
    esc = json.dumps(fonte, ensure_ascii=False)
    text = text[:ini] + "handler: compileController(" + esc + ")," + text[fim:]
    open(ROUTES, "w", encoding="utf-8").write(text)
    print("✓ POST /whatsapp/inbound: as duas leituras de conversas paginam")


if __name__ == "__main__":
    if "--sync-routes" in sys.argv:
        sync_routes()
    else:
        print("Use --sync-routes")
