'use client'

/**
 * Materiais de Apoio do projeto.
 *
 * Fica DENTRO do projeto, ao lado dos marcos, e fora do seletor de Kanban /
 * Cronograma / Lista de propósito: material de apoio não é uma leitura do
 * andamento, é o que o projeto precisa ter à mão. Nada daqui aparece na tela
 * de Arquivos — o servidor tranca pelo escopo, não a tela.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Paperclip, Upload, Download, Trash2, Loader2, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { projetosApi, type MaterialDoProjeto } from '@/lib/api/projetos'
import {
  alternar, extrairMateriais, mensagemDeErroNoEnvio, oQueMostrar,
  podeApagarMaterial, recusaAntesDeLer, tamanhoLegivel,
} from '@/lib/projetos-materiais'

export function MateriaisDoProjeto({
  projetoId, podePlanejar, meuId,
}: {
  projetoId: string
  podePlanejar: boolean
  meuId: string
}) {
  const [materiais, setMateriais] = useState<MaterialDoProjeto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [apagando, setApagando] = useState('')
  const [aberto, setAberto] = useState(true)
  const [busca, setBusca] = useState('')
  const entrada = useRef<HTMLInputElement>(null)
  // Quem decide o que aparece é a régua, não o JSX: condição escrita aqui só
  // poderia ser conferida lendo este arquivo.
  const vista = oQueMostrar({ aberto, carregando, erro, materiais, busca })

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await projetosApi.materiais.listar(projetoId)
      const { lista, erro: problema } = extrairMateriais(r)
      setMateriais(lista)
      setErro(problema)
    } catch {
      setMateriais([])
      setErro('Não deu para ler os materiais deste projeto.')
    }
    setCarregando(false)
  }, [projetoId])

  useEffect(() => { void carregar() }, [carregar])

  async function enviar(arquivo: File) {
    const recusa = recusaAntesDeLer(arquivo)
    if (recusa) { setErro(recusa); return }
    setErro('')
    setEnviando(true)
    try {
      const conteudo = await new Promise<string>((ok, falhou) => {
        const leitor = new FileReader()
        leitor.onload = () => ok(String(leitor.result || ''))
        leitor.onerror = () => falhou(new Error('leitura'))
        leitor.readAsDataURL(arquivo)
      })
      const r = await projetosApi.materiais.enviar(projetoId, { nome: arquivo.name, conteudo })
      if (!r || (r as { success?: boolean }).success === false) {
        setErro(mensagemDeErroNoEnvio(r))
      } else {
        // Enviou com o bloco recolhido, ou com uma busca que não casa o nome
        // novo? O arquivo entraria invisível, e a impressão é de que o envio
        // não funcionou.
        setAberto(true)
        setBusca('')
        await carregar()
      }
    } catch (e) {
      setErro(mensagemDeErroNoEnvio(e))
    }
    setEnviando(false)
    if (entrada.current) entrada.current.value = ''
  }

  async function baixar(m: MaterialDoProjeto) {
    try {
      const r = await projetosApi.materiais.baixar(projetoId, m.id)
      const conteudo = String((r?.data as { conteudo?: string } | undefined)?.conteudo || '')
      if (!conteudo) { setErro('O conteúdo deste material não foi encontrado.'); return }
      const a = document.createElement('a')
      a.href = conteudo
      a.download = m.nome
      a.click()
    } catch {
      setErro('Não deu para baixar o material.')
    }
  }

  async function apagar(m: MaterialDoProjeto) {
    setApagando(m.id)
    try {
      await projetosApi.materiais.apagar(projetoId, m.id)
      await carregar()
    } catch {
      setErro('Não deu para apagar o material.')
    }
    setApagando('')
  }

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        {/* O cabeçalho inteiro recolhe a lista. Com algumas centenas de
            arquivos o bloco empurra marcos e atividades para fora da tela, e
            quem veio ver o andamento do projeto não quer rolar o acervo.

            O botão fica DENTRO do h2, e não o contrário: botão só aceita
            conteúdo de frase, e com o h2 lá dentro o leitor de tela perde o
            título da seção. */}
        <h2 className="text-sm font-medium text-foreground min-w-0">
          <button
            type="button"
            onClick={() => setAberto(alternar)}
            aria-expanded={aberto}
            aria-controls="materiais-do-projeto-lista"
            className="flex items-center gap-2 min-w-0 text-left"
          >
            {aberto
              ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Materiais de Apoio</span>
            <span className="text-xs font-normal text-muted-foreground">
              {carregando ? 'carregando…' : `${materiais.length} arquivo(s)`}
            </span>
          </button>
        </h2>
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 h-8 text-xs font-medium cursor-pointer hover:bg-muted">
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {enviando ? 'Enviando…' : 'Enviar material'}
          <input
            ref={entrada}
            type="file"
            className="sr-only"
            disabled={enviando}
            onChange={(e) => {
              const f = e.target.files && e.target.files[0]
              if (f) void enviar(f)
            }}
          />
        </label>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {erro}
        </p>
      )}

      {/* Lista vazia não esconde o bloco: é no bloco que se descobre que existe
          onde pôr o material do projeto. */}
      {vista.recadoVazio && (
        <p className="text-xs text-muted-foreground">{vista.recadoVazio}</p>
      )}

      {/* A busca só aparece quando a lista deixa de caber de olho. */}
      {vista.mostrarBusca && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar entre ${materiais.length} arquivos…`}
            aria-label="Buscar material pelo nome"
            className="w-full rounded-lg border border-border bg-transparent h-8 pl-8 pr-3 text-xs"
          />
        </div>
      )}

      {vista.recadoSemResultado && (
        <p className="text-xs text-muted-foreground">{vista.recadoSemResultado}</p>
      )}

      {vista.lista.length > 0 && (
        /* Rolagem PRÓPRIA: a altura do bloco deixa de depender de quantos
           arquivos o projeto tem. */
        <ul id="materiais-do-projeto-lista" className="divide-y divide-border max-h-80 overflow-y-auto">
          {vista.lista.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{m.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {tamanhoLegivel(m.tamanho)}
                  {m.criado_em ? ` · ${String(m.criado_em).slice(0, 10)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => void baixar(m)}
                  aria-label={`Baixar ${m.nome}`}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                {/* Espelha a régua do servidor: quem não pode apagar não ganha
                    um botão que vai voltar 403. */}
                {podeApagarMaterial(m, { meuId, podePlanejar }) && (
                  <button
                    onClick={() => void apagar(m)}
                    disabled={apagando === m.id}
                    aria-label={`Apagar ${m.nome}`}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 disabled:opacity-50"
                  >
                    {apagando === m.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
