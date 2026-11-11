#!/usr/bin/env python3
# =============================================================================
# Mutação dos casos `ver:` de projetos-kanban-de-atividades.test.js: abrir a
# atividade do quadro do projeto para leitura.
#
# Cada mutante morre NA ASSERÇÃO QUE O NOMEIA; âncora que não casa uma vez só
# é NÃO APLICOU e reprova. Arquivos restaurados byte a byte.
#
# Roda com: python3 mutar-ver-atividade.py
# =============================================================================

import io, os, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(os.path.dirname(os.path.dirname(AQUI)), "app")
LIB = os.path.join(APP, "lib", "projetos-atividades.ts")
QUADRO = os.path.join(APP, "_components", "projetos", "kanban-de-atividades.tsx")
VISAO = os.path.join(APP, "_components", "projetos", "ver-atividade.tsx")
EDITOR = os.path.join(APP, "_components", "projetos", "editar-atividade.tsx")
T = os.path.join(AQUI, "projetos-kanban-de-atividades.test.js")

MUTANTES = [
    ("o-cartao-volta-a-nao-abrir", QUADRO, "        onClick={() => aoAbrir(a)}\n", "", 'ver:o-cartao-abre-ao-clicar'),
    ("o-espaco-nao-abre", QUADRO, "          if (e.key === 'Enter' || e.key === ' ') aoAbrir(a)\n",
     "          if (e.key === 'Enter') aoAbrir(a)\n", 'ver:o-cartao-abre-no-enter-e-no-espaco'),
    ("o-espaco-rola-a-pagina", QUADRO, "          if (e.key === ' ') e.preventDefault()\n", "", 'ver:o-espaco-nao-rola-a-pagina'),
    ("o-quadro-nao-liga-a-visao", QUADRO, "                    aoAbrir={setVendo}\n", "                    aoAbrir={() => {}}\n",
     'ver:o-quadro-liga-o-cartao-a-visao'),
    ("a-visao-nao-e-renderizada", QUADRO, "        <VerAtividade\n", "        <EditarAtividade\n", 'ver:o-quadro-renderiza-a-visao'),
    ("a-visao-refaz-a-conta", VISAO, "  const linhas = detalhesDaAtividade(atividade, { pessoas, fases, formatarData: dataBR })",
     "  const linhas = [{ rotulo: 'Título', valor: atividade.titulo }]", 'ver:a-visao-usa-a-regra-da-lib'),
    ("a-descricao-some", LIB, "    { rotulo: 'Descrição', valor: nada(a.descricao) },\n", "", 'ver:mostra-a-descricao-inteira'),
    ("o-responsavel-vira-id", LIB, "    { rotulo: 'Responsável', valor: dono ? dono.nome : '—' },",
     "    { rotulo: 'Responsável', valor: nada(a.responsavel_id) },", 'ver:mostra-o-nome-do-responsavel'),
    ("a-data-vazia-chama-o-formatador", LIB,
     "  const data = (v: unknown) => (String(v ?? '').trim() ? ctx.formatarData(v) : '—')",
     "  const data = (v: unknown) => ctx.formatarData(v)", 'ver:campo-vazio-vira-traco-e-nao-chama-o-formatador'),
    ("o-editor-volta-a-ser-bloco", EDITOR, '    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">\n',
     '    <div>\n', 'editar:o-editor-e-uma-janela-por-cima'),
    ("clicar-fora-fecha-o-editor", EDITOR, '    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">\n',
     '    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onFechar}>\n',
     'editar:clicar-fora-nao-joga-a-edicao-fora'),
]


def roda():
    r = subprocess.run(["node", T], cwd=AQUI, capture_output=True, text=True)
    s = r.stdout + r.stderr
    out = [l[5:].split("  -> ")[0].strip() for l in s.splitlines() if l.startswith("FALHA")]
    if "todos os casos passaram" not in s and not out:
        out.append("<excecao no teste>")
    return out


bases = {p: io.open(p, encoding="utf-8").read() for p in (LIB, QUADRO, VISAO, EDITOR)}
if roda():
    sys.exit("! base ja reprova")
print("base limpa\n")
vivos, pulados = [], []
for nome, arq, de, para, esperada in MUTANTES:
    texto = bases[arq]
    if texto.count(de) != 1:
        pulados.append(nome); continue
    io.open(arq, "w", encoding="utf-8").write(texto.replace(de, para))
    try:
        fs = roda()
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
