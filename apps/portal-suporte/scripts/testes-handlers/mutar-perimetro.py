#!/usr/bin/env python3
# =============================================================================
# Mutações de perimetro-sem-pessoa.test.js.
#
# Cada mutação finge um defeito real e tem de reprovar numa asserção NOMEADA.
# Mutação que não aplica, ou que reprova por exceção em vez de asserção, conta
# como FALHA do runner: mutante não executado não é mutante morto.
#
# As que mexem no backend mudam o literal de UMA rota, achada pelo par
# método+caminho — âncora de texto solta no arquivo inteiro aparece sete vezes
# e acerta a rota errada.
#
# Vive no repositório de propósito: quem revisar depois tem de poder repetir a
# prova. Runner de mutação no scratchpad morre com a sessão.
#
#   python3 apps/portal-suporte/scripts/testes-handlers/mutar-perimetro.py
# =============================================================================

import os
import re
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
TESTE = os.path.join(AQUI, "perimetro-sem-pessoa.test.js")
TESTE_SESSAO = os.path.join(AQUI, "auth-sessao-estado-admin.test.js")
ROTAS = os.path.abspath(os.path.join(
    AQUI, "../../../../packages/api/src/apps/portal-suporte/routes.generated.ts"))

RE_ENTRADA = re.compile(
    r'\{\s*\n((?:(?!handler:)[\s\S]){0,900}?)handler: compileController\("((?:[^"\\]|\\.)*)"\)')

INVOLUCRO = "module.exports = { handler: _gsComSessao };"


def no_literal(chave, de, para):
    """Troca `de` por `para` dentro do literal da rota `chave` ("GET /x")."""
    def aplicar(texto):
        for m in RE_ENTRADA.finditer(texto):
            met = re.search(r'method:\s*"([^"]+)"', m.group(1))
            pth = re.search(r'path:\s*"([^"]+)"', m.group(1))
            if not met or not pth:
                continue
            if f"{met.group(1)} {pth.group(1)}" != chave:
                continue
            lit = m.group(2)
            if lit.count(de) != 1:
                return None, f"âncora aparece {lit.count(de)}× no literal de {chave}"
            return texto[:m.start(2)] + lit.replace(de, para, 1) + texto[m.end(2):], None
        return None, f"rota {chave} não encontrada"
    return aplicar


def no_arquivo(de, para):
    def aplicar(texto):
        if texto.count(de) != 1:
            return None, f"âncora aparece {texto.count(de)}× (precisa ser 1)"
        return texto.replace(de, para, 1), None
    return aplicar


# (nome, arquivo, aplicação, trecho que tem de aparecer na asserção reprovada
#  [, arquivo de teste a rodar — por omissão o do perímetro])
MUTACOES = [
    # Invólucro definido no corpo e exportação entregando o handler cru — o
    # jeito de a guarda existir no código e não valer.
    ("GET /projetos perde o invólucro na exportação", ROTAS,
     no_literal("GET /projetos", INVOLUCRO, "module.exports = { handler };"),
     "nenhuma rota de negócio responde sem pessoa"),
    # Literal corrompido: tem de reprovar, nunca ser PULADO em silêncio.
    ("o literal de GET /admin/units não compila", ROTAS,
     no_literal("GET /admin/units", INVOLUCRO, "function {"),
     "todo literal decodifica, compila e exporta handler"),
    # Rota pública tirada da lista: a varredura tem de passar a acusá-la.
    ("rota pública sai da lista", TESTE,
     no_arquivo("  'GET /health': 'health check',\n", ""),
     "nenhuma rota de negócio responde sem pessoa"),
    # Entrada que não existe mais no arquivo (lista apodrecendo).
    ("lista ganha rota inexistente", TESTE,
     no_arquivo("const PUBLICAS = {\n",
                "const PUBLICAS = {\n  'GET /rota/que/nao/existe': 'inventada',\n"),
     "toda rota de PUBLICAS existe no arquivo"),
    # Entrada para rota que HOJE recusa: tem de sair da lista, não ficar como
    # buraco permanente.
    ("lista ganha rota que já recusa", TESTE,
     no_arquivo("const PUBLICAS = {\n",
                "const PUBLICAS = {\n  'GET /admin/teams': 'nao deveria estar aqui',\n"),
     "de fato responde sem pessoa"),
    # A régua afrouxada: erro tratado como proteção.
    ("varredura passa a aceitar 500 como recusa", TESTE,
     no_arquivo("const recusou = resp.status === 401 || resp.status === 403",
                "const recusou = resp.status === 401 || resp.status === 403 || resp.status === 500"),
     "a varredura acusa 500 sem pessoa"),
    # Estouro e tempo esgotado voltando para o vão: a rota rodou o corpo sem
    # pessoa e a varredura diria que está protegida.
    ("régua volta a ignorar estouro", TESTE,
     no_arquivo("""        status: resp.estouro ? `estouro: ${resp.estouro}` : resp.status,\n""",
                """        status: resp.status,\n"""),
     "a-varredura-acusa-rota-que-estoura"),
    ("régua volta a engolir estouro e tempo esgotado", TESTE,
     no_arquivo("    const recusou = resp.status === 401 || resp.status === 403\n",
                "    const recusou = typeof resp.status !== 'number'\n"
                "      || (resp.status === 401 || resp.status === 403)\n"),
     "a-varredura-acusa-rota-que-nunca-responde"),
    # A rota de telemetria perdendo a guarda: tem de reprovar nos DOIS testes.
    ("a telemetria de sessão perde o invólucro", ROTAS,
     no_literal("GET /auth/sessao/estado", INVOLUCRO, "module.exports = { handler };"),
     "nenhuma rota de negócio responde sem pessoa"),
    ("a telemetria de sessão perde o invólucro (teste próprio)", ROTAS,
     no_literal("GET /auth/sessao/estado", INVOLUCRO, "module.exports = { handler };"),
     "sem-pessoa:recusa-com-401", TESTE_SESSAO),
    ("a telemetria de sessão cai para developer", ROTAS,
     # No arquivo o literal guarda as aspas escapadas: procurar a forma crua
     # não casa nada, e o mutante sai como NÃO APLICOU em vez de morto.
     no_literal("GET /auth/sessao/estado",
                '_gsRANK[\\"admin\\"]', '_gsRANK[\\"developer\\"]'),
     "nivel-abaixo-de-admin-recusa:developer", TESTE_SESSAO),
    # A credencial deixa de ser sem pessoa: a varredura perde o sentido, e as
    # 401 que ela colhe passam a ser um acaso do laboratório.
    ("a sonda passa a carregar uma pessoa", TESTE,
     no_arquivo("      user: { type: 'apiKey' },",
                "      user: { type: 'user', id: 'u9', profile_id: 'u9', role: 'admin' },"),
     "nenhuma rota de negócio responde sem pessoa"),
    # O controle desarmado: sem ele, "nenhuma rota aberta" poderia ser só um
    # laboratório que não enxerga rota aberta.
    ("o controle para de tirar o invólucro", TESTE,
     no_arquivo("      .join('module.exports = { handler };')",
                "      .join('module.exports = { handler: _gsComSessao };')"),
     "estava protegida pelo invólucro"),
]


def main():
    originais = {a: open(a, encoding="utf8").read() for a in (TESTE, TESTE_SESSAO, ROTAS)}
    mortos, vivos = 0, []
    for mut in MUTACOES:
        nome, arq, aplicar, esperado = mut[:4]
        qual = mut[4] if len(mut) > 4 else TESTE
        mutado, erro = aplicar(originais[arq])
        if erro:
            vivos.append(f"{nome}: NÃO APLICOU — {erro}")
            continue
        try:
            open(arq, "w", encoding="utf8").write(mutado)
            r = subprocess.run(["node", qual], capture_output=True, text=True, cwd=AQUI)
            saida = r.stdout + r.stderr
            linhas = [l for l in saida.splitlines() if l.startswith("FALHA")]
            if r.returncode == 0:
                vivos.append(f"{nome}: VIVO (o teste passou com o defeito)")
            elif not linhas:
                vivos.append(f"{nome}: reprovou SEM asserção -> {saida.strip().splitlines()[-3:]}")
            elif not any(esperado in l for l in linhas):
                vivos.append(f"{nome}: reprovou na asserção errada -> {linhas}")
            else:
                mortos += 1
                alvo = [l for l in linhas if esperado in l][0]
                print(f"   ✓ morto: {nome}\n       {alvo.strip()[:150]}")
        finally:
            open(arq, "w", encoding="utf8").write(originais[arq])

    for arq, texto in originais.items():
        assert open(arq, encoding="utf8").read() == texto, f"{arq} não foi restaurado"
    print(f"\n   {mortos}/{len(MUTACOES)} mutantes mortos; arquivos restaurados byte a byte")
    if vivos:
        print("\n   SOBREVIVENTES:")
        for v in vivos:
            print(f"      {v}")
        sys.exit(1)


if __name__ == "__main__":
    main()
