#!/usr/bin/env python3
# =============================================================================
# Mutação de perimetro-desativado.test.js.
#
# Cada mutante finge um defeito real e tem de morrer NA ASSERÇÃO QUE O NOMEIA.
# Morrer em outra, ou por exceção, não conta; mutante cuja âncora não casa uma
# vez só é NÃO APLICOU e reprova.
#
# Os que mexem no backend mudam o literal de UMA rota, achada pelo par
# método+caminho, no texto decodificado — e regravam só aquele literal.
#
# Roda com: python3 mutar-perimetro-desativado.py
# =============================================================================

import io, json, os, re, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(AQUI, "perimetro-desativado.test.js")
ROTAS = os.path.abspath(os.path.join(AQUI, "../../../../packages/api/src/apps/portal-suporte/routes.generated.ts"))
RE_ENTRADA = re.compile(
    r'\{\s*\n((?:(?!handler:)[\s\S]){0,900}?)handler: compileController\("((?:[^"\\]|\\.)*)"\)')


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
            novo = json.dumps(codigo.replace(de, para))[1:-1]
            return texto[:m.start(2)] + novo + texto[m.end(2):]
        return None
    return aplicar


def no_texto(de, para):
    def aplicar(texto):
        return texto.replace(de, para) if texto.count(de) == 1 else None
    return aplicar


GUARDADA = "GET /profiles/agents"
BARRADA = "GET /arquivos"

MUTANTES = [
    # ── a guarda carimbada ──────────────────────────────────────────────────
    ("uma-guarda-esquece-o-desativado", ROTAS, no_literal(GUARDADA,
        '  if (eu.desativado) {\n'
        '    return ctx.reply.status(403).send({ success: false, error: "Acesso desativado", desativado: true });\n'
        '  }\n', ''),
     'jwt: desativado é recusado em toda rota fora de ABERTAS'),
    ("a-guarda-trata-ausente-como-desativado", ROTAS, no_literal(GUARDADA,
        "desativado: !!(p && p.active === false),", "desativado: !!(p && !p.active),"),
     'active ausente: ninguém é recusado como desativado'),
    # ── a barreira das rotas escritas à mão ─────────────────────────────────
    ("a-barreira-existe-mas-nao-e-exportada", ROTAS, no_literal(BARRADA,
        "module.exports = { handler: _dsBarra };", "module.exports = { handler: _dsOriginal };"),
     'jwt: desativado é recusado em toda rota fora de ABERTAS'),
    ("a-barreira-nao-le-a-sessao-do-portal", ROTAS, no_literal(BARRADA,
        "  if (u.id || u.userId) return u.id || u.userId;\n  try {",
        "  if (u.id || u.userId) return u.id || u.userId;\n  return null;\n  try {"),
     'sessao: desativado é recusado em toda rota fora de ABERTAS'),
    ("a-barreira-abre-quando-a-leitura-falha", ROTAS, no_literal(BARRADA,
        '      return ctx.reply.status(503).send({ success: false, error: "Não foi possível conferir o acesso" });',
        '      return _dsOriginal(ctx);'),
     'leitura do Profile falhou: a barreira responde 503'),
    ("a-barreira-trata-ausente-como-desativado", ROTAS, no_literal(BARRADA,
        "if (p && p.active === false) {", "if (p && !p.active) {"),
     'active ausente: ninguém é recusado como desativado'),
    ("sair-passa-a-ser-barrado", ROTAS, no_literal("POST /auth/sessao/encerrar",
        "async function handler(ctx) {",
        'async function handler(ctx) {\n  return ctx.reply.status(403).send({ success: false, desativado: true });'),
     'desativado consegue encerrar a própria sessão'),
    # ── o laboratório mede mesmo? ───────────────────────────────────────────
    # A lista de abertas não pode virar esconderijo: rota que recusa e foi
    # posta na lista tem de ser acusada.
    ("a-lista-de-abertas-ganha-rota-que-recusa", T, no_texto(
        "  'POST /auth/sessao/encerrar': 'sair do portal tem de funcionar para quem foi desativado',\n",
        "  'POST /auth/sessao/encerrar': 'sair do portal tem de funcionar para quem foi desativado',\n"
        "  'GET /auth/me': 'escondida de propósito',\n"),
     'jwt: nenhuma rota de ABERTAS recusa o desativado'),
    # Se o fake de Profile ignorasse o cenário e devolvesse sempre desativado,
    # "todas recusam" passaria — o controle com a pessoa ativa tem de acusar.
    ("o-perfil-do-laboratorio-e-sempre-desativado", T, no_texto(
        "      return Object.assign({ id: EU, email: 'd@exemplo', full_name: 'Pessoa' }, perfil)",
        "      return Object.assign({ id: EU, email: 'd@exemplo', full_name: 'Pessoa' }, perfil, { active: false })"),
     'ativo: nenhuma rota recusa como desativado'),
    # E se a sessão do laboratório nunca validasse, o caminho por sessão seria
    # "recusado" pela guarda de sessão (401), não pela regra — a asserção exige
    # `desativado: true` para não aceitar isso.
    ("a-sessao-do-laboratorio-nunca-valida", T, no_texto(
        "    findById: async (id) => (id === 'ses_' + SID",
        "    findById: async (id) => (id === 'nunca'"),
     'sessao: desativado é recusado em toda rota fora de ABERTAS'),
]


def roda():
    r = subprocess.run(["node", T], cwd=AQUI, capture_output=True, text=True)
    s = r.stdout + r.stderr
    out = [l[5:].split("  -> ")[0].strip() for l in s.splitlines() if l.startswith("FALHA")]
    if "todos os casos passaram" not in s and not out:
        out.append("<excecao no teste>")
    return out


bases = {p: io.open(p, encoding="utf-8").read() for p in (ROTAS, T)}
if roda():
    sys.exit("! base ja reprova")
print("base limpa\n")
vivos, pulados = [], []
for nome, arq, aplicar, esperada in MUTANTES:
    texto = bases[arq]
    novo = aplicar(texto)
    if novo is None or novo == texto:
        pulados.append(nome); continue
    io.open(arq, "w", encoding="utf-8").write(novo)
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
