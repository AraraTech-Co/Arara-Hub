#!/usr/bin/env python3
# =============================================================================
# Fase 4 — chaves VAPID do Web Push.
#
# VAPID é o par de chaves que identifica o NOSSO servidor para o push service
# do navegador (FCM, Mozilla, Apple). A privada assina cada envio; a pública
# vai para o navegador no momento da inscrição.
#
# As duas ficam no SECRET STORE do app:
#   push_vapid_private   nunca sai do servidor
#   push_vapid_public    servida por GET /push/chave-publica (com sessão)
#
# A pública também é segredo neste desenho — não porque precise ser, mas porque
# é o mesmo cofre e não há motivo para espalhá-la pelo bundle do front: o
# cliente a pede quando vai se inscrever.
#
# ⚠️ TROCAR as chaves INVALIDA todas as inscrições existentes: cada navegador
# se inscreveu com a pública antiga. Quem trocar precisa apagar as inscrições
# e deixar as pessoas se inscreverem de novo.
#
# Uso:
#   python3 scripts/push-vapid.py              # simula (gera e MOSTRA o par)
#   python3 scripts/push-vapid.py --aplicar    # grava no cofre (recusa se já houver)
#   python3 scripts/push-vapid.py --aplicar --forcar   # substitui as existentes
#
# Quem roda é o Leonardo. Sem --aplicar nada é gravado.
# =============================================================================

import base64
import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


# O env é lido só na hora de GRAVAR: gerar o par é local, e exigir credencial
# para simular tornaria a simulação inútil fora da máquina que tem o .env.local.
def secrets_url():
    api, key = env()
    return f"{api}/v1/apps/portal-suporte/secrets", key


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def gerar_par():
    """
    Par P-256 no formato que o Web Push espera: pública em ponto não comprimido
    (65 bytes, começando em 0x04) e privada como os 32 bytes crus — as duas em
    base64url sem padding.

    Usa `cryptography` se existir; senão, o `openssl` do sistema. Sem nenhum dos
    dois, o script diz o que instalar em vez de gerar algo inseguro.
    """
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization

        chave = ec.generate_private_key(ec.SECP256R1())
        priv = chave.private_numbers().private_value.to_bytes(32, "big")
        pub = chave.public_key().public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
        return b64url(priv), b64url(pub), "cryptography"
    except ImportError:
        pass

    import shutil
    import subprocess
    import tempfile

    if not shutil.which("openssl"):
        print("! preciso do módulo `cryptography` ou do `openssl` para gerar o par.")
        print("  pip install cryptography   (ou instale o openssl)")
        sys.exit(1)

    with tempfile.TemporaryDirectory() as tmp:
        pem = os.path.join(tmp, "k.pem")
        subprocess.run(
            ["openssl", "ecparam", "-genkey", "-name", "prime256v1", "-noout", "-out", pem],
            check=True, capture_output=True,
        )
        texto = subprocess.run(
            ["openssl", "ec", "-in", pem, "-text", "-noout"],
            check=True, capture_output=True, text=True,
        ).stdout
        # O -text imprime priv e pub em hex, em blocos rotulados.
        def bloco(rotulo, fim):
            i = texto.index(rotulo) + len(rotulo)
            j = texto.index(fim, i)
            return bytes.fromhex(texto[i:j].replace(":", "").replace("\n", "").replace(" ", ""))
        priv = bloco("priv:", "pub:")
        pub = bloco("pub:", "ASN1 OID")
        # priv pode vir com um 0x00 à frente; pub começa em 0x04.
        priv = priv[-32:]
        if pub[0] != 0x04 or len(pub) != 65:
            print("! a chave pública não veio no formato esperado; abortando.")
            sys.exit(1)
        return b64url(priv), b64url(pub), "openssl"


def req(url, key, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": key}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]


def main():
    aplicar = "--aplicar" in sys.argv
    forcar = "--forcar" in sys.argv
    priv, pub, como = gerar_par()

    print(f"   par P-256 gerado com `{como}`\n")
    print(f"   push_vapid_public  = {pub}")
    print(f"   push_vapid_private = {'*' * 12} ({len(priv)} chars em base64url)")
    print("\n   PLANO: gravar os dois no secret store do app.")
    print("   ⚠️  Se JÁ existirem chaves, trocá-las invalida todas as inscrições:")
    print("       cada navegador se inscreveu com a pública antiga e precisará")
    print("       se inscrever de novo. Apague as inscrições junto.")

    if not aplicar:
        print("\n   (simulação — nada foi gravado. Use --aplicar para gravar.)")
        print("   A privada acima NÃO foi impressa; rodar de novo gera outro par.")
        return

    url, key = secrets_url()

    # JÁ EXISTE chave? Então trocar INVALIDA todas as inscrições: cada
    # navegador se inscreveu com a pública antiga. Exigir --forcar é o que
    # impede um `--aplicar` distraído de calar os avisos de todo mundo.
    c, d = req(url, key)
    if c < 300 and isinstance(d, dict):
        nomes = {s.get("name") for s in (d.get("secrets") or []) if isinstance(s, dict)}
        if "push_vapid_public" in nomes or "push_vapid_private" in nomes:
            if not forcar:
                print("\n   ! JÁ EXISTEM chaves VAPID no cofre.")
                print("     Trocá-las invalida TODAS as inscrições: cada navegador")
                print("     precisará ligar o aviso de novo, e as inscrições antigas")
                print("     devem ser apagadas junto.")
                print("     Se é isso que você quer: --aplicar --forcar")
                sys.exit(1)
            print("\n   ⚠️  --forcar: substituindo chaves existentes.")

    for nome, valor in (("push_vapid_public", pub), ("push_vapid_private", priv)):
        c, r = req(url, key, "POST", {"name": nome, "value": valor})
        print(f"   {nome}: HTTP {c} {'' if c < 300 else r}")
        if c >= 300:
            print("   ! pare aqui: com uma chave gravada e a outra não, o envio")
            print("     fica inconsistente. Confira o cofre antes de repetir.")
            sys.exit(1)

    print("\n   ✓ chaves gravadas. O envio liga no próximo tick do relógio.")


if __name__ == "__main__":
    main()
