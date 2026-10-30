#!/usr/bin/env python3
# =============================================================================
# Materiais de Apoio do projeto — quatro rotas sob `/projetos/:id/materiais`.
#
# Pedido do Leonardo (30/10): "precisa criar um campo dentro do projeto tipo de
# Materiais de Apoio do projeto, para subirmos arquivos que são necessários" e,
# sobre misturar com o acervo, "não quero que vincule para não misturar os
# arquivos, se for somente no backend beleza, mas o campo tem que ser dentro do
# projeto e isolado dos outros kanbans".
#
# Por isso o armazenamento é o MESMO do acervo (`Arquivo` + `ArquivoConteudo`,
# que já têm conferência de tipo, teto de 10 MB e apagar lógico provados), e a
# separação é de escopo: material de projeto nasce com `escopo: "projeto"` e
# `projeto_id`, e NENHUMA rota do acervo o alcança — nem a listagem, nem o
# download, nem o apagar. Quem alcança é só quem alcança o projeto.
#
# O prelúdio das quatro rotas é RECORTADO de um handler do módulo `projetos` e
# as constantes de tipo e tamanho são recortadas do POST do acervo. Nada é
# copiado à mão: cópia de trecho é como uma das cópias fica para trás.
#
#   python3 scripts/projetos-materiais.py                 # simula
#   python3 scripts/projetos-materiais.py --sync-routes
# =============================================================================

import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
ROTAS = os.path.abspath(os.path.join(
    AQUI, "..", "..", "..", "packages", "api", "src", "apps", "portal-suporte",
    "routes.generated.ts"))
CORPOS = os.path.join(AQUI, "materiais")

FONTE_PRELUDIO = "// 292 projetos GET /projetos"
FONTE_TIPOS = "// 490a2 arquivos POST /arquivos"
MARCA = "scripts/projetos-materiais.py"
ESCOPO = "projeto"

# (número, método, caminho, arquivo do corpo)
AS_ROTAS = [
    ("512", "GET", "/projetos/:id/materiais", "listar.js"),
    ("513", "POST", "/projetos/:id/materiais", "enviar.js"),
    ("514", "GET", "/projetos/:id/materiais/:mid/conteudo", "baixar.js"),
    ("515", "DELETE", "/projetos/:id/materiais/:mid", "apagar.js"),
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
    return json.loads(texto[i:j + 1])


def preludio(texto):
    """Tudo o que vem antes do handler num handler do módulo `projetos`."""
    cod = literal(texto, FONTE_PRELUDIO)
    corte = cod.index("async function handler(ctx) {")
    bloco = cod[:corte]
    for exigido in ("async function _perfilDe(ctx)", "function _podeVer(eu)",
                    "function _podePlanejar(eu)", "async function _log(ctx",
                    "function _agora()", "function _id(pre)"):
        if exigido not in bloco:
            raise SystemExit(f"! o prelúdio não tem {exigido!r}")
    # A porta que vai junto tem de ser a de hoje: se este script for rodado num
    # arquivo antigo, as rotas novas nasceriam com a porta antiga embutida.
    if "_PORTA_ANTIGA_DE_PROJETOS" in bloco:
        raise SystemExit("! o prelúdio ainda tem a porta de transição")
    return bloco


def tipos_e_teto(texto):
    """`MAX_BYTES` e `TIPOS`, recortados do POST do acervo."""
    cod = literal(texto, FONTE_TIPOS)
    i = cod.index("var MAX_BYTES =")
    j = cod.index("];", cod.index("var TIPOS = [", i)) + 2
    bloco = cod[i:j]
    if "application/pdf" not in bloco or "10 * 1024 * 1024" not in bloco:
        raise SystemExit(f"! o recorte de tipos/teto não confere:\n{bloco}")
    if bloco.count("var TIPOS") != 1 or bloco.count("var MAX_BYTES") != 1:
        raise SystemExit("! o recorte de tipos/teto pegou mais do que devia")
    return bloco


def corpo(nome):
    with open(os.path.join(CORPOS, nome), encoding="utf-8") as f:
        texto = f.read()
    if "async function handler(ctx)" not in texto:
        raise SystemExit(f"! {nome} não tem handler")
    return texto


def entrada(num, metodo, caminho, cod, ultima):
    """Uma entrada do array. A ÚLTIMA do arquivo vai sem vírgula no fim: o
    `gerado-estrutura.test.js` exige `  }` + `]`, e vírgula sobrando ali já foi
    defeito meu numa entrega anterior."""
    return (
        '  // %s projetos %s %s (%s)\n'
        '  {\n'
        '    module: "projetos",\n'
        '    method: "%s",\n'
        '    path: "%s",\n'
        '    authMode: "actor",\n'
        '    webhookSecretName: null,\n'
        '    requiredPermissions: [],\n'
        '    source: "%s",\n'
        '    handler: compileController(%s),\n'
        '  }%s'
    ) % (num, metodo, caminho, MARCA, metodo, caminho, MARCA,
         json.dumps(cod), "" if ultima else ",")


def remover(texto, num, metodo, caminho):
    """Tira a entrada já registrada, para o script poder reescrevê-la."""
    cab = "  // %s projetos %s %s (%s)\n" % (num, metodo, caminho, MARCA)
    if cab not in texto:
        return texto
    i = texto.index(cab)
    com_virgula = texto.find("\n  },\n", i)
    ultima = texto.find("\n  }\n]", i)
    if ultima >= 0 and (com_virgula < 0 or ultima < com_virgula):
        # Era a última do array: quem perde a vírgula é o elemento anterior.
        bloco = texto[i:ultima + len("\n  }\n")]
        if bloco.count('\n    method: "') != 1:
            raise SystemExit(f"! o recorte de {num} pegaria mais de uma entrada")
        antes = texto[:i]
        if not antes.endswith("  },\n"):
            raise SystemExit(f"! o elemento anterior a {num} não termina em vírgula")
        return antes[:-len("  },\n")] + "  }\n" + texto[ultima + len("\n  }\n"):]
    j = com_virgula + len("\n  },\n")
    if texto[i:j].count('\n    method: "') != 1:
        raise SystemExit(f"! o recorte de {num} pegaria mais de uma entrada")
    return texto[:i] + texto[j:]


# ── O acervo não enxerga material de projeto ─────────────────────────────────
#
# Sem isto, o isolamento seria só de tela: o material apareceria na listagem de
# Arquivos e, pior, um id conhecido baixaria ou apagaria por `/arquivos/:id`.
# A porta do material é o projeto, e só.
ACERVO = {
    "490a1": "// 490a1 arquivos GET /arquivos",
    "490a3": "// 490a3 arquivos GET /arquivos/:id",
    "490a4": "// 490a4 arquivos DELETE /arquivos/:id",
}
CONST_ANC = "function _podeVerArquivo(eu, arq) {"
CONST = 'var ESCOPO_MATERIAL = "%s";\n' % ESCOPO

LISTA_ANC = '    if (a.apagado_em || String(a.ativo || "sim") !== "sim") continue;\n'
LISTA_NOVO = (
    '    // Material de projeto não é do acervo: a porta dele é o projeto.\n'
    '    if (String(a.escopo || "") === ESCOPO_MATERIAL) continue;\n'
)
UM_ANC = ('  if (!arq || arq.apagado_em) return ctx.reply.status(404)'
          '.send({ success: false, error: "Arquivo não encontrado" });\n')
UM_NOVO = (
    '  // Material de projeto não é do acervo: id conhecido não vira download\n'
    '  // nem exclusão por aqui. A porta dele é /projetos/:id/materiais.\n'
    '  if (String(arq.escopo || "") === ESCOPO_MATERIAL) {\n'
    '    return ctx.reply.status(404).send({ success: false, error: "Arquivo não encontrado" });\n'
    '  }\n'
)


def fecha_o_acervo(texto):
    """Insere a trava de escopo nas três rotas do acervo que alcançam arquivo."""
    mexidas = []
    for num, marca in ACERVO.items():
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
        cod = json.loads(texto[i:j + 1])
        if "ESCOPO_MATERIAL" in cod:
            continue
        if cod.count(CONST_ANC) != 1:
            raise SystemExit(f"! {num}: a âncora da constante aparece {cod.count(CONST_ANC)}x")
        novo = cod.replace(CONST_ANC, CONST + CONST_ANC)
        anc, troca = (LISTA_ANC, LISTA_NOVO) if num == "490a1" else (UM_ANC, UM_NOVO)
        if novo.count(anc) != 1:
            raise SystemExit(f"! {num}: a âncora da trava aparece {novo.count(anc)}x")
        novo = novo.replace(anc, anc + troca)
        # Duas: a declaração e o uso. Três seria sinal de que a âncora casou
        # onde eu não queria.
        if novo.count("ESCOPO_MATERIAL") != 2:
            raise SystemExit(
                f"! {num}: a constante aparece {novo.count('ESCOPO_MATERIAL')}x, esperado 2")
        texto = texto[:i] + json.dumps(novo) + texto[j + 1:]
        mexidas.append(num)
    return texto, mexidas


def main():
    sync = "--sync-routes" in sys.argv
    texto = open(ROTAS, encoding="utf-8").read()
    texto, fechadas = fecha_o_acervo(texto)

    for num, metodo, caminho, _ in AS_ROTAS:
        texto = remover(texto, num, metodo, caminho)
    total = texto.count('\n    method: "')

    prel = preludio(texto) + tipos_e_teto(texto) + "\n" \
        + 'var ESCOPO_MATERIAL = "%s";\n' % ESCOPO

    fim = "\n  }\n]"
    if texto.count(fim) != 1:
        raise SystemExit(f"! o fecho do array aparece {texto.count(fim)}x")

    novas = []
    for i, (num, metodo, caminho, arquivo) in enumerate(AS_ROTAS):
        cod = prel + corpo(arquivo)
        # O que a geração promete, conferido e não suposto.
        if cod.count("var ESCOPO_MATERIAL") != 1:
            raise SystemExit(f"! {num}: a constante de escopo apareceria mais de uma vez")
        if "ESCOPO_MATERIAL" not in cod[cod.index("async function handler(ctx)"):]:
            raise SystemExit(f"! {num}: o handler não usa a trava de escopo")
        if cod.index("_perfilDe(ctx)") > cod.index("ctx.params.id"):
            raise SystemExit(f"! {num}: a identidade ficaria depois de usar o parâmetro")
        novas.append(entrada(num, metodo, caminho, cod, i == len(AS_ROTAS) - 1))

    fecha = texto.rindex(fim)
    # Cada entrada já traz a própria vírgula (menos a última): juntar com
    # ",\n" acrescentava uma segunda e o array saía com `},,`. Os literais
    # continuavam compilando — é o arquivo em volta que fica quebrado.
    saida = texto[:fecha] + "\n  },\n" + "\n".join(novas) + "\n]" + texto[fecha + len(fim):]
    esperado = total + len(AS_ROTAS)
    if saida.count('\n    method: "') != esperado:
        raise SystemExit(
            f"! o total ficou {saida.count(chr(10) + '    method: ')}, esperado {esperado}")

    if not sync:
        for num, metodo, caminho, _ in AS_ROTAS:
            print(f"   → registraria {metodo} {caminho}")
        print(f"   → {total} → {esperado} rotas")
        if fechadas:
            print(f"   → trava de escopo em {', '.join(sorted(fechadas))}")
        print("\n   (simulação — use --sync-routes)")
        return
    open(ROTAS, "w", encoding="utf-8").write(saida)
    print(f"→ 4 rotas de materiais registradas ({total} → {esperado} rotas)")
    if fechadas:
        print(f"→ trava de escopo em {', '.join(sorted(fechadas))}")


if __name__ == "__main__":
    main()
