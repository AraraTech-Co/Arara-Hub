// Valor hora × valor fixo (mensal) no cadastro de usuários.
// Os dois campos se calculam um a partir do outro, com o divisor do contrato:
// PJ = 168 h (referência de sempre), CLT = 200 h fixas. O valor calculado tem
// 2 casas só para exibição; o servidor (finance-controller) usa a origem gravada
// em rate_type e, na origem mensal, mensal ÷ divisor sem arredondar.

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
 * Aplica a digitação num dos campos ('hourlyRate' | 'monthlyRate'), recalcula o
 * outro para exibição e marca a origem em `rateType` ("Tipo de remuneração"),
 * que é gravado: o servidor calcula a partir da origem, com precisão integral.
 */
export function editarValor(form, campo, valor) {
  if (campo === 'monthlyRate') {
    return {
      ...form,
      monthlyRate: valor,
      hourlyRate: horaDoFixo(valor, form.contractType),
      rateType: 'monthly',
    };
  }
  return {
    ...form,
    hourlyRate: valor,
    monthlyRate: fixoDaHora(valor, form.contractType),
    rateType: 'hourly',
  };
}

/**
 * Troca o contrato e recalcula, a partir da origem gravada, o campo que não é a
 * origem. Sem origem (cadastro antigo) só o contrato muda: não se adivinha qual
 * dos dois valores é o verdadeiro.
 */
export function trocarContrato(form, tipo) {
  const contractType = normalizarContrato(tipo);
  const proximo = { ...form, contractType };
  if (form.rateType === 'monthly' && numeroValido(form.monthlyRate) !== null) {
    return { ...proximo, hourlyRate: horaDoFixo(form.monthlyRate, contractType) };
  }
  if (form.rateType === 'hourly' && numeroValido(form.hourlyRate) !== null) {
    return { ...proximo, monthlyRate: fixoDaHora(form.hourlyRate, contractType) };
  }
  return proximo;
}

/** Cadastro sem origem com os dois valores: o cálculo usa a hora gravada; revisar. */
export function origemPendente(form) {
  return (
    form.rateType !== 'monthly' &&
    form.rateType !== 'hourly' &&
    numeroValido(form.hourlyRate) !== null &&
    numeroValido(form.monthlyRate) !== null
  );
}
