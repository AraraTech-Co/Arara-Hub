import {
  Download,
  Monitor,
  ShieldCheck,
  KeyRound,
  ClipboardList,
  Info,
  TriangleAlert,
  UserCog,
} from 'lucide-react'

/**
 * Página de distribuição do RustDesk self-hosted (substitui o AnyDesk).
 *
 * Segue o molde da Coleta de NFe PDV: um arquivo em /public/downloads e o
 * passo a passo na tela. O pacote NÃO vive no repositório — `rustdesk.exe` é
 * binário de terceiro, e binário não entra em repositório de código; o zip é
 * montado uma vez e publicado junto do build.
 *
 * O servidor (hbbs + hbbr) está no ar desde 21/08/2026, portas TCP 21115–21119
 * abertas e chave Ed25519 compartilhada pelos dois containers via volume.
 */
// DOIS caminhos, ambos de um arquivo só — porque são ~700 caixas e todo passo
// manual vira 700 passos manuais:
//
//   INSTALADOR: o servidor e a chave viajam no NOME do arquivo (recurso do
//   próprio RustDesk). Baixou, deu dois cliques, já está apontando para nós.
//
//   SCRIPT: mesmo instalador, mas também sorteia a senha desta máquina e
//   mostra ID + senha no fim. É o caminho recomendado, porque acesso não
//   assistido exige senha permanente.
const RUSTDESK_HOST = process.env.NEXT_PUBLIC_RUSTDESK_HOST || 'YOUR_DEPLOY_HOST'
const RUSTDESK_KEY = process.env.NEXT_PUBLIC_RUSTDESK_KEY || 'YOUR_RUSTDESK_PUBLIC_KEY'
const INSTALADOR = `/downloads/rustdesk-host=${RUSTDESK_HOST},key=${RUSTDESK_KEY}=.exe`
const SCRIPT = '/downloads/instalar-acesso-remoto.bat'

const passos = [
  {
    icon: Download,
    title: 'Baixe o script nesta máquina do cliente',
    description: (
      <p className="text-sm text-foreground/60">
        É um arquivo só, de 3 KB. Ele busca o instalador aqui no portal — você não
        precisa baixar mais nada, nem criar pasta, nem renomear arquivo.
      </p>
    ),
  },
  {
    icon: ShieldCheck,
    title: 'Rode como Administrador',
    description: (
      <p className="text-sm text-foreground/60">
        Botão direito → <strong className="text-foreground/80">Executar como administrador</strong>.
        Ele instala, aponta para o servidor da Arara e sorteia a senha desta máquina.
      </p>
    ),
  },
  {
    icon: ClipboardList,
    title: 'Cadastre o ID e a senha no portal',
    description: (
      <p className="text-sm text-foreground/60">
        No fim ele mostra os dois na tela e salva em{' '}
        <span className="font-mono text-foreground/80">acesso-remoto-desta-caixa.txt</span> na
        Área de Trabalho. Cadastre em <strong className="text-foreground/80">Clientes → Unidades</strong>,
        na caixa correspondente — há leitor por print (OCR) se preferir fotografar a tela.
      </p>
    ),
  },
]

const observacoes = [
  'O instalador servido aqui é a versão 1.4.9 oficial, baixada do rustdesk.com e congelada: todas as caixas recebem exatamente o mesmo binário. Não baixe de outros lugares — as opções do programa mudam entre versões e quebrariam a instalação em massa.',
  'A migração do AnyDesk é máquina por máquina: cada caixa ganha um ID novo, e os IDs antigos do AnyDesk não servem.',
  'A senha permanente dá acesso não assistido — ninguém precisa aprovar do lado do cliente. Trate-a como credencial: ela vive no portal, é de lá que você a copia.',
  'Se o antivírus reclamar do .bat, é o comportamento esperado de um script que instala programa: confirme que veio deste portal antes de liberar.',
  'Loja com internet restrita: baixe o instalador de 24 MB uma vez, leve num pendrive e rode direto — ele se configura sozinho, sem precisar do portal.',
]

export default function AcessoRemotoPage() {
  return (
    <div className="min-h-screen bg-muted/50">
      {/* Hero */}
      <div className="bg-background border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 mb-5">
            <span className="text-3xl">🖥️</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">Acesso Remoto (RustDesk)</h1>
          <p className="text-muted-foreground text-base max-w-xl mx-auto mb-8">
            Pacote pré-configurado para instalar o acesso remoto nas caixas dos clientes.
            Já aponta para o servidor da Arara — substitui o AnyDesk, sem mensalidade.
          </p>
          <a
            href={SCRIPT}
            download
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm shadow-indigo-200 dark:shadow-none"
          >
            <Download className="w-5 h-5" />
            Baixar e instalar (recomendado)
          </a>
          <p className="mt-3 text-xs text-muted-foreground/70">
            Windows · 3 KB · instala, configura e já define a senha da máquina
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            Prefere sem script?{' '}
            <a href={INSTALADOR} download className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Baixe o instalador direto (24 MB)
            </a>{' '}
            — ele já vem apontado para o nosso servidor; a senha permanente você define
            no próprio RustDesk.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* PROJETO PAUSADO (21/08/2026). A página fica no repositório, fora do
            menu, com este aviso — quem chegar por link antigo precisa saber que
            os downloads saíram do ar, em vez de clicar num botão quebrado. */}
        <div className="mb-8 rounded-xl border border-sem-warning-bd bg-sem-warning p-5">
          <div className="flex items-center gap-2 mb-2">
            <TriangleAlert className="w-4 h-4 text-sem-warning-fg flex-shrink-0" />
            <h2 className="font-semibold text-sem-warning-fg text-sm">Projeto pausado</h2>
          </div>
          <p className="text-sm text-sem-warning-fg">
            A adoção do acesso remoto próprio está em pausa desde 21/08/2026 e os
            downloads saíram do ar. O servidor continua no ar e nada precisa ser refeito
            quando a equipe decidir retomar. Enquanto isso, siga com a ferramenta de
            acesso remoto em uso hoje.
          </p>
        </div>

        {/* Servidor próprio — o porquê */}
        <div className="mb-8 rounded-xl bg-card p-5 shadow-[var(--shadow-media)]">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <h2 className="font-semibold text-foreground text-sm">Servidor próprio, tráfego nosso</h2>
          </div>
          <p className="text-sm text-foreground/60">
            O pacote vem travado no servidor da Arara por uma chave criptográfica: um cliente
            configurado por aqui não fala com nenhum outro servidor RustDesk, e nenhuma sessão
            passa por infraestrutura de terceiro. É por isso que o arquivo precisa vir desta
            página — o instalador baixado avulso do site oficial não tem essa configuração.
          </p>
        </div>

        <h2 className="text-lg font-semibold text-foreground mb-4">Como instalar</h2>
        <ol className="space-y-4">
          {passos.map((passo, i) => (
            <li key={i} className="flex gap-4">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center">
                {i + 1}
              </div>
              <div className="flex-1 rounded-xl bg-card p-5 shadow-[var(--shadow-media)]">
                <div className="flex items-center gap-2 mb-2">
                  <passo.icon className="w-4 h-4 text-indigo-500" />
                  <h3 className="font-semibold text-foreground">{passo.title}</h3>
                </div>
                {passo.description}
              </div>
            </li>
          ))}
        </ol>

        {/* Observações */}
        <div className="mt-6 rounded-xl border border-sem-warning-bd bg-sem-warning p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-sem-warning-fg flex-shrink-0" />
            <h3 className="font-semibold text-sem-warning-fg text-sm">Observações importantes</h3>
          </div>
          <ul className="space-y-2">
            {observacoes.map((obs, i) => (
              <li key={i} className="flex gap-2 text-sm text-sem-warning-fg">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                {obs}
              </li>
            ))}
          </ul>
        </div>

        {/* Quando não funcionar */}
        <div className="mt-6 rounded-xl bg-card p-5 shadow-[var(--shadow-media)]">
          <div className="flex items-center gap-2 mb-3">
            <TriangleAlert className="w-4 h-4 text-foreground/60 flex-shrink-0" />
            <h3 className="font-semibold text-foreground text-sm">Se não funcionar</h3>
          </div>
          <p className="text-sm text-foreground/60 mb-3">
            O sintoma diz onde está o problema — vale reportar assim ao abrir o chamado:
          </p>
          <ul className="space-y-2 text-sm text-foreground/60">
            <li>
              <strong className="text-foreground/80">O RustDesk não mostra ID</strong> (ou fica
              “aguardando”): a caixa não conseguiu se registrar no servidor.
            </li>
            <li>
              <strong className="text-foreground/80">Mostra o ID, mas conectar dá erro</strong>:
              o registro funcionou e o problema está no encaminhamento da sessão.
            </li>
            <li>
              <strong className="text-foreground/80">Conecta e pede senha</strong>: a senha
              permanente não foi aplicada — rode o instalador de novo como administrador.
            </li>
          </ul>
        </div>

        {/* CTA bottom */}
        <div className="mt-10 text-center">
          <a
            href={SCRIPT}
            download
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm shadow-indigo-200 dark:shadow-none"
          >
            <Download className="w-5 h-5" />
            Baixar e instalar
          </a>
          <p className="mt-3 text-xs text-muted-foreground/70">
            Dúvida na instalação? Abra um chamado interno descrevendo em qual passo travou.
          </p>
        </div>
      </div>
    </div>
  )
}
