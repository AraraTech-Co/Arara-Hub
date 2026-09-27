#!/usr/bin/env python3
# =============================================================================
# Varredura de código morto no portal.
#
# O portal virou export estático servido pela hospedagem da plataforma: o que
# roda em produção é só o que sai de `next build` a partir das páginas. Todo o
# resto — as rotas `app/api/**`, a camada `app/server/**` em Prisma, os
# `.prisma-bak` — é resíduo da arquitetura anterior. O script de deploy chega a
# PARQUEAR essas pastas antes de compilar (scripts/export-and-deploy.sh), o que
# é a confissão de que elas não participam do produto.
#
# Grep não basta para decidir o que morreu: um arquivo pode ser importado por
# outro que também está morto, e os dois se sustentam mutuamente na busca. Aqui
# a conta é de ALCANÇABILIDADE — começa nas raízes que o Next realmente compila
# (page/layout/template/error/not-found + middleware) e segue os imports.
# O que não for alcançado não entra no bundle: é peso morto no repositório.
#
#   python3 scripts/varredura-morto.py            # relatório
#   python3 scripts/varredura-morto.py --lista    # só os caminhos, um por linha
# =============================================================================

import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RAIZ, "app")
EXTS = (".ts", ".tsx", ".js", ".jsx")

# Raízes do build estático. `app/api` NÃO entra: o deploy a parqueia.
NOMES_RAIZ = ("page", "layout", "template", "error", "global-error", "not-found", "loading")

# Pega import estático, `require()` E import dinâmico — `import('…')`, a forma
# usada por `next/dynamic`. Faltando o dinâmico, o detector dá o TerminalPane
# do DevOps como morto quando ele é carregado exatamente assim; foi o que
# aconteceu na primeira passada.
IMPORT = re.compile(
    r"""(?:from\s+|import\s+|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]""", re.M
)

# Apelidos do tsconfig. Lidos do arquivo para não divergir dele.
def apelidos():
    bruto = open(os.path.join(RAIZ, "tsconfig.json"), encoding="utf-8").read()
    bruto = re.sub(r"//.*", "", bruto)
    bruto = re.sub(r",(\s*[}\]])", r"\1", bruto)
    conf = json.loads(bruto)
    mapa = {}
    for k, v in (conf.get("compilerOptions", {}).get("paths") or {}).items():
        mapa[k.rstrip("/*")] = [d.rstrip("/*") for d in v]
    return mapa


APELIDOS = apelidos()


def resolver(especificador, de_arquivo):
    """Caminho absoluto do módulo, ou None se for pacote externo."""
    if especificador.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(de_arquivo), especificador))
    else:
        base = None
        for prefixo, destinos in APELIDOS.items():
            if especificador == prefixo or especificador.startswith(prefixo + "/"):
                resto = especificador[len(prefixo):].lstrip("/")
                for d in destinos:
                    tentativa = os.path.normpath(os.path.join(RAIZ, d, resto))
                    if achar(tentativa):
                        base = tentativa
                        break
                if base:
                    break
        if not base:
            return None
    return achar(base)


def achar(base):
    for e in EXTS:
        if os.path.isfile(base + e):
            return base + e
    if os.path.isfile(base) and base.endswith(EXTS):
        return base
    for e in EXTS:
        idx = os.path.join(base, "index" + e)
        if os.path.isfile(idx):
            return idx
    return None


def todos_fontes():
    for dirpath, dirnames, filenames in os.walk(APP):
        dirnames[:] = [d for d in dirnames if d != "node_modules"]
        for f in filenames:
            if f.endswith(EXTS):
                yield os.path.join(dirpath, f)


def raizes():
    saida = []
    for caminho in todos_fontes():
        nome = os.path.splitext(os.path.basename(caminho))[0]
        # `app/api/**` fica de fora de propósito: é parqueado no deploy.
        rel = os.path.relpath(caminho, RAIZ)
        if rel.startswith("app/api/"):
            continue
        if nome in NOMES_RAIZ:
            saida.append(caminho)
    mid = os.path.join(RAIZ, "middleware.ts")
    if os.path.isfile(mid):
        saida.append(mid)
    return saida


def alcancados():
    vistos = set()
    fila = list(raizes())
    while fila:
        atual = fila.pop()
        if atual in vistos:
            continue
        vistos.add(atual)
        try:
            texto = open(atual, encoding="utf-8").read()
        except Exception:
            continue
        for esp in IMPORT.findall(texto):
            alvo = resolver(esp, atual)
            if alvo and alvo not in vistos:
                fila.append(alvo)
    return vistos


def main():
    vivos = alcancados()
    mortos = []
    for caminho in todos_fontes():
        if caminho not in vivos:
            mortos.append(os.path.relpath(caminho, RAIZ))
    baks = []
    for dirpath, dirnames, filenames in os.walk(RAIZ):
        dirnames[:] = [d for d in dirnames if d not in ("node_modules", ".git", ".next", "out")]
        for f in filenames:
            if f.endswith((".prisma-bak", ".bak", ".old")):
                baks.append(os.path.relpath(os.path.join(dirpath, f), RAIZ))

    if "--lista" in sys.argv:
        for m in sorted(mortos + baks):
            print(m)
        return

    grupos = {}
    for m in mortos:
        if m.startswith("app/api/"):
            g = "app/api/** (rotas do backend antigo, parqueadas no deploy)"
        elif m.startswith("app/server/"):
            g = "app/server/** (camada Prisma do backend antigo)"
        elif m.startswith("app/_components/"):
            g = "componentes sem uso"
        elif m.startswith("app/_hooks/"):
            g = "hooks sem uso"
        elif m.startswith("app/lib/"):
            g = "lib sem uso"
        else:
            g = "outros"
        grupos.setdefault(g, []).append(m)

    linhas_total = 0
    print(f"Raízes do build: {len(raizes())} · alcançados: {len(vivos)} · sem uso: {len(mortos)}\n")
    for g in sorted(grupos, key=lambda k: -len(grupos[k])):
        arquivos = sorted(grupos[g])
        n = 0
        for a in arquivos:
            try:
                n += sum(1 for _ in open(os.path.join(RAIZ, a), encoding="utf-8", errors="ignore"))
            except Exception:
                pass
        linhas_total += n
        print(f"── {g}: {len(arquivos)} arquivos, {n} linhas")
        for a in arquivos[:12]:
            print(f"     {a}")
        if len(arquivos) > 12:
            print(f"     … e mais {len(arquivos) - 12}")
        print()
    print(f"Backups de migração (*.prisma-bak/.bak/.old): {len(baks)} arquivos")
    print(f"\nTOTAL sem uso: {len(mortos)} arquivos, {linhas_total} linhas (+ {len(baks)} backups)")


if __name__ == "__main__":
    main()
