#!/usr/bin/env python3
# =============================================================================
# Mutação de kanban-dev-so-pelo-quadro-dev.test.js.
#
# Cada mutante morre NA ASSERÇÃO QUE O NOMEIA; morrer em outra ou por exceção
# não conta, e âncora que não casa uma vez só é NÃO APLICOU e reprova. Os do
# servidor mexem no literal de UMA rota, achada por método+caminho, no texto
# decodificado.
#
# Roda com: python3 mutar-kanban-dev-so-pelo-quadro-dev.py
# =============================================================================

import io, json, os, re, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PS = os.path.dirname(os.path.dirname(AQUI))
ROTAS = os.path.abspath(os.path.join(PS, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts"))
LIB = os.path.join(PS, "app", "lib", "kanban-dev.ts")
T = os.path.join(AQUI, "kanban-dev-so-pelo-quadro-dev.test.js")
TP = os.path.join(AQUI, "projetos-comportamento-atual.test.js")
RE_ENTRADA = re.compile(
    r'\{\s*\n((?:(?!handler:)[\s\S]){0,900}?)handler: compileController\("((?:[^"\\]|\\.)*)"\)')
MOVER = "POST /dev/tickets/:id/mover"


def no_literal(chave, de, para):
    def aplicar(texto):
        metodo, caminho = chave.split(" ", 1)
        for m in RE_ENTRADA.finditer(texto):
            met = re.search(r'method:\s*"([^"]+)"', m.group(1))
            cam = re.search(r'path:\s*"([^"]+)"', m.group(1))
            if not (met and cam and met.group(1) == metodo and cam.group(1) == caminho):
                continue
            codigo = json.loads('"' + m.group(2) + '"')
            if codigo.count(de) != 1:
                return None
            return texto[:m.start(2)] + json.dumps(codigo.replace(de, para))[1:-1] + texto[m.end(2):]
        return None
    return aplicar


def no_texto(de, para):
    return lambda texto: texto.replace(de, para) if texto.count(de) == 1 else None


DEV409 = '  if (String(ticket.quadro || "suporte") === "dev") {\n    return { error: "O card do quadro Dev muda pelo quadro Dev", status: 409 };'
SEM409 = '  if (false) {\n    return { error: "O card do quadro Dev muda pelo quadro Dev", status: 409 };'
VAGA_ASSIGN = '    var _vaga = await _dvVagaOcupada(ctx, ticket, assignee, [String(id)]);\n    if (_vaga) return ctx.reply.status(400).send(_vaga);\n'

MUTANTES = [
    # ── status pelas rotas genéricas ────────────────────────────────────────
    ("patch-status-move-card-dev", ROTAS, no_literal("PATCH /tickets/:id/status", DEV409, SEM409), T,
     'statusPatch:card-dev-nao-muda-de-status:em_desenvolvimento'),
    ("post-status-move-card-dev", ROTAS, no_literal("POST /tickets/:id/status", DEV409, SEM409), T,
     'statusPost:card-dev-nao-muda-de-status:em_desenvolvimento'),
    # ── o lote ──────────────────────────────────────────────────────────────
    ("lote-set_status-move-card-dev", ROTAS, no_literal("POST /tickets/bulk-action",
        '    if (action === "set_status" && _devs.length) {', '    if (false) {'), T,
     'lote:set_status-com-card-dev-recusa-sem-gravar-nada'),
    ("lote-da-dois-cards-a-mesma-pessoa", ROTAS, no_literal("POST /tickets/bulk-action",
        '      if (_novo && _emDev.length > 1) {', '      if (false) {'), T,
     'lote:dois-cards-em-dev-para-a-mesma-pessoa-no-mesmo-lote-recusa'),
    ("lote-nao-confere-a-vaga", ROTAS, no_literal("POST /tickets/bulk-action",
        '        if (_vaga) return ctx.reply.status(400).send(_vaga);\n', ''), T,
     'lote:assign-de-card-em-dev-para-quem-ja-tem-recusa'),
    ("lote-nao-ignora-os-proprios-cards", ROTAS, no_literal("POST /tickets/bulk-action",
        'await _dvVagaOcupada(ctx, _emDev[0], _novo, ids);', 'await _dvVagaOcupada(ctx, _emDev[0], _novo, []);'), T,
     'lote:reatribuir-o-card-em-dev-a-mesma-pessoa-passa'),
    # ── troca de responsável ────────────────────────────────────────────────
    ("patch-assign-nao-confere-a-vaga", ROTAS, no_literal("PATCH /tickets/:id/assign", VAGA_ASSIGN, ''), T,
     'assignPatch:card-em-dev-para-quem-ja-tem-recusa'),
    ("post-assign-nao-confere-a-vaga", ROTAS, no_literal("POST /tickets/:id/assign", VAGA_ASSIGN, ''), T,
     'assignPost:card-em-dev-para-quem-ja-tem-recusa'),
    ("escalate-nao-confere-a-vaga", ROTAS, no_literal("POST /tickets/:id/escalate",
        '  if (_vaga) return ctx.reply.status(400).send(_vaga);\n', ''), T,
     'escalar:card-em-dev-para-quem-ja-tem-recusa'),
    # ── a conta compartilhada (mutada numa rota só) ─────────────────────────
    ("a-conta-nao-ignora-o-proprio-card", ROTAS, no_literal("PATCH /tickets/:id/assign",
        '    if ((ignorar || []).indexOf(String(a.id)) >= 0) continue;\n', ''), T,
     'assignPatch:o-proprio-card-nao-conta'),
    ("a-conta-vale-fora-de-em-dev", ROTAS, no_literal("PATCH /tickets/:id/assign",
        '  if (String(card.status || "") !== "em_desenvolvimento") return null;\n', ''), T,
     'assignPatch:card-fora-de-em-dev-passa'),
    ("a-conta-vale-para-card-de-suporte", ROTAS, no_literal("PATCH /tickets/:id/assign",
        '  if (!card || String(card.quadro || "suporte") !== "dev") return null;\n', '  if (!card) return null;\n'), T,
     'assignPatch:card-de-suporte-em-desenvolvimento-passa'),
    ("a-conta-ve-o-ativo-de-outro-quadro", ROTAS, no_literal("PATCH /tickets/:id/assign",
        '    if (String(a.quadro || "suporte") !== "dev") continue;\n', ''), T,
     'assignPatch:card-ativo-de-outro-quadro-nao-conta'),
    ("a-conta-filtra-em-js-depois-do-teto", ROTAS, no_literal("PATCH /tickets/:id/assign",
        '(await ctx.models.Ticket.findMany({ assigned_to: quem, status: "em_desenvolvimento", limit: 500 })) || []',
        '((await ctx.models.Ticket.findMany({ limit: 500 })) || []).filter(function (x) {'
        ' return String(x.assigned_to || "") === quem && String(x.status) === "em_desenvolvimento"; })'), T,
     'assignPatch:acima-de-500-cards-da-pessoa-ainda-acha-o-ativo'),
    # ── o seletor de responsável do quadro Dev ──────────────────────────────
    ("o-seletor-volta-a-mandar-sem-force", LIB, no_texto(
        "  return { assignee_id: String(novo || '').trim() || null, force: true }",
        "  return { assignee_id: String(novo || '').trim() || null } as never"), T,
     'seletor:troca-o-dono-de-card-que-ja-tem-responsavel'),
]


def roda(teste):
    r = subprocess.run(["node", teste], cwd=AQUI, capture_output=True, text=True)
    s = r.stdout + r.stderr
    out = [l[5:].split("  -> ")[0].strip() for l in s.splitlines() if l.startswith("FALHA")]
    if "todos os casos passaram" not in s and not out:
        out.append("<excecao no teste>")
    return out


bases = {p: io.open(p, encoding="utf-8").read() for p in (ROTAS, LIB)}
for t in (T,):
    if roda(t):
        sys.exit("! base ja reprova: " + os.path.basename(t))
print("base limpa\n")
vivos, pulados = [], []
for nome, arq, aplicar, teste, esperada in MUTANTES:
    texto = bases[arq]
    novo = aplicar(texto)
    if novo is None or novo == texto:
        pulados.append(nome); continue
    io.open(arq, "w", encoding="utf-8").write(novo)
    try:
        fs = roda(teste)
    finally:
        io.open(arq, "w", encoding="utf-8").write(texto)
    casou = [f for f in fs if esperada in f]
    print(("MORTO  " if casou else "VIVO   ") + nome +
          ("  -> " + casou[0] if casou else f"  (esperava {esperada!r}; falhou: {fs[:3]})"))
    if not casou:
        vivos.append(nome)

print(f"\n{len(MUTANTES) - len(vivos) - len(pulados)}/{len(MUTANTES)} mortos")
for n in pulados:
    print(f"  NAO APLICOU {n}")
for p, texto in bases.items():
    if io.open(p, encoding="utf-8").read() != texto:
        sys.exit("! nao restaurei " + p)
print("arquivos restaurados byte a byte")
if vivos or pulados:
    sys.exit(1)
