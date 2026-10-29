#!/usr/bin/env python3
# =============================================================================
# Remove do registro a rota POST /admin/users (handler 140).
#
# Decisão do Leonardo (29/10/2026): "pode apagar a rota".
#
# POR QUE SAI: nenhuma tela chama. As duas declarações do cliente
# (`lib/api/admin.ts` e `lib/api/users.ts`) existiam sem nenhum componente
# usando, e quem adiciona membro hoje é `POST /admin/membros` mais os códigos
# de convite. Rota que ninguém chama é superfície que ninguém revisa.
#
# COMO SAI: recortando a ENTRADA inteira do array, do comentário numerado até o
# começo da entrada seguinte. A conferência é dupla — a entrada tem de começar
# onde se espera e terminar exatamente onde a próxima começa —, porque recorte
# por deslocamento é como se apaga meia entrada e o arquivo deixa de compilar.
#
#   python3 scripts/remover-rota-admin-users.py            # simula
#   python3 scripts/remover-rota-admin-users.py --aplicar
# =============================================================================

import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
ROTAS = os.path.abspath(os.path.join(
    AQUI, "..", "..", "..", "packages", "api", "src", "apps", "portal-suporte",
    "routes.generated.ts"))

MARCA = "  // 140 admin_users POST /admin/users"
SEGUINTE = "\n  // 141 "
ANTES = 510
DEPOIS = 509


def main():
    aplicar = "--aplicar" in sys.argv
    texto = open(ROTAS, encoding="utf-8").read()
    total = texto.count('\n    method: "')

    if MARCA not in texto:
        if total == DEPOIS:
            print(f"   = rota já removida ({DEPOIS} rotas)")
            return
        raise SystemExit(f"! a rota 140 não está no arquivo, e o total é {total}")

    if texto.count(MARCA) != 1:
        raise SystemExit(f"! a marca da 140 aparece {texto.count(MARCA)}x")
    if total != ANTES:
        raise SystemExit(f"! o arquivo tem {total} rotas, esperado {ANTES}")

    i = texto.index(MARCA)
    j = texto.index(SEGUINTE, i)
    bloco = texto[i:j]

    # O que o recorte pressupõe, conferido e não suposto.
    if 'path: "/admin/users"' not in bloco:
        raise SystemExit("! o bloco recortado não é o da rota /admin/users")
    if bloco.count('\n    method: "') != 1:
        raise SystemExit(f"! o recorte pegaria {bloco.count(chr(10) + '    method: ')} rotas")
    if not bloco.rstrip().endswith("},"):
        raise SystemExit(f"! o bloco não termina no fecho da entrada: {bloco[-40:]!r}")

    novo = texto[:i] + texto[j + 1:]
    if novo.count('\n    method: "') != DEPOIS:
        raise SystemExit(f"! depois do recorte sobraram {novo.count(chr(10) + '    method: ')} rotas")
    # A conferência é sobre o PAR método+caminho, e não sobre o caminho.
    #
    # `path: "/admin/users"` continua no arquivo depois da remoção, porque a 138
    # `DELETE /admin/users` usa o MESMO caminho e fica. Conferir só o caminho
    # dava um falso alarme — e, numa remoção, falso alarme é o que faz alguém
    # apagar mais do que devia para "limpar".
    import re
    sobrou = [m.group(0) for m in re.finditer(
        r'method: "POST",\n    path: "/admin/users",', novo)]
    if sobrou:
        raise SystemExit("! POST /admin/users ainda está no arquivo")
    if not re.search(r'method: "DELETE",\n    path: "/admin/users",', novo):
        raise SystemExit("! o recorte levou junto a DELETE /admin/users, que fica")

    if not aplicar:
        print(f"   → removeria a entrada da 140 ({len(bloco)} chars)")
        print(f"   → {ANTES} → {DEPOIS} rotas")
        print("\n   (simulação — use --aplicar)")
        return
    open(ROTAS, "w", encoding="utf-8").write(novo)
    print(f"→ rota 140 removida ({ANTES} → {DEPOIS} rotas)")


if __name__ == "__main__":
    main()
