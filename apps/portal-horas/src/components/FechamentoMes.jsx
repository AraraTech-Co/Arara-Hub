import { useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buscarFechamento, fecharMes, reabrirMes, mensagemFechamento } from '../lib/fechamento.js';

function dataHora(iso, locale) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Situação do mês no Financeiro: selo de fechado, botões Fechar/Reabrir (admin)
 * e a trilha. `onMudou` avisa a página para recarregar.
 */
export default function FechamentoMes({ month, isAdmin, onMudou }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
  const [info, setInfo] = useState(null);
  const [modo, setModo] = useState(null); // 'fechar' | 'reabrir' | null
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verTrilha, setVerTrilha] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setInfo(null);
    setModo(null);
    setMotivo('');
    setErro('');
    buscarFechamento(month)
      .then((r) => !cancelado && setInfo(r))
      .catch((e) => !cancelado && setErro(mensagemFechamento(e, t)));
    return () => {
      cancelado = true;
    };
  }, [month, t]);

  async function confirmar() {
    setEnviando(true);
    setErro('');
    try {
      const r = modo === 'fechar' ? await fecharMes(month, motivo.trim()) : await reabrirMes(month, motivo.trim());
      setInfo(r);
      setModo(null);
      setMotivo('');
      onMudou?.();
    } catch (e) {
      setErro(mensagemFechamento(e, t));
    } finally {
      setEnviando(false);
    }
  }

  if (!info && !erro) return null;
  const fechado = info?.status === 'fechado';
  const trilha = Array.isArray(info?.history) ? info.history : [];

  return (
    <section
      className={`rounded-lg border px-4 py-3 text-sm ${
        fechado ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-gray-200 bg-white text-ink-muted'
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          {fechado ? <Lock size={16} aria-hidden /> : <LockOpen size={16} aria-hidden />}
          {fechado ? (
            <span>
              <strong>{t('fechamento.fechado', { defaultValue: 'Mês fechado' })}</strong>{' '}
              {t('fechamento.fechadoPor', {
                defaultValue: 'em {{quando}} por {{quem}}. Lançamentos deste mês não podem ser criados, editados, excluídos nem aprovados, e os valores do Financeiro ficaram congelados.',
                quando: dataHora(info.closedAt, locale),
                quem: info.closedByName || '—',
              })}
            </span>
          ) : (
            <span>{t('fechamento.aberto', { defaultValue: 'Mês aberto.' })}</span>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          {trilha.length > 0 && (
            <button
              type="button"
              onClick={() => setVerTrilha((v) => !v)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-gray-50"
            >
              {verTrilha
                ? t('fechamento.ocultarTrilha', { defaultValue: 'Ocultar histórico' })
                : t('fechamento.verTrilha', { defaultValue: 'Histórico ({{n}})', n: trilha.length })}
            </button>
          )}
          {isAdmin && !modo && (
            <button
              type="button"
              onClick={() => {
                setModo(fechado ? 'reabrir' : 'fechar');
                setErro('');
              }}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
            >
              {fechado
                ? t('fechamento.reabrir', { defaultValue: 'Reabrir mês' })
                : t('fechamento.fechar', { defaultValue: 'Fechar mês' })}
            </button>
          )}
        </div>
      </div>

      {modo && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-ink">
            {modo === 'reabrir'
              ? t('fechamento.motivoReabrir', { defaultValue: 'Motivo da reabertura (obrigatório)' })
              : t('fechamento.motivoFechar', { defaultValue: 'Observação (opcional)' })}
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
          {modo === 'fechar' && (
            <p className="text-xs">
              {t('fechamento.avisoFechar', {
                defaultValue: 'Depois de fechado, ninguém cria, edita, exclui ou aprova lançamentos deste mês até um admin reabrir.',
              })}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={enviando || (modo === 'reabrir' && !motivo.trim())}
              onClick={confirmar}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {modo === 'reabrir'
                ? t('fechamento.confirmarReabrir', { defaultValue: 'Confirmar reabertura' })
                : t('fechamento.confirmarFechar', { defaultValue: 'Confirmar fechamento' })}
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                setModo(null);
                setMotivo('');
                setErro('');
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-gray-50"
            >
              {t('fechamento.cancelar', { defaultValue: 'Cancelar' })}
            </button>
          </div>
        </div>
      )}

      {erro && <p className="mt-2 text-xs text-red-700">{erro}</p>}

      {verTrilha && trilha.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-200 pt-2 text-xs">
          {trilha
            .slice()
            .reverse()
            .map((h, i) => (
              <li key={i}>
                <strong>
                  {h.action === 'REABRIR'
                    ? t('fechamento.acaoReabriu', { defaultValue: 'Reaberto' })
                    : t('fechamento.acaoFechou', { defaultValue: 'Fechado' })}
                </strong>{' '}
                {dataHora(h.at, locale)} · {h.actorName || '—'}
                {h.reason ? ` · ${h.reason}` : ''}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
