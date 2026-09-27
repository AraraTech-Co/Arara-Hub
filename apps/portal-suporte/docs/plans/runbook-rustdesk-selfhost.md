# Runbook — RustDesk self-hosted (substituição do AnyDesk)

Passo-a-passo operacional para o **Hefler** subir o servidor RustDesk no VPS e
distribuir o cliente pré-configurado. O código do portal (campos RustDesk, botão
"Conectar", cifra da senha) já está no repositório.

> **Contexto:** RustDesk OSS = `hbbs` (sinalização/ID) + `hbbr` (relay). Cada máquina
> roda o cliente e ganha um **ID de 9 dígitos + senha permanente**. O técnico conecta
> com ID+senha — igual AnyDesk, porém self-hosted e sem mensalidade.
> Licença AGPL-3.0: usamos os binários **sem modificar** + injeção de config, o que
> **não** dispara obrigação de abertura de código.

---

## 1. Subir o servidor (hbbs + hbbr)

Os serviços já estão declarados em `remote/core.yml` (`rustdesk-hbbs`, `rustdesk-hbbr`)
e o volume `rustdesk_data` em `remote/base.yml`. No próximo deploy do `master`, o passo
`docker compose ... up -d` sobe os dois automaticamente.

**Variável opcional:** `RUSTDESK_PUBLIC_HOST` (default `YOUR_DEPLOY_HOST`) — host/IP público
que os clientes usarão para o relay. Se o acesso for por domínio, exporte-o no deploy.

Para subir manualmente no VPS (fora do pipeline):
```bash
cd /home/prod/remote
docker compose -f base.yml -f core.yml up -d rustdesk-hbbr rustdesk-hbbs
docker compose -f base.yml -f core.yml ps | grep rustdesk   # confirmar "Up"
```

## 2. Liberar as portas no firewall do VPS

RustDesk precisa de **TCP 21115–21119 + UDP 21116**:
```bash
ufw allow 21115:21119/tcp
ufw allow 21116/udp
ufw reload
```
(Se usar o firewall do painel Hostinger, liberar as mesmas portas por lá.)

## 3. Coletar a chave pública (Ed25519)

Gerada automaticamente na 1ª subida do `hbbs`, no volume compartilhado:
```bash
docker exec portal-rustdesk-hbbs cat /root/id_ed25519.pub
```
Guarde essa string — é a **Key** que trava o cliente no nosso servidor.

## 4. Montar o cliente pré-configurado

Numa máquina, instale o cliente RustDesk OSS oficial (https://rustdesk.com/download),
configure-o uma vez apontando para o nosso servidor e exporte a config — OU monte o
`RustDesk2.toml` manualmente:

```toml
rendezvous_server = 'YOUR_DEPLOY_HOST:21116'
relay_server = 'YOUR_DEPLOY_HOST:21117'
key = '<CONTEÚDO_DA_id_ed25519.pub>'
```

Aplicar em cada máquina de cliente (sem o usuário digitar nada):
```bash
rustdesk --import-config RustDesk2.toml
```
(Alternativa scriptável: exportar a config-string de um cliente já configurado e passar
via `rustdesk --config <string>` no instalador/deploy.)

## 5. Definir senha permanente e registrar no portal

Em cada máquina de cliente:
1. No cliente RustDesk → **Set permanent password** (acesso não-assistido).
2. Anote o **ID de 9 dígitos** exibido.
3. No portal (Recursos → Unidades → caixas da unidade), cadastre a caixa com o ID e a
   senha permanente. A senha é gravada **cifrada** (AES-256-GCM) no banco.
   - Dá para usar o **"Via Print"/"Multi Print"** (OCR) para capturar o ID de um screenshot.

## 6. Teste ponta-a-ponta

1. No portal, na linha da caixa, clique **"Conectar"** → abre o cliente RustDesk do
   técnico com o ID preenchido (deep-link `rustdesk://<id>`).
2. Copie a senha pelo botão de copiar do portal e cole no cliente.
3. A sessão deve estabelecer (P2P direto ou via `hbbr`).

---

## Notas / limites

- **Sem API no OSS:** o portal não lista/gerencia dispositivos automaticamente — ele
  guarda ID+senha por caixa e lança a sessão. Gestão de dispositivos, console web,
  address book e instalador com marca são recursos do **RustDesk Pro** (pago). Migrar
  só se bater num limite real.
- **Chave:** se precisar rotacionar, apague `id_ed25519`/`id_ed25519.pub` do volume
  `rustdesk_data` e reinicie o `hbbs` (gera novo par) — e redistribua a nova Key aos clientes.
- **Deep-link:** o botão usa `rustdesk://<id>`. Se alguma versão do cliente exigir outro
  formato, ajustar para `rustdesk://connection/new/<id>` em `caixas-panel.tsx`/`units-tab.tsx`.
