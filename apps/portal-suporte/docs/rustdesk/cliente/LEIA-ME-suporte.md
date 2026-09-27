# RustDesk — guia do suporte para instalar numa caixa do cliente

Pack para instalar o acesso remoto (RustDesk) numa máquina de cliente, já apontando
para o servidor da Arara. Substitui o AnyDesk.

> **Estado em 21/08/2026:** servidor no ar (hbbs + hbbr), portas TCP 21115–21119 abertas
> e conferidas de fora, e o `RustDesk2.toml` **já vem preenchido** com o IP e a chave
> pública. Não há mais nada a configurar no pack.

## O que tem neste pack
- `instalar-rustdesk.bat` — instala, configura, **sorteia a senha desta máquina** e
  mostra ID + senha no fim (rode como Admin).
- `RustDesk2.toml` — config do servidor. **Já preenchido**, não mexer.
- `rustdesk.exe` — **baixar** o instalador oficial em https://rustdesk.com/download e
  colocar nesta pasta (o `.bat` procura por ele aqui).

## Preparar o pack (uma vez só)
1. Baixar o `rustdesk.exe` oficial → colocar nesta pasta.
2. Zipar a pasta e distribuir aos técnicos. Só isso.

## Antes de tudo: a máquina do TÉCNICO
Cada técnico precisa do RustDesk instalado **e apontando para o nosso servidor** — use o
mesmo `RustDesk2.toml` (basta rodar o `.bat` na própria máquina, ou importar a config
pelo app). Sem isso, o botão **Conectar** do portal abre um RustDesk que procura o ID no
servidor público da RustDesk, onde ele não existe, e a conexão falha sem explicação.

## Em cada caixa do cliente (por máquina)
1. Copiar a pasta para a máquina.
2. Rodar `instalar-rustdesk.bat` **como Administrador** (botão direito → Executar como admin).
3. No fim, o script mostra **ID + senha** desta caixa — e salva os dois num arquivo
   `rustdesk-desta-caixa.txt` na Área de Trabalho, para o caso de a janela fechar.
4. No portal (**Clientes → Unidades → Caixas** da unidade): cadastrar o **ID + a senha**
   dessa máquina. Há um leitor por print (OCR) se preferir fotografar a tela do RustDesk.
5. Pronto — daí o suporte clica **"Conectar"** no portal (abre o RustDesk já com o ID) e
   cola a senha.

## Senha: uma por caixa (decisão de 21/08/2026)
O script **sorteia 14 caracteres** a cada instalação — ninguém escolhe, ninguém repete.
Se uma senha vazar, ela abre **uma** caixa, não o parque inteiro. Não reaproveite senha
entre máquinas nem invente uma "padrão fácil de lembrar": a senha vive no portal, é de
lá que o técnico a copia.

## Observações
- A senha permanente = acesso não-assistido (não precisa alguém aprovar do lado do cliente).
- Migração do AnyDesk é **máquina por máquina** — cada uma ganha um ID RustDesk novo (os IDs
  do AnyDesk não servem).
- ⚠️ A sintaxe do RustDesk (`--silent-install`, `--import-config`, `--password`, `--get-id`)
  varia com a versão do cliente. **Testar numa máquina antes** de distribuir em massa. Se
  algum flag não funcionar, a alternativa que independe de versão é renomear o instalador
  para `rustdesk-host=YOUR_DEPLOY_HOST,key=YOUR_RUSTDESK_PUBLIC_KEY.exe`
  (o RustDesk se auto-configura pelo nome do arquivo).
- Se o `--get-id` não devolver nada, o script avisa: abra o RustDesk e anote o ID de 9
  dígitos da tela — a senha sorteada continua válida e está no arquivo da Área de Trabalho.
