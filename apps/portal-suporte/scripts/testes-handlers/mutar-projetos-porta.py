#!/usr/bin/env python3
# =============================================================================
# Mutação da porta do módulo `projetos` — o campo "Projetos" em Editar membro.
#
# Vai versionado para a prova ser repetível por quem revisar. Cada mutante tem
# de morrer NA ASSERÇÃO QUE O NOMEIA; morrer em outra, ou por exceção, não
# conta, e mutante cuja âncora não casa é listado como NÃO APLICOU e reprova em
# vez de entrar na conta de mortos.
#
# Roda com: python3 mutar-projetos-porta.py
# =============================================================================

import io
import json
import os
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PS = os.path.dirname(os.path.dirname(AQUI))
GER = os.path.join(PS, "..", "..", "packages", "api", "src", "apps",
                   "portal-suporte", "routes.generated.ts")
COMUM = os.path.join(PS, "scripts", "_projetos_comum.py")
TELA = os.path.join(PS, "app", "lib", "auth", "feature-grants.ts")

SERVIDOR = "projetos-porta-de-acesso.test.js"
NA_TELA = "projetos-porta-na-tela.test.js"
DESVIO = "projetos-comum-nao-divergiu.test.js"

MARCA_292 = "// 292 projetos GET /projetos"
# Uma rota do módulo que NÃO é a 292, para o apply parcial: a varredura dos 21
# tem de pegar o handler que ficou para trás mesmo com a rota de listagem certa.
MARCA_OUTRA = "// 303 projetos POST /projetos/:id/marcos"

PORTA_NOVA = (
    "  if (eu.grants.indexOf(\"projetos\") >= 0) return true;\n"
    "  return eu.grants.indexOf(\"planejamento\") >= 0;"
)

NIVEL_MINIMO_TELA = "  if (!hasMinLevel(actor.role, 'support')) return false\n"

# (nome, arquivo, teste, de, para, assercao_que_deve_falhar)
EM_TEXTO = [
    # O nível mínimo: sem ele, a caixa marcada num perfil de CLIENTE abre o
    # módulo inteiro. Tem de morrer nos dois lados — tela e gerador.
    ("a-tela-perde-o-nivel-minimo", TELA, NA_TELA,
     NIVEL_MINIMO_TELA, "", "tela:user+projetos=false"),
    ("a-tela-sobe-o-nivel-minimo-e-tranca-a-equipe", TELA, NA_TELA,
     "  if (!hasMinLevel(actor.role, 'support')) return false",
     "  if (!hasMinLevel(actor.role, 'developer')) return false",
     "tela:support+projetos=true"),
    ("o-gerador-perde-o-nivel-minimo", COMUM, DESVIO,
     "  if (eu.nivel < _RANK.support) return false;\n", "",
     "o-codigo-do-bloco-e-igual-em-todo-handler"),
    ("a-tela-devolve-o-cargo-de-developer", TELA, NA_TELA,
     "  if (hasGrant(actor, 'projetos')) return true",
     "  if (hasGrant(actor, 'projetos')) return true\n"
     "  if (hasMinLevel(actor.role, 'developer')) return true",
     "tela:developer=false"),
    # `hasMinLevel(actor.role, 'admin')` aparece em mais de uma regra do
    # arquivo: a âncora é a assinatura de `canVerProjetos` junto com ela.
    ("a-tela-libera-todo-mundo", TELA, NA_TELA,
     "export function canVerProjetos(actor: GrantActor): boolean {\n"
     "  if (hasMinLevel(actor.role, 'admin')) return true",
     "export function canVerProjetos(actor: GrantActor): boolean {\n"
     "  return true",
     "tela:support=false"),
    ("a-tela-deixa-de-olhar-o-campo", TELA, NA_TELA,
     "  if (hasGrant(actor, 'projetos')) return true\n", "",
     "tela:developer+projetos=true"),
    ("a-tela-tira-quem-planeja", TELA, NA_TELA,
     "  return hasGrant(actor, 'planejamento')", "  return false",
     "tela:support+planejamento=true"),
    # O bloco comum é a FONTE do que os scripts escrevem no handler. Mexer nele
    # sem reaplicar é o desvio silencioso que o teste do #144 pega.
    ("o-bloco-comum-anda-sozinho", COMUM, DESVIO,
     '  if (eu.grants.indexOf("projetos") >= 0) return true;\n',
     '  if (eu.grants.indexOf("projetos") >= 0) return true;\n'
     '  if (eu.nivel >= _RANK.developer) return true;\n',
     "o-codigo-do-bloco-e-igual-em-todo-handler"),
]

# (nome, marca, teste, de, para, assercao) — no literal DECODIFICADO
NO_LITERAL = [
    # O nível mínimo no HANDLER publicado, que é o que decide de verdade: sem
    # ele, a caixa marcada num perfil de cliente abre o módulo.
    ("a-rota-perde-o-nivel-minimo", MARCA_292, SERVIDOR,
     "  if (eu.nivel < _RANK.support) return false;\n", "",
     "porta:user+projetos:292=403"),
    ("a-rota-sobe-o-nivel-minimo-e-tranca-a-equipe", MARCA_292, SERVIDOR,
     "  if (eu.nivel < _RANK.support) return false;",
     "  if (eu.nivel < _RANK.developer) return false;",
     "porta:support+projetos:292=200"),
    ("uma-rota-fica-para-tras", MARCA_OUTRA, SERVIDOR,
     PORTA_NOVA,
     "  if (eu.grants.indexOf(\"projetos\") >= 0) return true;\n"
     "  if (eu.grants.indexOf(\"planejamento\") >= 0) return true;\n"
     "  return eu.nivel >= _RANK.developer || eu.grants.indexOf(\"qa\") >= 0;",
     "porta-antiga-fora-de-todos:return eu.nivel >= _RANK.devel"),
    ("o-cargo-de-developer-volta-a-ser-passe", MARCA_292, SERVIDOR,
     PORTA_NOVA,
     "  if (eu.grants.indexOf(\"projetos\") >= 0) return true;\n"
     "  if (eu.nivel >= _RANK.developer) return true;\n"
     "  return eu.grants.indexOf(\"planejamento\") >= 0;",
     "porta:developer:292=403"),
    ("o-grant-de-qa-volta-a-ser-passe", MARCA_292, SERVIDOR,
     PORTA_NOVA,
     "  if (eu.grants.indexOf(\"projetos\") >= 0) return true;\n"
     "  if (eu.grants.indexOf(\"qa\") >= 0) return true;\n"
     "  return eu.grants.indexOf(\"planejamento\") >= 0;",
     "porta:support+qa:292=403"),
    ("o-campo-deixa-de-abrir", MARCA_292, SERVIDOR,
     "  if (eu.grants.indexOf(\"projetos\") >= 0) return true;\n", "",
     "porta:developer+projetos:292=200"),
    ("quem-planeja-perde-o-modulo", MARCA_292, SERVIDOR,
     "  return eu.grants.indexOf(\"planejamento\") >= 0;", "  return false;",
     "porta:support+planejamento:292=200"),
    ("a-porta-escancara", MARCA_292, SERVIDOR,
     "  if (eu.nivel >= _RANK.admin) return true;",
     "  if (eu.nivel >= 0) return true;",
     "porta:support:292=403"),
]


def literal(texto, marca):
    at = texto.index(marca)
    i = texto.index('"', texto.index("compileController(", at))
    j = i + 1
    while True:
        if texto[j] == "\\":
            j += 2
            continue
        if texto[j] == '"':
            break
        j += 1
    return i, j + 1, json.loads(texto[i:j + 1])


def roda(teste):
    r = subprocess.run(["node", teste], cwd=AQUI, capture_output=True, text=True)
    s = r.stdout + r.stderr
    fs = [l[5:].split("  -> ")[0].strip() for l in s.splitlines() if l.startswith("FALHA ")]
    if "todos os casos passaram" not in s and not fs:
        fs.append("<excecao no teste>")
    return fs


def main():
    bases = {p: io.open(p, encoding="utf-8").read() for p in (GER, COMUM, TELA)}
    for teste in (SERVIDOR, NA_TELA, DESVIO):
        if roda(teste):
            sys.exit(f"! base já reprova em {teste}")
    print("base limpa\n")
    vivos, pulados = [], []

    for nome, arq, teste, de, para, esperada in EM_TEXTO:
        texto = bases[arq]
        if texto.count(de) != 1:
            pulados.append((nome, f"âncora {texto.count(de)}x")); continue
        io.open(arq, "w", encoding="utf-8").write(texto.replace(de, para))
        try:
            fs = roda(teste)
        finally:
            io.open(arq, "w", encoding="utf-8").write(texto)
        casou = [f for f in fs if esperada in f]
        print(("MORTO  " if casou else "VIVO   ") + nome +
              ("  -> " + casou[0] if casou else f"  (esperava {esperada!r}; falhou: {fs[:3]})"))
        if not casou:
            vivos.append(nome)

    # No literal: só a 292 muda, de propósito. Um handler só com a porta velha é
    # o apply parcial, e é o teste dos 21 que tem de pegá-lo.
    for nome, marca, teste, de, para, esperada in NO_LITERAL:
        base = bases[GER]
        i, j, cod = literal(base, marca)
        if cod.count(de) != 1:
            pulados.append((nome, f"âncora {cod.count(de)}x no literal")); continue
        io.open(GER, "w", encoding="utf-8").write(
            base[:i] + json.dumps(cod.replace(de, para)) + base[j:])
        try:
            fs = roda(teste)
        finally:
            io.open(GER, "w", encoding="utf-8").write(base)
        casou = [f for f in fs if esperada in f]
        print(("MORTO  " if casou else "VIVO   ") + nome +
              ("  -> " + casou[0] if casou else f"  (esperava {esperada!r}; falhou: {fs[:3]})"))
        if not casou:
            vivos.append(nome)

    total = len(EM_TEXTO) + len(NO_LITERAL)
    print(f"\n{total - len(vivos) - len(pulados)}/{total} mortos")
    for n, p in pulados:
        print(f"  NÃO APLICOU {n}: {p}")
    for p, texto in bases.items():
        if io.open(p, encoding="utf-8").read() != texto:
            sys.exit("! não restaurei " + p)
    print("arquivos restaurados byte a byte")
    if vivos or pulados:
        sys.exit(1)


main()
