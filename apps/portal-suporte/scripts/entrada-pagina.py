#!/usr/bin/env python3
# A entrada do WhatsApp lê as conversas PAGINANDO.
#
# Sync local: python3 scripts/entrada-pagina.py --sync-routes
#
# Troca UMA linha do handler de POST /whatsapp/inbound:
#
#   var all = await Conv.findMany({});
#
# A camada devolve no máximo 500 por chamada, da mais nova para a mais velha
# (packages/api/src/lib/models.ts: ORDER BY created_at DESC LIMIT/OFFSET), e
# aceita `limit`/`offset` como paginação de verdade. Com uma chamada só, `all`
# eram as 500 conversas mais novas de TODAS — e é desse conjunto que a rota
# escolhe a conversa aberta do contato e a fechada a reabrir.
#
# A edição é ancorada e idempotente: a âncora tem de aparecer exatamente uma
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
ANCORA = "  var all = await Conv.findMany({});\n"
CARIMBO = "scripts/entrada-pagina.py"

NOVO = r"""  // ── A leitura das conversas pagina (scripts/entrada-pagina.py) ───────────
  //
  // A camada devolve no máximo 500 por chamada, da mais nova para a mais velha
  // (packages/api/src/lib/models.ts), e `limit`/`offset` paginam de verdade;
  // `take`/`skip` não, que a camada trata como filtro de campo. Com uma leitura
  // só, `all` eram as 500 conversas mais novas de TODAS — e é deste conjunto
  // que saem a conversa aberta do contato e a fechada que a regra de 7 dias
  // reabre.
  //
  // AQUI a varredura incompleta NÃO derruba nada, ao contrário da reabertura
  // manual: mensagem de cliente perdida é pior que varredura curta. Página que
  // falha, ou teto de páginas atingido, seguem com o que já foi lido, e a falha
  // vai para o diagnóstico.
  async function _diagPaginaConversas(_falha, _lidas) {
    // Mesmo critério das outras sondas desta rota: conta antes e só grava
    // enquanto houver menos de 6; se a CONTAGEM falhar, não grava. Sonda
    // silenciosa é aceitável, sonda que grava sem limite não — ela viraria
    // carga justamente quando o banco está pior.
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
  var _PAG_CONV = 500;
  var _MAX_PAG_CONV = 20;
  var all = [];
  var _pgFalhou = null;
  for (var _pk = 0; _pk < _MAX_PAG_CONV; _pk++) {
    var _pgConv = null;
    try {
      _pgConv = (await Conv.findMany({ limit: _PAG_CONV, offset: _pk * _PAG_CONV })) || [];
    } catch (_pe) {
      _pgFalhou = { pagina: _pk, erro: String((_pe && _pe.message) || _pe) };
      break;
    }
    for (var _pj = 0; _pj < _pgConv.length; _pj++) all.push(_pgConv[_pj]);
    if (_pgConv.length < _PAG_CONV) break;
    if (_pk === _MAX_PAG_CONV - 1) _pgFalhou = { pagina: _pk, erro: "teto de paginas" };
  }
  if (_pgFalhou) await _diagPaginaConversas(_pgFalhou, all.length);
"""


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
    n = fonte.count(ANCORA)
    if n != 1:
        print(f"! âncora da leitura aparece {n}x — nada feito")
        sys.exit(1)
    fonte = fonte.replace(ANCORA, NOVO)
    esc = json.dumps(fonte, ensure_ascii=False)
    nova_linha = "handler: compileController(" + esc + "),"
    text = text[:ini] + nova_linha + text[fim:]
    open(ROUTES, "w", encoding="utf-8").write(text)
    print("✓ POST /whatsapp/inbound lê as conversas paginando")


if __name__ == "__main__":
    if "--sync-routes" in sys.argv:
        sync_routes()
    else:
        print("Use --sync-routes")
