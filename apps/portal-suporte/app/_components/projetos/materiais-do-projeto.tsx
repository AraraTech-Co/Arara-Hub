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
import { Paperclip, Upload, Download, Trash2, Loader2 } from 'lucide-react'
import { projetosApi, type MaterialDoProjeto } from '@/lib/api/projetos'
import {
  extrairMateriais, mensagemDeErroNoEnvio, podeApagarMaterial, recusaAntesDeLer,
  tamanhoLegivel,
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
  const entrada = useRef<HTMLInputElement>(null)

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
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">Materiais de Apoio</h2>
          <span className="text-xs text-muted-foreground">
            {carregando ? 'carregando…' : `${materiais.length} arquivo(s)`}
          </span>
        </div>
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
      {!carregando && materiais.length === 0 && !erro && (
        <p className="text-xs text-muted-foreground">
          Nenhum material ainda. Envie o que o projeto precisa ter à mão — escopo,
          contrato, planilha. Vale só dentro deste projeto.
        </p>
      )}

      {materiais.length > 0 && (
        <ul className="divide-y divide-border">
          {materiais.map((m) => (
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
