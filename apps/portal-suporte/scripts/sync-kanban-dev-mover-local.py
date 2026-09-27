#!/usr/bin/env python3
# =============================================================================
# Sincroniza o POST /dev/tickets/:id/mover do template
# (scripts/kanban-dev-regras.py) para
# packages/api/src/apps/portal-suporte/routes.generated.ts
#
# Em produção ALLOW_DB_CONTROLLER_PUBLISH=0 — o que roda é o generated, não o
# PUT no módulo. Este script é o caminho seguro no monorepo.
#
# Também garante `environment` na allowlist do GET /tickets/kanban.
#
#   python3 scripts/sync-kanban-dev-mover-local.py
# =============================================================================

import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.dirname(os.path.abspath(__file__))
GENERATED = os.path.normpath(os.path.join(
    RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts"
))


def carregar_mover():
    # Carrega só as constantes do template sem exigir .env.local.
    path = os.path.join(SCRIPTS, "kanban-dev-regras.py")
    ns = {
        "__name__": "kanban_dev_regras_tpl",
        "__file__": path,
        "os": os,
        "sys": sys,
        "json": json,
        "urllib": __import__("urllib"),
        "urllib.error": __import__("urllib.error"),
        "urllib.request": __import__("urllib.request"),
    }
    src = open(path, encoding="utf-8").read()
    # Evita executar main/conectar no import.
    src = src.replace('if __name__ == "__main__":\n    main()\n', "")
    exec(compile(src, path, "exec"), ns)
    return ns["MOVER"]


def trocar_controller(texto, metodo, caminho, novo_codigo):
    """Substitui o compileController("...") da rota método+path."""
    padrao = re.compile(
        r'(method:\s*"' + re.escape(metodo) + r'",\s*\n\s*path:\s*"'
        + re.escape(caminho) + r'",[\s\S]*?handler:\s*compileController\()'
        r'("(?:\\.|[^"\\])*")'
        r'(\))',
        re.M,
    )
    m = padrao.search(texto)
    if not m:
        raise SystemExit(f"❌ rota {metodo} {caminho} não encontrada em {GENERATED}")
    escaped = json.dumps(novo_codigo, ensure_ascii=False)
    return texto[: m.start(2)] + escaped + texto[m.end(2) :], True


def garantir_environment_kanban(texto):
    antigo = '"migrado","version",\\n  "previsao_entrega"'
    # No arquivo TS o controller é uma string JSON — aspas escapadas.
    # Variantes possíveis após dump:
    variantes = [
        ('\\"migrado\\",\\"version\\",\\n  \\"previsao_entrega\\"',
         '\\"migrado\\",\\"version\\",\\"environment\\",\\n  \\"previsao_entrega\\"'),
        ('\\"migrado\\",\\"version\\",\\n  \\"previsao_entrega\\"',
         '\\"migrado\\",\\"version\\",\\"environment\\",\\n  \\"previsao_entrega\\"'),
        # forma compacta numa linha só
        ('\\"migrado\\",\\"version\\",\\"previsao_entrega\\"',
         '\\"migrado\\",\\"version\\",\\"environment\\",\\"previsao_entrega\\"'),
        ('"migrado","version",\\n  "previsao_entrega"',
         '"migrado","version","environment",\\n  "previsao_entrega"'),
    ]
    if "environment" in texto and '\\"environment\\"' in texto or '"environment"' in texto:
        # Pode já existir em outros controllers; checamos o trecho do kanban.
        pass
    mudou = False
    for a, b in variantes:
        if a in texto and "environment" not in a:
            # Só se o vizinho version→previsao ainda não tem environment
            if '\\"version\\",\\"environment\\"' in texto or '"version","environment"' in texto:
                continue
            texto = texto.replace(a, b, 1)
            mudou = True
            break
    # Fallback: procurar o array CAMPOS do kanban-performance
    if not mudou:
        m = re.search(r'(\\?"migrado\\?",\\?"version\\?",)(\\n\s*)?(\\?"previsao_entrega\\?")', texto)
        if m and "environment" not in m.group(0):
            texto = texto[: m.start(1)] + m.group(1).rstrip(",") + ',\\"environment\\",' + (m.group(2) or "") + m.group(3) + texto[m.end():]
            # Above is messy — try simpler
            pass
    # Abordagem mais direta no JSON escapado típico do generated:
    needle = '\\"migrado\\",\\"version\\",'
    insert = '\\"migrado\\",\\"version\\",\\"environment\\",'
    if needle in texto and insert not in texto:
        texto = texto.replace(needle, insert, 1)
        mudou = True
        print("   → GET /tickets/kanban: campo environment na allowlist")
    elif insert in texto or '\\"version\\",\\"environment\\"' in texto:
        print("   = GET /tickets/kanban: environment já na allowlist")
    else:
        print("   ⚠ não achei o trecho CAMPOS do kanban para inserir environment — confira à mão")
    return texto, mudou


def main():
    if not os.path.isfile(GENERATED):
        raise SystemExit(f"❌ não achei {GENERATED}")
    mover = carregar_mover()
    if "SERVIDORES_HML" not in mover or "em_revisao" in mover.split("var TRANSICOES")[1].split("async function handler")[0]:
        # em_revisao pode ainda aparecer em comentários do arquivo python, mas
        # não no grafo TRANSICOES do MOVER.
        bloco = mover.split("var TRANSICOES")[1].split("async function handler")[0]
        if 'em_revisao:' in bloco or '["em_revisao"' in bloco:
            raise SystemExit("❌ template MOVER ainda tem em_revisao no grafo")
    texto = open(GENERATED, encoding="utf-8").read()
    texto, _ = trocar_controller(texto, "POST", "/dev/tickets/:id/mover", mover)
    print("   → POST /dev/tickets/:id/mover sincronizado do template")
    texto, _ = garantir_environment_kanban(texto)
    open(GENERATED, "w", encoding="utf-8").write(texto)
    print(f"✓ gravado {GENERATED}")


if __name__ == "__main__":
    main()
