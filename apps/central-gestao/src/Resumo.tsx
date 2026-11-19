import { useCallback, useEffect, useState } from 'react'
import { api, type Area, dataBr, ErroApi, type Indicador, instanteBr, type Resumo as TResumo } from './lib/api'

const MENSAGEM: Record<string, string> = {
  universo_a_definir: 'Universo de tickets a definir.',
  base_nao_cadastrada: 'Base ainda não cadastrada.',
  fonte_nao_configurada: 'Fonte ainda não configurada.',
  falha_leitura: 'Não foi possível consultar a fonte.',
  leitura_incompleta: 'A leitura não terminou; nenhum número foi publicado.',
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`

function fimInclusivo(fimExclusivo: string): string {
  const d = new Date(`${fimExclusivo}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

type Props = { onAbrirKanban: (filtro?: { status?: string; vencidos?: boolean }) => void; onAbrirMarketing: () => void; onSessaoPerdida: () => void }

export function Resumo({ onAbrirKanban, onAbrirMarketing, onSessaoPerdida }: Props) {
  const [mes, setMes] = useState('')
  const [dados, setDados] = useState<TResumo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setCarregando(true)
    setErro(null)
    api
      .resumo(mes || undefined)
      .then((r) => {
        setDados(r)
        if (!mes) setMes(r.periodo.mes)
      })
      .catch((e) => {
        if (e instanceof ErroApi && (e.status === 401 || e.status === 403)) return onSessaoPerdida()
        setErro(e instanceof Error ? e.message : 'Falha ao carregar o resumo.')
      })
      .finally(() => setCarregando(false))
  }, [mes, onSessaoPerdida])

  useEffect(carregar, [carregar])

  return (
    <>
      <div className="cabeca">
        <div>
          <h1>Resumo da gestão</h1>
          <p className="mudo">
            {dados ? <>Consultado em {instanteBr(dados.gerado_em)} · cada área tem a sua referência</> : 'Carregando…'}
          </p>
        </div>
        <button type="button" className="botao" onClick={carregar} disabled={carregando}>
          {carregando ? 'Atualizando…' : 'Atualizar dados'}
        </button>
      </div>

      <section className="filtros" aria-label="Período">
        <label>
          Período dos movimentos
          <input type="month" value={mes} min="2000-01" max="2100-12" onChange={(e) => e.target.value && setMes(e.target.value)} />
        </label>
        <p className="mudo nota-periodo">
          O período muda só os números marcados “no período”. Os marcados “agora” são a situação atual.
        </p>
      </section>

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro} <button type="button" className="link" onClick={carregar}>Tentar de novo</button>
        </p>
      )}

      <div className="areas" aria-busy={carregando}>
        {dados?.areas.map((a) => <AreaCartao key={a.area_key} area={a} onAbrirKanban={onAbrirKanban} onAbrirMarketing={onAbrirMarketing} />)}
        {!dados && carregando && <p className="mudo">Carregando áreas…</p>}
      </div>
    </>
  )
}

const FILTRO_DO_INDICADOR: Record<string, { status?: string; vencidos?: boolean }> = {
  'kanban.para_decidir': { status: 'para_decidir' },
  'kanban.em_andamento': { status: 'em_andamento' },
  'kanban.aguardando': { status: 'aguardando' },
  'kanban.concluidos_periodo': { status: 'concluido' },
  'kanban.vencidos': { vencidos: true },
}

function AreaCartao({ area, onAbrirKanban, onAbrirMarketing }: { area: Area; onAbrirKanban: Props['onAbrirKanban']; onAbrirMarketing: () => void }) {
  const abrir = (k: string) => (area.area_key === 'kanban' ? onAbrirKanban(FILTRO_DO_INDICADOR[k]) : area.area_key === 'marketing' ? onAbrirMarketing() : undefined)
  const semNumero = area.indicadores.length === 0 || area.state !== 'ok'
  return (
    <section className={`area area-${area.area_key}`} aria-labelledby={`area-${area.area_key}`}>
      <header className="area-topo">
        <h2 id={`area-${area.area_key}`}>{area.label}</h2>
        {area.area_key === 'kanban' && (
          <button type="button" className="link" onClick={() => onAbrirKanban()}>Abrir o quadro</button>
        )}
        {area.area_key === 'marketing' && (
          <button type="button" className="link" onClick={onAbrirMarketing}>Abrir marketing</button>
        )}
      </header>
      {semNumero && (
        <p className={`estado ${area.state === 'erro' ? 'estado-erro' : ''}`}>
          {area.state === 'erro' ? '⚠ ' : 'ⓘ '}
          {MENSAGEM[area.reason_code ?? ''] ?? 'Indisponível.'}
        </p>
      )}
      {area.state === 'ok' && area.indicadores.length > 0 && (
        <>
          <ul className="indicadores">
            {area.indicadores.map((i) => (
              <IndicadorItem key={i.metric_key} i={i} onAbrir={() => abrir(i.metric_key)} />
            ))}
          </ul>
          {area.indicadores[0] && (
            <p className="mudo nota">Fonte: {area.indicadores[0].source_label}. Passe o mouse sobre um número para ver o universo.</p>
          )}
          {area.area_key === 'kanban' && (
            <p className="mudo nota">
              Fonte: Kanban da gestão · cartões não arquivados. “Vencidos” também aparecem na coluna de status: não somar.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function IndicadorItem({ i, onAbrir }: { i: Indicador; onAbrir: () => void }) {
  const ref =
    i.tipo === 'periodo' && i.period_start && i.period_end
      ? `no período ${dataBr(i.period_start)} a ${dataBr(fimInclusivo(i.period_end))}`
      : 'agora'
  return (
    <li className="indicador">
      <button type="button" className="indicador-botao" onClick={onAbrir} title={i.universe}>
        <span className="indicador-valor">{i.value === null ? '—' : i.value.toLocaleString('pt-BR')}</span>
        <span className="indicador-nome">{i.label}</span>
        <span className="indicador-ref">
          <span className={`selo selo-${i.tipo}`}>{i.tipo === 'periodo' ? nomeMes(i.period_start!.slice(0, 7)) : 'Agora'}</span>
          <span className="sr"> {ref}. {i.unit}. {i.universe}.</span>
        </span>
      </button>
    </li>
  )
}
