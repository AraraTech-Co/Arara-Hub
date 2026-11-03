#!/usr/bin/env python3
# =============================================================================
# Mutação do rótulo do seletor de acesso em Arquivos.
#
# Teste que lê texto de tela precisa provar que o texto que ele procura é o que
# mudou: sem isto, "o rótulo antigo saiu" passaria em qualquer arquivo que não
# contivesse a frase, inclusive num arquivo vazio.
#
#   python3 apps/portal-suporte/scripts/testes-handlers/mutar-arquivos-rotulo.py
# =============================================================================

import os
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PS = os.path.dirname(os.path.dirname(AQUI))
TELA = os.path.join(PS, "app", "(admin)", "admin", "arquivos", "page.tsx")
GRANTS = os.path.join(PS, "app", "lib", "auth", "feature-grants.ts")
TESTE = os.path.join(AQUI, "arquivos-rotulo-do-acesso.test.js")

MUTANTES = [
    ("o-rotulo-volta-ao-antigo", TELA,
     "Só quem tem a permissão: {g.label}", "Só quem tem: {g.label}",
     "o-rotulo-diz-que-e-permissao"),
    ("a-descricao-some-do-alcance", TELA,
     " title={g.description}", "",
     "a-descricao-da-permissao-fica-ao-alcance"),
    # O valor é o contrato com o servidor: mudá-lo quebraria o ACL de todo
    # arquivo já enviado.
    ("o-valor-enviado-muda-junto-com-o-rotulo", TELA,
     "value={`grant:${g.key}`}", "value={`permissao:${g.key}`}",
     "o-valor-enviado-ao-servidor-nao-mudou"),
    # A descrição é escrita em pedaços concatenados: cortar só a primeira
    # linha deixa o resto somando e o mutante sobrevive. Tem de sair inteira.
    ("uma-permissao-fica-sem-descricao", GRANTS,
     "    description:\n"
     "      'Dá acesso ao módulo de Projetos — ver os projetos, o cronograma e as atividades. '\n"
     "      + 'É só o acesso: planejar (criar projeto, mexer em data) continua sendo '\n"
     "      + '\"Planejamento de projetos\", que é outra permissão.',\n",
     "    description: '',\n",
     "toda-permissao-tem-rotulo-e-descricao"),
]


def main():
    originais = {a: open(a, encoding="utf8").read() for a in (TELA, GRANTS)}
    mortos, vivos = 0, []
    for nome, arq, de, para, esperada in MUTANTES:
        texto = originais[arq]
        if texto.count(de) != 1:
            vivos.append(f"{nome}: âncora aparece {texto.count(de)}× (precisa ser 1)")
            continue
        try:
            open(arq, "w", encoding="utf8").write(texto.replace(de, para, 1))
            r = subprocess.run(["node", TESTE], capture_output=True, text=True, cwd=AQUI)
            linhas = [l for l in (r.stdout + r.stderr).splitlines() if l.startswith("FALHA")]
            if r.returncode == 0:
                vivos.append(f"{nome}: VIVO (o teste passou com a mudança)")
            elif not any(esperada in l for l in linhas):
                vivos.append(f"{nome}: reprovou na asserção errada -> {linhas or r.stderr[-200:]}")
            else:
                mortos += 1
                print(f"   ✓ morto: {nome}  -> {esperada}")
        finally:
            open(arq, "w", encoding="utf8").write(originais[arq])

    for arq, texto in originais.items():
        assert open(arq, encoding="utf8").read() == texto, f"{arq} não restaurado"
    print(f"\n   {mortos}/{len(MUTANTES)} mortos; arquivos restaurados byte a byte")
    if vivos:
        print("\n   SOBREVIVENTES:")
        for v in vivos:
            print(f"      {v}")
        sys.exit(1)


if __name__ == "__main__":
    main()
