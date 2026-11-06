#!/usr/bin/env python3
# =============================================================================
# Kanban Dev: um card em Em Desenvolvimento por pessoa, e a coluna Pausado.
#
# Desenho: docs/portal-suporte/2026-11-06-kanban-dev-um-por-vez-e-pausado.md
#
# Edita só o literal de `POST /dev/tickets/:id/mover` no routes.generated.ts.
# O modelo do scripts/kanban-dev-regras.py ficou para trás (o handler no ar
# recebeu correções de outros scripts depois), então rodá-lo apagaria essas
# correções: este aplicador troca âncora por âncora no próprio literal.
#
#   python3 scripts/kanban-dev-um-por-vez.py            # simula
#   python3 scripts/kanban-dev-um-por-vez.py --gravar   # grava
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
ROTA = ("POST", "/dev/tickets/:id/mover")
MARCA = "// ── Um card em Em Desenvolvimento por pessoa (06/11/2026) ──"

# Mesma edição no texto codificado do desativado-sem-acesso.py: tenta os dois
# estilos de acento, porque um literal pode misturá-los.
_spec = importlib.util.spec_from_file_location("_ds", os.path.join(RAIZ, "scripts", "desativado-sem-acesso.py"))
_ds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ds)

TROCAS = [
    (
        '  em_desenvolvimento: ["desenvolvimento_finalizado", "descartado"],\n',
        '  em_desenvolvimento: ["desenvolvimento_finalizado", "pausado", "descartado"],\n'
        '  // Pausado (06/11/2026): o trabalho parou por uma pendência. Volta para\n'
        '  // Em Desenvolvimento (respeitando um card por pessoa) ou é descartado.\n'
        '  pausado: ["em_desenvolvimento", "descartado"],\n',
    ),
    (
        '  if (declaracaoNova) {\n'
        '    var lista = Array.isArray(card.declaracoes) ? card.declaracoes.slice() : [];\n',
        '  // ── Pausado: motivo obrigatório (06/11/2026) ──\n'
        '  // Fora da isenção do card migrado: a coluna nasceu depois da virada, e o\n'
        '  // motivo é o que diz a todo mundo o que está segurando o trabalho.\n'
        '  if (para === "pausado") {\n'
        '    var motivoPausa = String(body.motivo || "").trim();\n'
        '    if (!motivoPausa) {\n'
        '      return ctx.reply.status(400).send({ error: "Pausar exige o motivo — é a pendência que está segurando o card" });\n'
        '    }\n'
        '    patch.motivo_pausa = motivoPausa;\n'
        '    declaracaoNova = { etapa: para, texto: motivoPausa, autor: eu.id, em: now };\n'
        '  }\n'
        '  // Saiu de Pausado: o motivo deixa de valer no card; o histórico fica.\n'
        '  if (de === "pausado") patch.motivo_pausa = null;\n'
        '\n'
        + MARCA + '\n'
        '  // Vale para todo nível e para card migrado: a regra é sobre a PESSOA, não\n'
        '  // sobre a história do card. O responsável é o que o card terá depois do\n'
        '  // movimento. O filtro vai para a camada (responsável e status, por\n'
        '  // igualdade): o teto de 500 cai sobre os candidatos, não sobre a tabela.\n'
        '  if (para === "em_desenvolvimento") {\n'
        '    var respAtivo = String(patch.assigned_to || card.assigned_to || card.assignedTo || "").trim();\n'
        '    if (respAtivo) {\n'
        '      var ativos = (await Ticket.findMany({ assigned_to: respAtivo, status: "em_desenvolvimento", limit: 500 })) || [];\n'
        '      // Sem pular o próprio card: mover para o status em que ele já está\n'
        '      // volta antes daqui (de === para). E sem reconferir o status em JS:\n'
        '      // a camada já filtrou por ele.\n'
        '      for (var ai = 0; ai < ativos.length; ai++) {\n'
        '        var at = ativos[ai];\n'
        '        if (String(at.quadro || "suporte") !== "dev") continue;\n'
        '        var nomeAtivo = respAtivo;\n'
        '        try {\n'
        '          var pa = ctx.models.Profile ? await ctx.models.Profile.findById(respAtivo) : null;\n'
        '          if (pa && (pa.full_name || pa.email)) nomeAtivo = pa.full_name || pa.email;\n'
        '        } catch (e) {}\n'
        '        var numAtivo = at.dev_ticket_number || at.ticket_number || at.id;\n'
        '        return ctx.reply.status(400).send({\n'
        '          error: nomeAtivo + " já tem o card " + numAtivo + " em desenvolvimento. Pause ou finalize esse antes de começar outro.",\n'
        '          card_ativo: String(at.id),\n'
        '        });\n'
        '      }\n'
        '    }\n'
        '  }\n'
        '\n'
        '  if (declaracaoNova) {\n'
        '    var lista = Array.isArray(card.declaracoes) ? card.declaracoes.slice() : [];\n',
    ),
]


# ── Progresso de Projetos ────────────────────────────────────────────────────
# A tabela `_PCT` (bloco comum de scripts/_projetos_comum.py) vive em todas as
# rotas de Projetos. Card pausado vale o mesmo que em desenvolvimento: o
# trabalho começado não regride por estar parado. Sem a linha, `_PCT["pausado"]`
# é undefined e o card cairia para 0%.
PCT_DE = "  em_desenvolvimento: 25, teste_reprovado: 40,\n"
PCT_PARA = "  em_desenvolvimento: 25, pausado: 25, teste_reprovado: 40,\n"

# ── Leituras de chamados ─────────────────────────────────────────────────────
# `_STATUS_CONHECIDOS` (GET /tickets, /kanban, /dashboard, /export, /my-stats):
# quando a tabela passa do teto de 500, a leitura consulta status por status, e
# só descobre sozinha um status que apareça nas 500 linhas MAIS NOVAS. Card
# antigo pausado, sem nenhum outro pausado entre os mais novos, sumiria do
# quadro. `teste_reprovado` tinha a mesma lacuna. Os dois entram na lista.
STATUS_DE = '    "teste_aprovado", "aplicado_no_cliente",\n  ];'
STATUS_PARA = '    "teste_aprovado", "aplicado_no_cliente", "teste_reprovado", "pausado",\n  ];'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true")
    a = ap.parse_args()
    texto = open(ARQ, encoding="utf-8").read()
    alvo = None
    for m in _ds.RE_ENTRADA.finditer(texto):
        met = re.search(r'method:\s*"([^"]+)"', m.group(1))
        cam = re.search(r'path:\s*"([^"]+)"', m.group(1))
        if met and cam and (met.group(1), cam.group(1)) == ROTA:
            if alvo is not None:
                sys.exit("❌ a rota aparece duas vezes; nada foi gravado")
            alvo = m
    if alvo is None:
        sys.exit("❌ rota não encontrada; nada foi gravado")

    # Progresso de Projetos: toda rota com a tabela, cada uma conferida.
    pct = []
    for m in _ds.RE_ENTRADA.finditer(texto):
        c = json.loads('"' + m.group(2) + '"')
        if "var _PCT = {" not in c or "pausado: 25" in c:
            continue
        asc = "\\u00" in m.group(2) or "\\u2" in m.group(2)
        n = _ds.troca_codificada(m.group(2), PCT_DE, PCT_PARA, asc)
        if n is None or json.loads('"' + n + '"') != c.replace(PCT_DE, PCT_PARA):
            sys.exit("❌ tabela de progresso fora do formato esperado; nada foi gravado")
        pct.append((m.start(2), m.end(2), n))
    for m in _ds.RE_ENTRADA.finditer(texto):
        c = json.loads('"' + m.group(2) + '"')
        if "_STATUS_CONHECIDOS = [" not in c or '"pausado",\n  ];' in c:
            continue
        asc = "\\u00" in m.group(2) or "\\u2" in m.group(2)
        n = _ds.troca_codificada(m.group(2), STATUS_DE, STATUS_PARA, asc)
        if n is None or json.loads('"' + n + '"') != c.replace(STATUS_DE, STATUS_PARA):
            sys.exit("❌ lista de status conhecidos fora do formato esperado; nada foi gravado")
        if any(p[0] == m.start(2) for p in pct):
            sys.exit("❌ a mesma rota em duas trocas; nada foi gravado")
        pct.append((m.start(2), m.end(2), n))
    enc = alvo.group(2)
    codigo = json.loads('"' + enc + '"')
    ja = MARCA in codigo
    ascii_ = "\\u00" in enc or "\\u2" in enc
    novo = enc
    for de, para in ([] if ja else TROCAS):
        novo = _ds.troca_codificada(novo, de, para, ascii_)
        if novo is None:
            sys.exit("❌ âncora fora do formato esperado: " + de.strip().splitlines()[0][:70] + " — nada foi gravado")
    # A edição no texto codificado tem de ser exatamente a pretendida.
    esperado = codigo
    for de, para in ([] if ja else TROCAS):
        esperado = esperado.replace(de, para)
    if json.loads('"' + novo + '"') != esperado:
        sys.exit("❌ a edição codificada não bate com a pretendida; nada foi gravado")
    print(f"   {' '.join(ROTA)}: {'já aplicado' if ja else str(len(TROCAS)) + ' trocas'}")
    print(f"   tabela de progresso e status conhecidos: {len(pct)} rota(s)")
    if ja and not pct:
        return
    if not a.gravar:
        print("   (simulação — use --gravar)")
        return
    # De trás para a frente, para os índices das trocas anteriores valerem.
    edicoes = sorted(pct + ([] if ja else [(alvo.start(2), alvo.end(2), novo)]), reverse=True)
    for ini, fim, n in edicoes:
        texto = texto[:ini] + n + texto[fim:]
    open(ARQ, "w", encoding="utf-8").write(texto)
    print("   gravado")


if __name__ == "__main__":
    main()
