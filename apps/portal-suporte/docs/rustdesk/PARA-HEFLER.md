# RustDesk self-hosted — o que o Hefler precisa fazer (VPS + infra)

> Documento para encaminhar ao Hefler. Substitui o AnyDesk por um servidor RustDesk
> próprio (open source, sem mensalidade). O **código do portal já está pronto** no
> `development` (campos RustDesk nas caixas, botão "Conectar", serviços no compose).
> Falta só a parte de **infra no VPS** abaixo.

---

## Visão geral

```
Máquina do cliente (caixa)  ──┐
   [cliente RustDesk]         │
                              ├──►  VPS Arara: hbbs + hbbr  ◄──  Máquina do técnico
Máquina do cliente (caixa)  ──┘        (broker + relay)            [cliente RustDesk]
   [cliente RustDesk]
```

- **hbbs** = servidor de ID/sinalização. **hbbr** = servidor de relay.
- Sobem via Docker no VPS (já declarados em `remote/core.yml`).
- O cliente RustDesk (o app) precisa estar instalado nas **duas pontas** — nas caixas
  dos clientes e nas máquinas do suporte (o servidor é só o intermediário).

---

## Checklist do Hefler

### 1. Subir os containers (vem no deploy)
Os serviços `rustdesk-hbbs` e `rustdesk-hbbr` já estão em `remote/core.yml` e sobem no
`docker compose ... up -d` do deploy. Para subir/checar manualmente no VPS:
```bash
cd /home/prod/remote
docker compose -f base.yml -f core.yml up -d rustdesk-hbbr rustdesk-hbbs
docker compose -f base.yml -f core.yml ps | grep rustdesk   # devem estar "Up"
```

### 2. Liberar o firewall — TCP 21115–21119 + UDP 21116
```bash
ufw allow 21115:21119/tcp
ufw allow 21116/udp
ufw reload
```
(Se o firewall for o do painel Hostinger, liberar as mesmas portas por lá.)
**Sem isso, os containers sobem mas os clientes não conectam.**

### 3. Coletar a CHAVE PÚBLICA (gerada na 1ª subida)
É a `key` que trava os clientes no nosso servidor (só confiam nele):
```bash
docker exec portal-rustdesk-hbbs cat /root/id_ed25519.pub
```
Guardar essa string — ela + o IP do VPS vão no cliente pré-configurado (ver pack do suporte).

### 4. (Opcional) host público
O relay usa por padrão o IP `YOUR_DEPLOY_HOST` (definido em `remote/core.yml` via
`RUSTDESK_PUBLIC_HOST`). Se o acesso for por outro IP/domínio, exportar
`RUSTDESK_PUBLIC_HOST=<host>` no deploy/ambiente.

---

## Resumo de portas (para o firewall)

| Porta | Proto | Serviço |
|------:|-------|---------|
| 21115 | TCP | hbbs (teste de NAT) |
| 21116 | TCP **e** UDP | hbbs (registro de ID / heartbeat) |
| 21117 | TCP | hbbr (relay) |
| 21118 | TCP | hbbs (websocket) |
| 21119 | TCP | hbbr (websocket relay) |

---

## O que NÃO é responsabilidade do Hefler
- Instalar o cliente nas caixas dos clientes → equipe de suporte (ver `cliente/LEIA-ME-suporte.md`).
- Cadastrar ID+senha por caixa no portal → suporte, pela tela de Unidades.

## Licença
RustDesk é AGPL-3.0. Usamos os binários **sem modificar** + injeção de config — não dispara
obrigação de abrir código. Não vamos forkar o RustDesk.
