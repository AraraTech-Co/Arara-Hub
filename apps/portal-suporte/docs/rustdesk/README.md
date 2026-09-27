# Pack RustDesk — acesso remoto self-hosted (substitui o AnyDesk)

Tudo para colocar o RustDesk no ar na Arara. Duas frentes:

## 1. Infra no VPS → **Hefler**
[`PARA-HEFLER.md`](PARA-HEFLER.md) — subir hbbs/hbbr, liberar firewall (TCP 21115–21119 +
UDP 21116), coletar a chave pública. Documento para encaminhar direto a ele.

## 2. Cliente nas máquinas → **Suporte**
[`cliente/`](cliente/) — pack de instalação em massa:
- `LEIA-ME-suporte.md` — como preparar o pack e instalar em cada caixa.
- `instalar-rustdesk.bat` — instala + configura + define senha (rodar como Admin).
- `RustDesk2.toml` — config do servidor (preencher IP + chave que o Hefler fornece).
- (baixar o `rustdesk.exe` oficial em https://rustdesk.com/download e pôr na pasta `cliente/`).

## Fluxo resumido
1. Hefler sobe o servidor + firewall e passa **IP do VPS + chave pública**.
2. Suporte preenche o `RustDesk2.toml`, monta o pack e instala nas caixas.
3. Cada caixa: instala → anota o **ID de 9 dígitos** → cadastra **ID + senha** no portal
   (Clientes → Unidades → Gerenciar RustDesk).
4. Suporte clica **"Conectar"** no portal → abre o RustDesk com o ID → cola a senha.

> Detalhe técnico completo (chave, geração do cliente, teste ponta-a-ponta) também em
> [`docs/plans/runbook-rustdesk-selfhost.md`](../plans/runbook-rustdesk-selfhost.md).
