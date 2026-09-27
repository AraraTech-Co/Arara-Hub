import Image from 'next/image'
import {
  Download,
  Search,
  CheckSquare,
  FileDown,
  Info,
  Database,
  FolderOpen,
  TriangleAlert,
} from 'lucide-react'

/**
 * Distribuímos .zip, e não .exe, por dois motivos práticos:
 *
 *   1. o Painel Fiscal é Java + .bat — não há nada para compilar num
 *      instalador;
 *   2. .exe sem assinatura digital cai no SmartScreen do Windows, e o
 *      certificado custa US$300–600/ano. O certificado ICP-Brasil que usamos
 *      para NF-e NÃO serve para assinar executável.
 *
 * O arquivo antigo (PortalFiscal.exe) era outro artefato — instalador Inno
 * Setup de "Portal Fiscal 1.5", 32 bits, sem assinatura — e não é este
 * programa. Foi removido junto com esta mudança.
 */
const ARQUIVO = '/downloads/PainelFiscal.zip'

const steps = [
  {
    icon: Database,
    title: 'Acesse o Painel Fiscal',
    description: 'Na tela Notas Fiscais, selecione o banco de dados desejado.',
  },
  {
    icon: Info,
    title: 'Informe o intervalo de notas',
    description: (
      <>
        <p className="text-foreground/60 text-sm mb-3">
          No campo <span className="font-medium text-foreground">Intervalo — De / Até</span>, informe:
        </p>
        <ul className="list-disc list-inside text-sm text-foreground/60 space-y-1 mb-4">
          <li>A mesma nota nos dois campos para baixar apenas uma nota.</li>
          <li>Um intervalo de notas para baixar várias notas de uma vez.</li>
        </ul>
        <p className="text-sm font-medium text-foreground/80 mb-2">Exemplo:</p>
        <div className="inline-block rounded-lg border border-border overflow-hidden text-sm">
          <table className="text-left">
            <thead className="bg-muted">
              <tr>
                <th className="px-5 py-2 font-semibold text-foreground/60">De</th>
                <th className="px-5 py-2 font-semibold text-foreground/60">Até</th>
              </tr>
            </thead>
            <tbody className="bg-background">
              <tr>
                <td className="px-5 py-2 text-foreground/80 font-mono">1430</td>
                <td className="px-5 py-2 text-foreground/80 font-mono">1438</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    icon: Search,
    title: 'Clique em Buscar',
    description: 'Após informar o intervalo, clique no botão Buscar.',
  },
  {
    icon: CheckSquare,
    title: 'Selecione as notas',
    description: (
      <ul className="list-disc list-inside text-sm text-foreground/60 space-y-1">
        <li>Marcar notas individualmente.</li>
        <li>Utilizar <span className="font-medium text-foreground">Selecionar Tudo</span> para marcar todas as notas encontradas.</li>
      </ul>
    ),
  },
  {
    icon: FileDown,
    title: 'Baixe os XMLs',
    description: (
      <p className="text-foreground/60 text-sm">
        Clique em <span className="font-medium text-foreground">Baixar Selecionados</span>.
        O sistema gerará um arquivo contendo os XMLs das notas selecionadas.
      </p>
    ),
  },
]

const observations = [
  'Somente notas Autorizadas possuem XML disponível para download.',
  'É possível baixar uma única nota ou várias notas simultaneamente.',
  'Utilize os filtros de data e situação para localizar notas específicas.',
  'Notas inutilizadas não possuem XML, pois não chegaram a ser emitidas. Portanto, não é possível realizar o download de XML para notas com situação Inutilizada.',
]

export default function ColetaNfePdvPage() {
  return (
    <div className="min-h-screen bg-muted/50">
      {/* Hero */}
      <div className="bg-background border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 mb-5">
            <span className="text-3xl">🧾</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Coleta de NFe PDV
          </h1>
          <p className="text-muted-foreground text-base max-w-xl mx-auto mb-8">
            Baixe XMLs de notas fiscais diretamente pelo Painel Fiscal em poucos passos.
          </p>
          <a
            href={ARQUIVO}
            download
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm shadow-indigo-200"
          >
            <Download className="w-5 h-5" />
            Baixar Instalador
          </a>
        </div>

        {/* Preview screenshot */}
        <div className="max-w-5xl mx-auto px-6 pb-10">
          <div className="rounded-xl overflow-hidden border border-border shadow-lg">
            <Image
              src="/painel-fiscal-preview.png"
              alt="Prévia do Painel Fiscal — SGI-PDV"
              width={1440}
              height={820}
              className="w-full h-auto"
              priority
            />
          </div>
        </div>
      </div>

      {/* Instalação — vem ANTES do "como usar" porque é onde o chamado nasce.
          Os dois pontos em destaque são os que mais geram suporte:

          extrair  o Windows deixa executar arquivos de dentro do .zip, abrindo
                   numa pasta temporária. Nesse caso o %SCRIPT_DIR% do
                   instalar.bat aponta para o lugar errado e a instalação falha
                   sem dizer por quê.
          PDV fechado  o banco Derby aceita UM programa por vez. Com o PDV
                   aberto, o painel só consegue abrir bancos de backup. */}
      <div className="max-w-3xl mx-auto px-6 pt-12">
        <h2 className="text-lg font-semibold text-foreground mb-2">Como instalar</h2>
        <p className="text-sm text-muted-foreground mb-6">
          O Painel Fiscal é um programa Java que roda na própria máquina do caixa. Não precisa
          de instalador — é só extrair e executar.
        </p>

        <ol className="space-y-4">
          {[
            {
              titulo: 'Baixe o arquivo PainelFiscal.zip',
              texto: 'Use o botão acima ou o do final da página.',
            },
            {
              titulo: 'EXTRAIA a pasta antes de executar',
              texto:
                'Botão direito no arquivo → Extrair tudo. Não abra o instalar.bat de dentro do zip: o Windows executa numa pasta temporária e a instalação falha.',
              destaque: true,
            },
            {
              titulo: 'Abra a pasta extraída e execute instalar.bat',
              texto: 'Ele prepara o programa e cria o atalho.',
            },
            {
              titulo: 'Use o atalho “Painel Fiscal” na Área de Trabalho',
              texto: 'O painel abre no navegador, servido pela própria máquina.',
            },
          ].map((passo, i) => (
            <li key={i} className="flex gap-4">
              <span
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  passo.destaque
                    ? 'bg-sem-warning text-sem-warning-fg border border-sem-warning-bd'
                    : 'bg-indigo-600 text-white'
                }`}
              >
                {i + 1}
              </span>
              <div className="pt-1">
                <p className={`text-sm font-medium ${passo.destaque ? 'text-sem-warning-fg' : 'text-foreground'}`}>
                  {passo.destaque && <FolderOpen className="inline w-4 h-4 mr-1.5 -mt-0.5" />}
                  {passo.titulo}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">{passo.texto}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-xl bg-card p-5 shadow-[var(--shadow-media)]">
          <h3 className="text-sm font-semibold text-foreground mb-3">Antes de instalar, confira</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Database className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground/70" />
              {/* Expressão, não texto solto: em texto JSX a barra invertida é
                  literal e saía dobrada no HTML; numa string JS `\\` é UMA
                  barra, que é o que o cliente precisa ver. */}
              SGI-PDV instalado em <span className="font-mono text-foreground/80">{'C:\\pdv'}</span>
            </li>
            <li className="flex gap-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground/70" />
              Java 8 ou superior
            </li>
            <li className="flex gap-2 text-sem-warning-fg">
              <TriangleAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <span className="font-medium">O PDV precisa estar fechado</span> para consultar o
                banco atual: o Derby aceita um programa por vez. Com o PDV aberto, só dá para abrir
                bancos de backup.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Steps */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-lg font-semibold text-foreground mb-8">
          Como Baixar XMLs de Notas Fiscais pelo Painel Fiscal
        </h2>

        <ol className="space-y-6">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-5">
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                  {i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div className="w-px flex-1 bg-muted mt-2" />
                )}
              </div>
              <div className="pb-6 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <step.icon className="w-4 h-4 text-indigo-500" />
                  <h3 className="font-semibold text-foreground">{step.title}</h3>
                </div>
                {typeof step.description === 'string' ? (
                  <p className="text-sm text-foreground/60">{step.description}</p>
                ) : (
                  step.description
                )}
              </div>
            </li>
          ))}
        </ol>

        {/* Observations */}
        <div className="mt-6 rounded-xl border border-sem-warning-bd bg-sem-warning p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-sem-warning-fg flex-shrink-0" />
            <h3 className="font-semibold text-sem-warning-fg text-sm">Observações Importantes</h3>
          </div>
          <ul className="space-y-2">
            {observations.map((obs, i) => (
              <li key={i} className="flex gap-2 text-sm text-sem-warning-fg">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                {obs}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA bottom */}
        <div className="mt-10 text-center">
          <a
            href={ARQUIVO}
            download
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm shadow-indigo-200"
          >
            <Download className="w-5 h-5" />
            Baixar Instalador
          </a>
          <p className="mt-3 text-xs text-muted-foreground/70">Windows · Arquivo .zip (2,9 MB)</p>
        </div>
      </div>
    </div>
  )
}
