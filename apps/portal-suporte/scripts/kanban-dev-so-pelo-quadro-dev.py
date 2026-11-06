#!/usr/bin/env python3
# =============================================================================
# O card do quadro Dev muda pelo quadro Dev, e a regra de um card em
# desenvolvimento por pessoa vale em toda rota que troca o responsável.
#
# Fatia seguinte ao scripts/kanban-dev-um-por-vez.py:
#   - `PATCH`/`POST /tickets/:id/status` e o `set_status` do `bulk-action`
#     recusam card do quadro Dev (409): ele muda por `POST /dev/tickets/:id/mover`,
#     onde moram transições, HML, motivo e a regra de um por vez;
#   - `PATCH`/`POST /tickets/:id/assign`, `POST /tickets/:id/escalate` e o
#     `assign` do `bulk-action` conferem a vaga quando o card Dev está em Em
#     Desenvolvimento (`_dvVagaOcupada`, a mesma conta do mover).
#
#   python3 scripts/kanban-dev-so-pelo-quadro-dev.py            # simula
#   python3 scripts/kanban-dev-so-pelo-quadro-dev.py --gravar   # grava
#
# Aborta sem gravar se alguma âncora não aparecer exatamente uma vez.
# =============================================================================

import argparse
import importlib.util
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ = os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
MARCA = "scripts/kanban-dev-so-pelo-quadro-dev.py"

_spec = importlib.util.spec_from_file_location("_ds", os.path.join(RAIZ, "scripts", "desativado-sem-acesso.py"))
_ds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ds)

VAGA = '''// ── Um card em Em Desenvolvimento por pessoa (''' + MARCA + ''') ──
// A mesma conta do mover do quadro Dev (rota /dev/tickets/:id/mover), para as rotas que
// trocam o responsável. Só vale para card do quadro Dev que está em Em
// Desenvolvimento; os ids em `ignorar` não ocupam vaga (o próprio card, ou os
// cards do mesmo lote, que o lote confere à parte).
async function _dvVagaOcupada(ctx, card, resp, ignorar) {
  if (!card || String(card.quadro || "suporte") !== "dev") return null;
  if (String(card.status || "") !== "em_desenvolvimento") return null;
  var quem = String(resp || "").trim();
  if (!quem) return null;
  var ativos = (await ctx.models.Ticket.findMany({ assigned_to: quem, status: "em_desenvolvimento", limit: 500 })) || [];
  for (var i = 0; i < ativos.length; i++) {
    var a = ativos[i];
    if ((ignorar || []).indexOf(String(a.id)) >= 0) continue;
    if (String(a.quadro || "suporte") !== "dev") continue;
    var nome = quem;
    try {
      var p = ctx.models.Profile ? await ctx.models.Profile.findById(quem) : null;
      if (p && (p.full_name || p.email)) nome = p.full_name || p.email;
    } catch (e) {}
    return {
      error: nome + " já tem o card " + (a.dev_ticket_number || a.ticket_number || a.id)
        + " em desenvolvimento. Pause ou finalize esse antes de passar outro para essa pessoa.",
      card_ativo: String(a.id),
    };
  }
  return null;
}

'''

DEV_409 = '"O card do quadro Dev muda pelo quadro Dev"'

# (método, caminho) → lista de (de, para). `None` em `de` = inserir VAGA antes
# de `async function handler(ctx) {`.
TROCAS = {
    ("PATCH", "/tickets/:id/status"): [(
        '  if (!ticket) return { error: "Ticket not found", status: 404 };\n',
        '  if (!ticket) return { error: "Ticket not found", status: 404 };\n'
        '  // O card do quadro Dev muda pelo mover do quadro Dev (/dev/tickets/:id/mover), onde\n'
        '  // moram transições, HML, motivo e um card por pessoa (' + MARCA + ').\n'
        '  if (String(ticket.quadro || "suporte") === "dev") {\n'
        '    return { error: ' + DEV_409 + ', status: 409 };\n'
        '  }\n',
    )],
    ("PATCH", "/tickets/:id/assign"): [None, (
        '    const row = await model.update(id, {\n      assigned_to: assignee,\n',
        '    var _vaga = await _dvVagaOcupada(ctx, ticket, assignee, [String(id)]);\n'
        '    if (_vaga) return ctx.reply.status(400).send(_vaga);\n'
        '    const row = await model.update(id, {\n      assigned_to: assignee,\n',
    )],
    ("POST", "/tickets/:id/escalate"): [None, (
        '  const updated = await Ticket.update(id, {\n    assigned_to: toUserId,\n',
        '  var _vaga = await _dvVagaOcupada(ctx, ticket, toUserId, [String(id)]);\n'
        '  if (_vaga) return ctx.reply.status(400).send(_vaga);\n'
        '  const updated = await Ticket.update(id, {\n    assigned_to: toUserId,\n',
    )],
    ("POST", "/tickets/bulk-action"): [None, (
        '  for (const id of ids) {\n    const ticket = await Ticket.findById(id);\n',
        '  // ── Card do quadro Dev no lote (' + MARCA + ') ──\n'
        '  // Conferido ANTES de gravar qualquer um: lote recusado não grava nada.\n'
        '  if (action === "set_status" || action === "assign") {\n'
        '    var _devs = [];\n'
        '    for (var _bi = 0; _bi < ids.length; _bi++) {\n'
        '      var _bc = await Ticket.findById(ids[_bi]);\n'
        '      if (_bc && String(_bc.quadro || "suporte") === "dev") _devs.push(_bc);\n'
        '    }\n'
        '    if (action === "set_status" && _devs.length) {\n'
        '      return ctx.reply.status(409).send({ error: ' + DEV_409 + ' });\n'
        '    }\n'
        '    if (action === "assign") {\n'
        '      var _novo = body.assignTo !== undefined ? body.assignTo : body.assigned_to;\n'
        '      var _emDev = _devs.filter(function (c) { return String(c.status || "") === "em_desenvolvimento"; });\n'
        '      if (_novo && _emDev.length > 1) {\n'
        '        return ctx.reply.status(400).send({\n'
        '          error: "Um card em desenvolvimento por pessoa: o lote daria " + _emDev.length + " cards em desenvolvimento à mesma pessoa.",\n'
        '        });\n'
        '      }\n'
        '      if (_emDev.length === 1) {\n'
        '        var _vaga = await _dvVagaOcupada(ctx, _emDev[0], _novo, ids);\n'
        '        if (_vaga) return ctx.reply.status(400).send(_vaga);\n'
        '      }\n'
        '    }\n'
        '  }\n'
        '\n'
        '  for (const id of ids) {\n    const ticket = await Ticket.findById(id);\n',
    )],
}
# O POST de status e o de assign têm o MESMO corpo dos PATCH correspondentes.
TROCAS[("POST", "/tickets/:id/status")] = TROCAS[("PATCH", "/tickets/:id/status")]
TROCAS[("POST", "/tickets/:id/assign")] = TROCAS[("PATCH", "/tickets/:id/assign")]

ANCORA_HANDLER = "async function handler(ctx) {\n"
# Outros testes acham o handler do mover pela PRIMEIRA ocorrência deste texto
# no arquivo de rotas; as rotas daqui vêm antes dele. Citar a rota com o
# método na frente faria esses testes carregarem o handler errado.
PROIBIDO = "POST /dev/tickets/:id/mover"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true")
    a = ap.parse_args()
    texto = open(ARQ, encoding="utf-8").read()
    edicoes, vistos, ja = [], set(), 0
    for m in _ds.RE_ENTRADA.finditer(texto):
        met = re.search(r'method:\s*"([^"]+)"', m.group(1))
        cam = re.search(r'path:\s*"([^"]+)"', m.group(1))
        chave = (met.group(1), cam.group(1)) if met and cam else None
        if chave not in TROCAS:
            continue
        if chave in vistos:
            sys.exit(f"❌ {chave} aparece duas vezes; nada foi gravado")
        vistos.add(chave)
        enc = m.group(2)
        codigo = json.loads('"' + enc + '"')
        if MARCA in codigo:
            ja += 1
            continue
        asc = "\\u00" in enc or "\\u2" in enc
        novo, esperado = enc, codigo
        for t in TROCAS[chave]:
            de, para = (ANCORA_HANDLER, VAGA + ANCORA_HANDLER) if t is None else t
            novo = _ds.troca_codificada(novo, de, para, asc) if novo is not None else None
            if esperado.count(de) != 1:
                novo = None
            esperado = esperado.replace(de, para)
            if novo is None:
                sys.exit(f"❌ {' '.join(chave)}: âncora fora do formato esperado — nada foi gravado")
        if json.loads('"' + novo + '"') != esperado:
            sys.exit(f"❌ {' '.join(chave)}: a edição codificada não bate com a pretendida — nada foi gravado")
        if PROIBIDO in esperado and PROIBIDO not in codigo:
            sys.exit(f"❌ {' '.join(chave)}: o texto colado cita '{PROIBIDO}' — nada foi gravado")
        edicoes.append((m.start(2), m.end(2), novo))
        print(f"   {' '.join(chave)}")
    faltam = set(TROCAS) - vistos
    if faltam:
        sys.exit(f"❌ rotas não encontradas: {sorted(faltam)} — nada foi gravado")
    print(f"\n   {len(edicoes)} rota(s) a mudar · {ja} já com a regra")
    if not edicoes:
        return
    if not a.gravar:
        print("   (simulação — use --gravar)")
        return
    for ini, fim, n in sorted(edicoes, reverse=True):
        texto = texto[:ini] + n + texto[fim:]
    open(ARQ, "w", encoding="utf-8").write(texto)
    print("   gravado")


if __name__ == "__main__":
    main()
