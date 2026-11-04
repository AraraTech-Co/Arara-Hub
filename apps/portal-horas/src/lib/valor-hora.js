// Valor hora × valor fixo (mensal) no cadastro de usuários.
// Os dois campos se calculam um a partir do outro, com o divisor do contrato:
// PJ = 168 h (referência de sempre), CLT = 200 h fixas. O servidor usa o mesmo
// divisor quando o valor hora não está gravado (finance-controller).

export const HORAS_REFERENCIA = Object.freeze({ PJ: 168, CLT: 200 });

export function normalizarContrato(tipo) {
  return String(tipo || '').trim().toUpperCase() === 'CLT' ? 'CLT' : 'PJ';
}

export function divisorDoContrato(tipo) {
  return HORAS_REFERENCIA[normalizarContrato(tipo)];
}

function numeroValido(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Valor fixo → valor hora, em centavos ('' se o fixo for vazio/inválido). */
export function horaDoFixo(fixo, tipo) {
  const n = numeroValido(fixo);
  return n === null ? '' : (n / divisorDoContrato(tipo)).toFixed(2);
}

/** Valor hora → valor fixo, em centavos ('' se a hora for vazia/inválida). */
export function fixoDaHora(hora, tipo) {
  const n = numeroValido(hora);
  return n === null ? '' : (n * divisorDoContrato(tipo)).toFixed(2);
}

/**
 * Aplica a digitação num dos campos ('hourlyRate' | 'monthlyRate') e recalcula
 * o outro. Guarda em `rateSource` qual foi digitado por último.
 */
export function editarValor(form, campo, valor) {
  if (campo === 'monthlyRate') {
    return {
      ...form,
      monthlyRate: valor,
      hourlyRate: horaDoFixo(valor, form.contractType),
      rateSource: 'monthly',
    };
  }
  return {
    ...form,
    hourlyRate: valor,
    monthlyRate: fixoDaHora(valor, form.contractType),
    rateSource: 'hourly',
  };
}

/**
 * Troca o contrato e recalcula o campo que não é a base. A base é o último
 * digitado; sem digitação, o valor fixo (se houver), senão o valor hora.
 */
export function trocarContrato(form, tipo) {
  const contractType = normalizarContrato(tipo);
  const base =
    form.rateSource || (numeroValido(form.monthlyRate) !== null ? 'monthly' : 'hourly');
  const proximo = { ...form, contractType };
  if (base === 'monthly') {
    if (numeroValido(form.monthlyRate) === null) return proximo;
    return { ...proximo, hourlyRate: horaDoFixo(form.monthlyRate, contractType) };
  }
  if (numeroValido(form.hourlyRate) === null) return proximo;
  return { ...proximo, monthlyRate: fixoDaHora(form.hourlyRate, contractType) };
}
