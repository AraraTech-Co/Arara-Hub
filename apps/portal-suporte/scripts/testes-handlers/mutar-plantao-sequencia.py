#!/usr/bin/env python3
# =============================================================================
# Mutação do teste da sequência do plantão — com atenção ao modo "só backup",
# que escreve em dias JÁ LANÇADOS e por isso pode apagar escala combinada.
#
# Vai versionado de propósito: quem revisar depois tem de poder repetir a
# prova. Cada mutante morre NA ASSERÇÃO QUE O NOMEIA — morrer em outra, ou por
# exceção, não conta; mutante cuja âncora não casa é listado como NÃO APLICOU e
# reprova, nunca entra na conta de mortos.
#
# Roda com: python3 mutar-plantao-sequencia.py
# =============================================================================

import io, os, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PS = os.path.dirname(os.path.dirname(AQUI))
LIB = os.path.join(PS, 'app', 'lib', 'plantao-sequencia.ts')
T = os.path.join(AQUI, 'plantao-sequencia.test.js')

MUTANTES = [
    # ── o modo só-backup ────────────────────────────────────────────────────
    ("o-modo-so-backup-nunca-liga", LIB,
     "  const soBackup = temFilaDeBackup && (preencher === 'backup' || !plantao.ordem.length)",
     "  const soBackup = false",
     'fila só de backup preenche o mês já lançado'),
    ("o-modo-so-backup-liga-tambem-com-fila-de-plantao", LIB,
     "  const soBackup = temFilaDeBackup && (preencher === 'backup' || !plantao.ordem.length)",
     "  const soBackup = temFilaDeBackup",
     'com fila de plantão o modo só-backup não liga'),
    # ── o plantonista lançado ───────────────────────────────────────────────
    ("o-plantonista-lancado-e-descartado", LIB,
     "      const deQuem = ((atual && atual.agent_ids) || []).slice()",
     "      const deQuem = []",
     'o plantonista do dia é o que JÁ estava lançado'),
    ("o-retrato-do-dia-nao-entra-sem-substituicao", LIB,
     """        substituindo: atual
          ? { agentIds: (atual.agent_ids || []).slice(), backupIds: (atual.backup_ids || []).slice() }
          : null,
      })
      continue""",
     """        substituindo: null,
      })
      continue""",
     'mas o retrato do dia entra, para a conferência de antes de gravar'),
    ("o-dia-sem-plantonista-entra-no-lote", LIB,
     "      if (!deQuem.length) { semSequencia.push(data); continue }\n",
     "",
     'só-backup: nenhum dia do plano sai sem plantonista'),
    ("a-escolha-de-so-backup-e-ignorada", LIB,
     "  const soBackup = temFilaDeBackup && (preencher === 'backup' || !plantao.ordem.length)",
     "  const soBackup = temFilaDeBackup && !plantao.ordem.length",
     'preencher só backup com fila de plantão montada: o modo liga'),
    ("a-reconferencia-esquece-o-modo", LIB,
     "  const conferido = planejarPreenchimento({ dias, plantao, backup, lancados, refazer, preencher })",
     "  const conferido = planejarPreenchimento({ dias, plantao, backup, lancados, refazer })",
     'gravar a prévia "só backup" com o mesmo modo: grava'),
    ("o-modo-sai-da-conferencia-do-plano", LIB,
     "  if (a.soBackup !== b.soBackup) return false\n",
     "",
     'dias iguais em modos diferentes não são o mesmo plano'),
    # ── o que o lote NÃO pode tocar ─────────────────────────────────────────
    ("o-dia-que-ja-tem-backup-deixa-de-ser-preservado", LIB,
     "      if (jaTemBackup && !refazer) { preservados.push(data); continue }",
     "      if (false) { preservados.push(data); continue }",
     'dia que já tem backup fica de fora'),
    ("todo-dia-passa-a-ser-substituicao", LIB,
     "        substitui: jaTemBackup,",
     "        substitui: true,",
     'nenhum dia é marcado como substituição'),
    # ── a colisão com quem está de plantão ──────────────────────────────────
    ("o-backup-deixa-de-desviar-da-colisao", LIB,
     "    if (candidato && evitar.indexOf(candidato) === -1) {",
     "    if (candidato) {",
     'o backup anda quando cairia em cima do plantonista lançado'),
    ("a-fila-que-colide-inteira-deixa-de-avisar", LIB,
     """  }
  return { ids: [], desvio: 0, impossivel: true }
}""",
     """  }
  return { ids: [], desvio: 0, impossivel: false }
}""",
     'fila de backup que colide inteira deixa o dia sem backup'),
    # ── o laboratório mede mesmo? ───────────────────────────────────────────
    # Se o caso grande rodasse com o mês VAZIO, "conserva o plantonista
    # lançado" passaria sem haver plantonista nenhum para conservar.
    ("o-mes-do-caso-grande-volta-vazio", T,
     "    const lancados = diasNov.map((d, i) => dia(d, [['joao', 'maria', 'pedro'][i % 3]], []))",
     "    const lancados = []",
     'o plantonista do dia é o que JÁ estava lançado'),
]


def roda():
    r = subprocess.run(['node', T], cwd=AQUI, capture_output=True, text=True)
    s = r.stdout + r.stderr
    out = [l[5:].split('  -> ')[0].strip() for l in s.splitlines() if l.startswith('FALHA')]
    if 'todos os casos passaram' not in s and not out:
        out.append('<excecao no teste>')
    return out


bases = {p: io.open(p, encoding='utf-8').read() for p in (LIB, T)}
if roda():
    sys.exit('! base ja reprova')
print('base limpa\n')
vivos, pulados = [], []

for nome, arq, de, para, esperada in MUTANTES:
    texto = bases[arq]
    if texto.count(de) != 1:
        pulados.append((nome, f'ancora {texto.count(de)}x, esperado 1')); continue
    io.open(arq, 'w', encoding='utf-8').write(texto.replace(de, para))
    try:
        fs = roda()
    finally:
        io.open(arq, 'w', encoding='utf-8').write(texto)
    casou = [f for f in fs if esperada in f]
    print(('MORTO  ' if casou else 'VIVO   ') + nome +
          ('  -> ' + casou[0] if casou else f'  (esperava {esperada!r}; falhou: {fs[:3]})'))
    if not casou: vivos.append(nome)

print(f'\n{len(MUTANTES) - len(vivos) - len(pulados)}/{len(MUTANTES)} mortos')
for n, p in pulados:
    print(f'  NAO APLICOU {n}: {p}')
for p, texto in bases.items():
    if io.open(p, encoding='utf-8').read() != texto:
        sys.exit('! nao restaurei ' + p)
print('arquivos restaurados byte a byte')
if vivos or pulados:
    sys.exit(1)
