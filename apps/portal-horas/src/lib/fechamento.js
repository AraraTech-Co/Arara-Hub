// Fechamento de mês (desenho 2026-11-24-desenho-horas-fechamento-mes).
// A guarda de verdade é a do servidor; aqui só se desabilita o que ele vai recusar
// e se traduz a recusa para uma frase legível.
import { api, getErrorMessage } from '../api/client.js';

/** 'AAAA-MM-DD' (ou Date ISO) → 'AAAA-MM'. Vazio se não der. */
export function mesDe(data) {
  const s = String(data || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}

/** Conjunto dos meses fechados. Falha na leitura = conjunto vazio (o servidor recusa mesmo assim). */
export async function buscarMesesFechados() {
  try {
    const { data } = await api.get('/api/month-closures');
    const lista = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    return new Set(lista.filter((f) => f && f.status === 'fechado').map((f) => f.month));
  } catch {
    return new Set();
  }
}

/** Situação de um mês: { month, status, closedAt, closedByName, history }. */
export async function buscarFechamento(mes) {
  const { data } = await api.get(`/api/month-closures/${mes}`);
  return data?.data ?? data;
}

export async function fecharMes(mes, motivo) {
  const { data } = await api.post(`/api/month-closures/${mes}/close`, motivo ? { reason: motivo } : {});
  return data?.data ?? data;
}

export async function reabrirMes(mes, motivo) {
  const { data } = await api.post(`/api/month-closures/${mes}/reopen`, { reason: motivo });
  return data?.data ?? data;
}

/** Mensagem legível para as recusas do fechamento; demais erros seguem como vierem. */
export function mensagemFechamento(err, t) {
  const body = err?.response?.data || {};
  const codigo = body.error;
  const textos = {
    mes_fechado: t('fechamento.erro.mesFechado', { defaultValue: 'Mês fechado: não dá para criar, editar, excluir nem aprovar lançamentos de {{month}}.', month: body.month || '' }),
    pendentes: t('fechamento.erro.pendentes', { defaultValue: 'Ainda há {{count}} lançamento(s) pendente(s) neste mês. Aprove ou rejeite antes de fechar.', count: body.count ?? 0 }),
    mes_nao_terminou: t('fechamento.erro.naoTerminou', { defaultValue: 'Só dá para fechar um mês que já terminou.' }),
    ja_fechado: t('fechamento.erro.jaFechado', { defaultValue: 'Este mês já está fechado.' }),
    nao_fechado: t('fechamento.erro.naoFechado', { defaultValue: 'Este mês não está fechado.' }),
    motivo_obrigatorio: t('fechamento.erro.motivo', { defaultValue: 'Informe o motivo da reabertura.' }),
    modelo_ausente: t('fechamento.erro.modelo', { defaultValue: 'O fechamento de mês ainda não está ativo na plataforma.' }),
    leitura_fechamento: t('fechamento.erro.leitura', { defaultValue: 'Não foi possível conferir se o mês está fechado. Tente de novo.' }),
    leitura_incompleta: t('fechamento.erro.leitura', { defaultValue: 'Não foi possível conferir se o mês está fechado. Tente de novo.' }),
  };
  return textos[codigo] || getErrorMessage(err);
}
