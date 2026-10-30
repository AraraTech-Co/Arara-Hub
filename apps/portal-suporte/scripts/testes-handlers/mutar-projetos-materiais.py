#!/usr/bin/env python3
# =============================================================================
# Mutação dos Materiais de Apoio do projeto.
#
# Vai versionado para a prova ser repetível por quem revisar. Cada mutante tem
# de morrer NA ASSERÇÃO QUE O NOMEIA; morrer em outra, ou por exceção, não
# conta, e mutante cuja âncora não casa é listado como NÃO APLICOU e reprova em
# vez de entrar na conta de mortos.
#
# A mutação é feita no literal DECODIFICADO de cada handler e o literal é
# reescrito inteiro: no arquivo de rotas os acentos vão escapados, e procurar o
# texto com acento no arquivo cru não casa nada.
#
# Roda com: python3 mutar-projetos-materiais.py
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
TESTE = "projetos-materiais.test.js"
TESTE_TELA = "projetos-materiais-tela.test.js"
TESTE_MODULO = "projetos-porta-de-acesso.test.js"
TELA_LIB = os.path.join(PS, "app", "lib", "projetos-materiais.ts")
TELA_BLOCO = os.path.join(PS, "app", "_components", "projetos", "materiais-do-projeto.tsx")

LISTAR = "// 512 projetos GET /projetos/:id/materiais"
ENVIAR = "// 513 projetos POST /projetos/:id/materiais"
BAIXAR = "// 514 projetos GET /projetos/:id/materiais/:mid/conteudo"
APAGAR = "// 515 projetos DELETE /projetos/:id/materiais/:mid"
ACERVO_LISTA = "// 490a1 arquivos GET /arquivos"
ACERVO_UM = "// 490a3 arquivos GET /arquivos/:id"
ACERVO_APAGA = "// 490a4 arquivos DELETE /arquivos/:id"

TRAVA_UM = (
    '  if (String(arq.escopo || "") === ESCOPO_MATERIAL) {\n'
    '    return ctx.reply.status(404).send({ success: false, error: "Arquivo não encontrado" });\n'
    '  }\n'
)

# (nome, marca do handler, de, para, asserção que deve falhar)
MUTANTES = [
    # ── o isolamento ──
    # ── a guarda de sessão ──
    #
    # O invólucro é o que separa "credencial" de "pessoa". Tirá-lo de uma das
    # quatro devolve exatamente o buraco que foi ao ar.
    ("a-lista-volta-a-aceitar-chave-sem-pessoa", LISTAR,
     "module.exports = { handler: _gsComSessao };",
     "module.exports = { handler: handler };",
     "sessao:chave-sem-pessoa-recusa:512"),
    ("o-envio-volta-a-aceitar-chave-sem-pessoa", ENVIAR,
     "module.exports = { handler: _gsComSessao };",
     "module.exports = { handler: handler };",
     "sessao:chave-sem-pessoa-nao-grava:513"),
    ("o-download-volta-a-aceitar-chave-sem-pessoa", BAIXAR,
     "module.exports = { handler: _gsComSessao };",
     "module.exports = { handler: handler };",
     "sessao:chave-sem-pessoa-nao-devolve-dado:514"),
    ("o-apagar-volta-a-aceitar-chave-sem-pessoa", APAGAR,
     "module.exports = { handler: _gsComSessao };",
     "module.exports = { handler: handler };",
     "sessao:chave-sem-pessoa-nao-grava:515"),
    ("a-guarda-deixa-de-recusar-quem-nao-tem-pessoa", LISTAR,
     "  var eu = await _gsEuSou(ctx);\n  if (!eu) {",
     "  var eu = (await _gsEuSou(ctx)) || { id: \"\", nivel: 99 };\n  if (!eu) {",
     "sessao:sem-user-recusa:512"),
    # As três linhas que o Orquestrador achou sem guarda, e a regressão do
    # acervo. Cada uma tem agora um caso que só ela faz passar.
    ("o-apagar-aceita-apagar-de-novo", APAGAR,
     "      || m.apagado_em) {", "      || false) {",
     "apagar:material-ja-apagado-da-404"),
    ("o-apagar-ignora-de-que-projeto-e", APAGAR,
     '  if (!m || String(m.escopo || "") !== ESCOPO_MATERIAL\n'
     '      || String(m.projeto_id || "") !== projetoId\n',
     '  if (!m || String(m.escopo || "") !== ESCOPO_MATERIAL\n',
     "apagar:material-de-outro-projeto-da-404"),
    ("o-apagar-ignora-o-escopo", APAGAR,
     '  if (!m || String(m.escopo || "") !== ESCOPO_MATERIAL\n'
     '      || String(m.projeto_id || "") !== projetoId\n',
     '  if (!m\n      || String(m.projeto_id || "") !== projetoId\n',
     "apagar:linha-sem-escopo-mas-com-projeto-da-404"),
    ("o-download-ignora-so-o-escopo", BAIXAR,
     '  if (!m || String(m.escopo || "") !== ESCOPO_MATERIAL\n'
     '      || String(m.projeto_id || "") !== projetoId\n',
     '  if (!m\n      || String(m.projeto_id || "") !== projetoId\n',
     "baixar:linha-sem-escopo-mas-com-projeto-da-404"),
    ("o-material-volta-a-gravar-o-estado-do-acervo", ENVIAR,
     '      pasta: "",\n', '      pasta: "",\n      ativo: "sim",\n',
     "enviar:nao-grava-o-estado-que-o-acervo-filtra"),
    ("o-acervo-volta-a-listar-material", ACERVO_LISTA,
     '    if (String(a.escopo || "") === ESCOPO_MATERIAL) continue;\n', "",
     "acervo:material-com-estado-do-acervo-ainda-assim-nao-aparece"),
    ("o-acervo-volta-a-baixar-material", ACERVO_UM, TRAVA_UM, "",
     "acervo:baixar-material-pelo-acervo-da-404"),
    ("o-acervo-volta-a-apagar-material", ACERVO_APAGA, TRAVA_UM, "",
     "acervo:apagar-material-pelo-acervo-da-404"),
    # ── a listagem do projeto ──
    ("a-lista-volta-a-ler-sem-filtro", LISTAR,
     "await A.findMany({ projeto_id: projetoId, limit: 500 })",
     "await A.findMany({})",
     "lista:acima-de-500-o-material-continua-aparecendo"),
    # Tirar a conferência de projeto DENTRO do laço é mutante equivalente: o
    # filtro já foi para a camada e ela o aplica. A linha fica como defesa para
    # o dia em que a leitura mudar, e quem a cobre é o mutante que devolve a
    # leitura para `findMany({})` — esse morre.
    ("a-lista-mostra-apagado", LISTAR,
     "    if (a.apagado_em) continue;\n", "",
     "lista:traz-so-os-do-projeto-e-ativos"),
    ("a-lista-devolve-o-conteudo", LISTAR,
     "      dono_id: a.dono_id, criado_em: a.criado_em || a.created_at || \"\",",
     "      dono_id: a.dono_id, criado_em: a.criado_em || a.created_at || \"\", conteudo: a.conteudo,",
     "lista:nao-devolve-o-conteudo"),
    # ── enviar ──
    ("o-envio-nao-marca-o-escopo", ENVIAR,
     "      escopo: ESCOPO_MATERIAL,\n", "",
     "enviar:grava-com-escopo-de-projeto"),
    ("o-envio-nao-guarda-o-projeto", ENVIAR,
     "      projeto_id: projetoId,\n", "",
     "enviar:grava-o-projeto"),
    ("o-envio-aceita-qualquer-tipo", ENVIAR,
     "  if (TIPOS.indexOf(tipo) < 0) {", "  if (false) {",
     "enviar:tipo-fora-da-lista-recusa"),
    ("o-envio-acredita-no-tamanho-declarado", ENVIAR,
     "  if (bytes > MAX_BYTES) {", "  if (Number(b.tamanho || 0) > MAX_BYTES) {",
     "enviar:acima-de-10mb-recusa"),
    ("o-envio-aceita-base64-invalido", ENVIAR,
     "  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {", "  if (!base64) {",
     "enviar:base64-invalido-recusa"),
    ("o-envio-deixa-metadado-orfao", ENVIAR,
     "    try { if (A.delete) await A.delete(id); } catch (e2) {",
     "    try { if (false) await A.delete(id); } catch (e2) {",
     "enviar:conteudo-que-falha-apaga-o-metadado"),
    ("o-envio-nao-limpa-o-nome", ENVIAR,
     '    .replace(/[\\\\/]/g, "-")\n', "",
     "enviar:limpa-o-nome"),
    # ── baixar ──
    ("o-download-ignora-o-escopo", BAIXAR,
     '  if (!m || String(m.escopo || "") !== ESCOPO_MATERIAL\n'
     '      || String(m.projeto_id || "") !== projetoId\n',
     '  if (!m\n',
     "baixar:arquivo-do-acervo-por-esta-rota-da-404"),
    # ── apagar ──
    ("qualquer-um-apaga", APAGAR,
     '  if (!(sou && String(m.dono_id || "") === sou) && !_podePlanejar(eu)) {',
     "  if (false) {",
     "apagar:quem-nao-enviou-nem-planeja-recusa"),
    ("apagar-deixa-de-ser-logico", APAGAR,
     "  await A.update(String(m.id), { apagado_em: _agora() });",
     "  await A.delete(String(m.id));",
     "apagar:apagar-e-logico"),
    ("o-dono-fica-trancado-fora", APAGAR,
     '  if (!(sou && String(m.dono_id || "") === sou) && !_podePlanejar(eu)) {',
     "  if (!_podePlanejar(eu)) {",
     "apagar:o-dono-apaga-o-que-enviou"),
    # ── a porta ──
    ("a-lista-sem-porta", LISTAR,
     '  if (!_podeVer(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para ver projetos" });\n',
     "",
     "porta:sem-o-campo-recusa:512"),
]

# O laboratório tem de medir: um fake que devolvesse tudo faria o caso de
# acervo grande passar sem provar nada.
NO_TESTE = [
    ("o-fake-deixa-de-respeitar-o-teto",
     "          findMany: async (f) => camadaFindMany(arquivos, f),",
     "          findMany: async () => arquivos.slice(),",
     "lista:o-teto-da-camada-esconderia-o-material"),
]


# A tela: régua própria é régua que diverge, e forma inesperada não pode
# estourar no meio da renderização.
NA_TELA = [
    ("a-leitura-da-resposta-estoura", TELA_LIB,
     "  if (!resposta || typeof resposta !== 'object') {\n"
     "    return { ...vazio, erro: 'Resposta inesperada ao ler os materiais.' }\n"
     "  }\n",
     "",
     "forma-estranha-nao-estoura:nulo"),
    ("a-leitura-engole-forma-estranha-sem-recado", TELA_LIB,
     "  if (!Array.isArray(bruto)) {\n"
     "    return { ...vazio, erro: 'Resposta inesperada ao ler os materiais.' }\n"
     "  }\n",
     "  if (!Array.isArray(bruto)) {\n    return vazio\n  }\n",
     "forma-estranha-vira-lista-vazia-com-recado:materiais-objeto"),
    ("a-tela-deixa-qualquer-um-apagar", TELA_LIB,
     "  return !!eu && String(material.dono_id || '') === eu",
     "  return true",
     "apagar:servidor-e-tela-dizem-o-mesmo:estranho"),
    ("a-tela-tranca-o-dono-fora", TELA_LIB,
     "  return !!eu && String(material.dono_id || '') === eu",
     "  return false",
     "apagar:servidor-e-tela-dizem-o-mesmo:o-dono"),
    ("o-teto-da-tela-desgruda-do-servidor", TELA_LIB,
     "export const MAX_BYTES = 10 * 1024 * 1024",
     "export const MAX_BYTES = 20 * 1024 * 1024",
     "recusa:o-teto-da-tela-e-o-do-servidor"),
    ("a-tela-para-de-recusar-antes-de-ler", TELA_LIB,
     "  if (Number(arquivo.size) > MAX_BYTES) {", "  if (false) {",
     "recusa:acima-do-limite-avisa-antes-de-ler"),
    ("a-mensagem-do-servidor-e-ignorada", TELA_LIB,
     "  return typeof erro === 'string' && erro.trim() ? erro : padrao",
     "  return padrao",
     "erro:a-mensagem-do-servidor-vence"),
    ("o-bloco-esconde-o-botao-de-quem-pode", TELA_BLOCO,
     "                {podeApagarMaterial(m, { meuId, podePlanejar }) && (",
     "                {false && (",
     "a-tela-usa-a-regra-de-apagar"),
    # ── lista longa ──
    #
    # Sem estes, "o bloco recolhe e filtra" seria texto num arquivo: o acervo
    # volta a esticar a página e ninguém reprova. Os três primeiros são os que
    # o Orquestrador achou vivos quando a decisão ainda morava no JSX e a
    # asserção só procurava `aria-expanded` no arquivo.
    ("recolhido-volta-a-desenhar-a-lista", TELA_LIB,
     "  if (!estado.aberto) return nada\n", "",
     "recolhido:nao-desenha-nada:acervo-grande"),
    ("o-clique-deixa-de-alternar", TELA_BLOCO,
     "onClick={() => setAberto(alternar)}", "onClick={() => {}}",
     "o-clique-usa-a-regua"),
    ("alternar-devolve-sempre-o-mesmo", TELA_LIB,
     "export function alternar(aberto: boolean): boolean {\n  return !aberto\n}",
     "export function alternar(aberto: boolean): boolean {\n  return aberto\n}",
     "alternar-abre-e-fecha"),
    # A régua que desenha o tempo todo passaria em "recolhido não desenha
    # nada" se não houvesse o contraste com o mesmo acervo aberto.
    ("a-regua-nunca-desenha-a-lista", TELA_LIB,
     "  return { lista, mostrarBusca: muitos,",
     "  return { lista: [], mostrarBusca: muitos,",
     "aberto:o-mesmo-acervo-aparece"),
    ("o-bloco-volta-a-decidir-por-fora", TELA_BLOCO,
     "      {vista.lista.length > 0 && (", "      {aberto && vista.lista.length > 0 && (",
     "o-bloco-nao-decide-nada-por-fora"),
    ("a-busca-aparece-sempre", TELA_LIB,
     "  return { lista, mostrarBusca: muitos,", "  return { lista, mostrarBusca: true,",
     "busca-aparece-so-acima-do-limiar"),
    ("o-recado-de-vazio-ignora-o-erro", TELA_LIB,
     "  const vazio = !estado.carregando && !estado.erro && materiais.length === 0",
     "  const vazio = !estado.carregando && materiais.length === 0",
     "com-erro-nenhum-dos-recados-aparece"),
    ("o-recado-de-vazio-aparece-carregando", TELA_LIB,
     "  const vazio = !estado.carregando && !estado.erro && materiais.length === 0",
     "  const vazio = !estado.erro && materiais.length === 0",
     "carregando-nao-diz-que-nao-ha-material"),
    ("os-dois-recados-viram-um-so", TELA_LIB,
     "    ? 'Nenhum material com esse nome. A busca ignora acento e maiúscula.'",
     "    ? 'Nenhum material ainda. Envie o que o projeto precisa ter à mão — escopo, contrato, planilha. Vale só dentro deste projeto.'",
     "os-dois-recados-nao-se-confundem"),
    ("a-regua-estoura-sem-a-lista", TELA_LIB,
     "  const materiais = estado.materiais || []", "  const materiais = estado.materiais",
     "materiais-ausente-nao-estoura"),
    ("a-busca-passa-a-copiar-a-lista-sempre", TELA_LIB,
     "  if (!alvo) return lista\n", "",
     "busca:vazia-nao-copia-a-lista"),
    ("a-busca-volta-a-exigir-acento-e-caixa", TELA_LIB,
     "  return String(texto || '')\n"
     "    .normalize('NFD')\n"
     "    .replace(/[\\u0300-\\u036f]/g, '')\n"
     "    .toLowerCase()\n"
     "    .trim()\n",
     "  return String(texto || '').trim()\n",
     "busca:ignora-acento"),
    ("a-busca-so-casa-o-comeco-do-nome", TELA_LIB,
     "return lista.filter((m) => dobrar(m.nome).includes(alvo))",
     "return lista.filter((m) => dobrar(m.nome).startsWith(alvo))",
     "busca:acha-no-meio-do-nome"),
    ("a-busca-deixa-de-filtrar", TELA_LIB,
     "return lista.filter((m) => dobrar(m.nome).includes(alvo))",
     "return lista",
     "busca:sem-resultado-devolve-vazio"),
    ("o-limiar-da-lista-longa-muda", TELA_LIB,
     "export const MUITOS = 8", "export const MUITOS = 40",
     "a-tela-e-o-teste-usam-o-mesmo-limiar"),
    ("a-lista-volta-a-crescer-sem-limite", TELA_BLOCO,
     'className="divide-y divide-border max-h-80 overflow-y-auto"',
     'className="divide-y divide-border"',
     "a-lista-rola-por-conta-propria"),
    ("o-titulo-volta-para-dentro-do-botao", TELA_BLOCO,
     "            <span>Materiais de Apoio</span>",
     "            <h2>Materiais de Apoio</h2>",
     "o-botao-fica-dentro-do-titulo"),
    ("o-botao-deixa-de-apontar-a-lista", TELA_BLOCO,
     '            aria-controls="materiais-do-projeto-lista"\n', "",
     "o-botao-aponta-para-a-lista-que-ele-recolhe"),
    ("o-bloco-deixa-de-recolher", TELA_BLOCO,
     "            aria-expanded={aberto}\n", "",
     "o-bloco-recolhe"),
    ("o-envio-deixa-o-arquivo-novo-invisivel", TELA_BLOCO,
     "        setAberto(true)\n        setBusca('')\n", "",
     "enviar-reabre-o-bloco-e-limpa-a-busca"),
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


def roda(teste=TESTE):
    r = subprocess.run(["node", teste], cwd=AQUI, capture_output=True, text=True)
    s = r.stdout + r.stderr
    fs = [l[5:].split("  -> ")[0].strip() for l in s.splitlines() if l.startswith("FALHA ")]
    if "todos os casos passaram" not in s and not fs:
        fs.append("<excecao no teste>")
    return fs


def main():
    caminho_teste = os.path.join(AQUI, TESTE)
    bases = {p: io.open(p, encoding="utf-8").read()
             for p in (GER, caminho_teste, TELA_LIB, TELA_BLOCO)}
    for teste in (TESTE, TESTE_TELA, TESTE_MODULO):
        if roda(teste):
            sys.exit(f"! base já reprova em {teste}")
    print("base limpa\n")
    vivos, pulados = [], []

    for nome, marca, de, para, esperada in MUTANTES:
        base = bases[GER]
        i, j, cod = literal(base, marca)
        if cod.count(de) != 1:
            pulados.append((nome, f"âncora {cod.count(de)}x no literal")); continue
        io.open(GER, "w", encoding="utf-8").write(
            base[:i] + json.dumps(cod.replace(de, para)) + base[j:])
        try:
            fs = roda()
        finally:
            io.open(GER, "w", encoding="utf-8").write(base)
        casou = [f for f in fs if esperada in f]
        print(("MORTO  " if casou else "VIVO   ") + nome +
              ("  -> " + casou[0] if casou else f"  (esperava {esperada!r}; falhou: {fs[:3]})"))
        if not casou:
            vivos.append(nome)

    for nome, de, para, esperada in NO_TESTE:
        base = bases[caminho_teste]
        if base.count(de) != 1:
            pulados.append((nome, f"âncora {base.count(de)}x")); continue
        io.open(caminho_teste, "w", encoding="utf-8").write(base.replace(de, para))
        try:
            fs = roda()
        finally:
            io.open(caminho_teste, "w", encoding="utf-8").write(base)
        casou = [f for f in fs if esperada in f]
        print(("MORTO  " if casou else "VIVO   ") + nome +
              ("  -> " + casou[0] if casou else f"  (esperava {esperada!r}; falhou: {fs[:3]})"))
        if not casou:
            vivos.append(nome)

    for nome, marca, de, para in [
        ("a-varredura-do-modulo-nao-ve-rota-sem-sessao", LISTAR,
         "module.exports = { handler: _gsComSessao };",
         "module.exports = { handler: handler };"),
    ]:
        base = bases[GER]
        i, j, cod = literal(base, marca)
        if cod.count(de) != 1:
            pulados.append((nome, f"âncora {cod.count(de)}x no literal")); continue
        io.open(GER, "w", encoding="utf-8").write(
            base[:i] + json.dumps(cod.replace(de, para)) + base[j:])
        try:
            fs = roda(TESTE_MODULO)
        finally:
            io.open(GER, "w", encoding="utf-8").write(base)
        esperada = "todo-handler-do-modulo-exige-sessao"
        casou = [f for f in fs if esperada in f]
        print(("MORTO  " if casou else "VIVO   ") + nome +
              ("  -> " + casou[0] if casou else f"  (esperava {esperada!r}; falhou: {fs[:3]})"))
        if not casou:
            vivos.append(nome)

    for nome, arq, de, para, esperada in NA_TELA:
        base = io.open(arq, encoding="utf-8").read()
        if base.count(de) != 1:
            pulados.append((nome, f"âncora {base.count(de)}x")); continue
        io.open(arq, "w", encoding="utf-8").write(base.replace(de, para))
        try:
            fs = roda(TESTE_TELA)
        finally:
            io.open(arq, "w", encoding="utf-8").write(base)
        casou = [f for f in fs if esperada in f]
        print(("MORTO  " if casou else "VIVO   ") + nome +
              ("  -> " + casou[0] if casou else f"  (esperava {esperada!r}; falhou: {fs[:3]})"))
        if not casou:
            vivos.append(nome)

    total = len(MUTANTES) + len(NO_TESTE) + len(NA_TELA) + 1
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
