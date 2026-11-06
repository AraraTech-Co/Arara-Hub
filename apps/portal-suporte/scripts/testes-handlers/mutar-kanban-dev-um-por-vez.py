#!/usr/bin/env python3
# =============================================================================
# Mutação de kanban-dev-um-por-vez.test.js (e da linha de Projetos em
# projetos-comportamento-atual.test.js).
#
# Cada mutante morre NA ASSERÇÃO QUE O NOMEIA; morrer em outra ou por exceção
# não conta, e âncora que não casa uma vez só é NÃO APLICOU e reprova. Os do
# servidor mexem no literal de UMA rota, achada por método+caminho, no texto
# decodificado.
#
# Roda com: python3 mutar-kanban-dev-um-por-vez.py
# =============================================================================

import io, json, os, re, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PS = os.path.dirname(os.path.dirname(AQUI))
ROTAS = os.path.abspath(os.path.join(PS, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts"))
LIB = os.path.join(PS, "app", "lib", "kanban-dev.ts")
T = os.path.join(AQUI, "kanban-dev-um-por-vez.test.js")
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


MUTANTES = [
    # ── um card por pessoa ──────────────────────────────────────────────────
    ("a-regra-de-um-por-vez-some", ROTAS, no_literal(MOVER,
        '  if (para === "em_desenvolvimento") {\n    var respAtivo',
        '  if (false) {\n    var respAtivo'), T,
     'segundo-card-da-mesma-pessoa-recusado:de-backlog'),
    # O defeito que o teto esconde: a MESMA regra, filtrada em JS depois das
    # 500 linhas mais novas, em vez de filtrada na camada.
    ("a-contagem-filtra-em-js-depois-do-teto", ROTAS, no_literal(MOVER,
        '(await Ticket.findMany({ assigned_to: respAtivo, status: "em_desenvolvimento", limit: 500 })) || []',
        '((await Ticket.findMany({ limit: 500 })) || []).filter(function (x) {'
        ' return String(x.assigned_to || "") === respAtivo && String(x.status) === "em_desenvolvimento"; })'), T,
     'acima-de-500-cards-da-pessoa-ainda-acha-o-ativo'),
    ("card-de-outro-quadro-passa-a-contar", ROTAS, no_literal(MOVER,
        '        if (String(at.quadro || "suporte") !== "dev") continue;\n', ''), T,
     'card-de-outro-quadro-nao-conta'),
    ("o-responsavel-do-arraste-e-ignorado", ROTAS, no_literal(MOVER,
        'String(patch.assigned_to || card.assigned_to || card.assignedTo || "")',
        'String(card.assigned_to || card.assignedTo || "")'), T,
     'o-responsavel-enviado-no-arraste-conta'),
    ("a-recusa-nao-diz-o-card", ROTAS, no_literal(MOVER,
        'nomeAtivo + " já tem o card " + numAtivo + " em desenvolvimento.',
        'nomeAtivo + " já tem um card em desenvolvimento.'), T,
     'a-recusa-diz-quem-e-qual-card'),
    # ── Pausado ─────────────────────────────────────────────────────────────
    ("pausar-sem-motivo-passa", ROTAS, no_literal(MOVER,
        '    if (!motivoPausa) {', '    if (false) {'), T,
     'pausar-sem-motivo-recusa'),
    ("o-motivo-nao-fica-no-card", ROTAS, no_literal(MOVER,
        '    patch.motivo_pausa = motivoPausa;\n', ''), T,
     'o-motivo-fica-no-card'),
    ("o-motivo-nao-vai-para-o-historico", ROTAS, no_literal(MOVER,
        '    declaracaoNova = { etapa: para, texto: motivoPausa, autor: eu.id, em: now };\n', ''), T,
     'o-motivo-fica-no-historico'),
    ("sair-de-pausado-mantem-o-motivo", ROTAS, no_literal(MOVER,
        '  if (de === "pausado") patch.motivo_pausa = null;\n', ''), T,
     'sair-de-pausado-limpa-o-motivo'),
    ("o-servidor-nao-conhece-a-saida-de-pausado", ROTAS, no_literal(MOVER,
        '  pausado: ["em_desenvolvimento", "descartado"],\n', ''), T,
     'tela:transicoes-de-pausado-iguais-as-do-servidor'),
    # ── leituras e progresso ────────────────────────────────────────────────
    ("o-quadro-esquece-pausado-na-lista", ROTAS, no_literal("GET /tickets/kanban",
        '"teste_reprovado", "pausado",\n  ];', '"teste_reprovado",\n  ];'), T,
     '/tickets/kanban:card-pausado-antigo-aparece-acima-de-500'),
    ("o-progresso-esquece-pausado", ROTAS, no_literal("GET /projetos/:id",
        "em_desenvolvimento: 25, pausado: 25,", "em_desenvolvimento: 25,"), TP,
     'pausado-vale-o-mesmo-que-em-desenvolvimento-nos-dois-lados'),
    # ── a tela ──────────────────────────────────────────────────────────────
    ("a-tela-conta-o-pausado-como-ativo", LIB, no_texto(
        "c.id !== idDoCard && c.status === 'em_desenvolvimento' && String(c.assignee?.id || '') === quem,",
        "c.id !== idDoCard && String(c.assignee?.id || '') === quem,"), T,
     'tela:card-pausado-nao-ocupa-a-vaga'),
    ("a-tela-nao-pede-o-motivo", LIB, no_texto(
        "  pausado: { motivo: true },\n", ""), T,
     'tela:pausado-pede-motivo'),
]


def roda(teste):
    r = subprocess.run(["node", teste], cwd=AQUI, capture_output=True, text=True)
    s = r.stdout + r.stderr
    out = [l[5:].split("  -> ")[0].strip() for l in s.splitlines() if l.startswith("FALHA")]
    if "todos os casos passaram" not in s and not out:
        out.append("<excecao no teste>")
    return out


bases = {p: io.open(p, encoding="utf-8").read() for p in (ROTAS, LIB, T, TP)}
for t in (T, TP):
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
