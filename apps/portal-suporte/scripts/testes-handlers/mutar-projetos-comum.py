#!/usr/bin/env python3
# =============================================================================
# Mutação do teste de desvio do bloco COMUM de `projetos`.
#
# Vai versionado de propósito: o runner vivia no scratchpad da sessão, que morre
# com ela, e quem revisar depois não tinha como repetir a prova. Cada mutante
# tem de morrer NA ASSERÇÃO QUE O NOMEIA — morrer em outra, ou morrer por
# exceção, não conta; mutante cuja âncora não casa é listado como NÃO APLICOU e
# reprova, nunca entra na conta de mortos.
#
# Roda com: python3 mutar-projetos-comum.py
# =============================================================================

import io, json, os, subprocess, sys

PS = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GER = os.path.join(PS, '..', '..', 'packages', 'api', 'src', 'apps', 'portal-suporte', 'routes.generated.ts')
SCR = os.path.join(PS, 'scripts', '_projetos_comum.py')
T = os.path.join(PS, 'scripts', 'testes-handlers', 'projetos-comum-nao-divergiu.test.js')
MARCA = "// 293 projetos GET /projetos/:id"

MUTANTES = [
    # o defeito original, de volta
    ("o-script-perde-em-revisao", SCR,
     "  desenvolvimento_finalizado: 50, em_revisao: 60,\n",
     "  desenvolvimento_finalizado: 50,\n", 1,
     'nenhuma-faixa-de-progresso-sobra-no-ar'),
    ("o-script-muda-uma-faixa", SCR,
     "pronto_para_teste: 70, em_testes: 80,", "pronto_para_teste: 70, em_testes: 85,", 1,
     'nenhuma-faixa-de-progresso-mudou-de-valor'),
    ("o-script-inventa-uma-faixa", SCR,
     "  aplicado_no_cliente: 100,\n", "  aplicado_no_cliente: 100, em_homologacao: 95,\n", 1,
     'nenhuma-faixa-de-progresso-falta-no-ar'),
    ("o-script-muda-a-porta-de-ver", SCR,
     "function _podeVer(eu) {", "function _podeVer(eu) {\n  return true;", 1,
     'o-codigo-do-bloco-e-igual-em-todo-handler'),
    # o laboratorio tem de medir
    ("o-bloco-do-script-volta-vazio", T,
     "  return fonte.slice(ini, fecha).replace(/\\\\\\\\/g, '\\\\')",
     "  return ''", 1,
     'o-bloco-do-script-foi-lido'),
    ("a-tabela-volta-sempre-vazia", T,
     "  const pares = {}", "  const pares = {}\n  return pares", 1,
     'o-script-tem-a-tabela-de-progresso'),
    # Afrouxar o `>= 18` nao muda nada com 18 handlers: mutante equivalente.
    # O risco de verdade e o conjunto vir VAZIO — ai todo laco abaixo roda zero
    # vez e as comparacoes passam sem comparar. E esse que tem de morrer.
    ("a-varredura-nao-acha-handler-nenhum", T,
     "h.corpo.includes('var _PCT = {')", "h.corpo.includes('var _PCT = {NUNCA')", 1,
     'os-handlers-do-modulo-foram-achados'),
]

# no literal decodificado de UM handler: um apply parcial
MUTANTES_LITERAL = [
    ("um-handler-perde-em-revisao", MARCA,
     "  desenvolvimento_finalizado: 50, em_revisao: 60,",
     "  desenvolvimento_finalizado: 50,",
     'nenhuma-faixa-de-progresso-falta-no-ar'),
    ("um-handler-muda-a-porta-de-ver", MARCA,
     "function _podeVer(eu) {",
     "function _podeVer(eu) {\n  return true;",
     'o-codigo-do-bloco-e-igual-em-todo-handler'),
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


def roda():
    r = subprocess.run(['node', T], cwd=os.path.dirname(T), capture_output=True, text=True)
    s = r.stdout + r.stderr
    out = [l[5:].split('  -> ')[0].strip() for l in s.splitlines() if l.startswith('FALHA')]
    if 'todos os casos passaram' not in s and not out:
        out.append('<excecao no teste>')
    return out


bases = {p: io.open(p, encoding='utf-8').read() for p in (GER, SCR, T)}
if roda():
    sys.exit('! base ja reprova')
print('base limpa\n')
vivos, pulados = [], []

for nome, arq, de, para, vezes, esperada in MUTANTES:
    texto = bases[arq]
    if texto.count(de) != vezes:
        pulados.append((nome, f'ancora {texto.count(de)}x, esperado {vezes}')); continue
    io.open(arq, 'w', encoding='utf-8').write(texto.replace(de, para))
    try:
        fs = roda()
    finally:
        io.open(arq, 'w', encoding='utf-8').write(texto)
    casou = [f for f in fs if esperada in f]
    print(('MORTO  ' if casou else 'VIVO   ') + nome +
          ('  -> ' + casou[0] if casou else f'  (esperava {esperada!r}; falhou: {fs[:3]})'))
    if not casou: vivos.append(nome)

for nome, marca, de, para, esperada in MUTANTES_LITERAL:
    base = bases[GER]
    i, j, cod = literal(base, marca)
    if cod.count(de) != 1:
        pulados.append((nome, f'ancora {cod.count(de)}x no literal')); continue
    io.open(GER, 'w', encoding='utf-8').write(base[:i] + json.dumps(cod.replace(de, para)) + base[j:])
    try:
        fs = roda()
    finally:
        io.open(GER, 'w', encoding='utf-8').write(base)
    casou = [f for f in fs if esperada in f]
    print(('MORTO  ' if casou else 'VIVO   ') + nome +
          ('  -> ' + casou[0] if casou else f'  (esperava {esperada!r}; falhou: {fs[:3]})'))
    if not casou: vivos.append(nome)

total = len(MUTANTES) + len(MUTANTES_LITERAL)
print(f'\n{total - len(vivos) - len(pulados)}/{total} mortos')
for n, p in pulados:
    print(f'  NAO APLICOU {n}: {p}')
for p, texto in bases.items():
    if io.open(p, encoding='utf-8').read() != texto:
        sys.exit('! nao restaurei ' + p)
print('arquivos restaurados byte a byte')
if vivos or pulados:
    sys.exit(1)
