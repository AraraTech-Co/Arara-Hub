/**
 * Materiais de Apoio do projeto — a régua que a tela e o teste compartilham.
 *
 * O que vive aqui é o que não pode divergir entre a tela e o servidor, e o que
 * a tela precisa decidir sem chamar o servidor. A régua de QUEM apaga é a
 * mesma do handler: quem enviou, ou quem planeja.
 */
import type { MaterialDoProjeto } from '@/lib/api/projetos'

/** Teto do conteúdo, igual ao do servidor e ao dos anexos de chamado. */
export const MAX_BYTES = 10 * 1024 * 1024

/**
 * Lê a resposta da listagem SEM nunca estourar.
 *
 * A página do projeto já caiu uma vez porque a tela fez `.filter` no que
 * achava ser um array e veio um objeto. Forma inesperada aqui vira lista vazia
 * mais um recado, nunca uma exceção no meio da renderização.
 */
export function extrairMateriais(resposta: unknown): {
  lista: MaterialDoProjeto[]
  erro: string
} {
  const vazio = { lista: [] as MaterialDoProjeto[], erro: '' }
  if (!resposta || typeof resposta !== 'object') {
    return { ...vazio, erro: 'Resposta inesperada ao ler os materiais.' }
  }
  const dados = (resposta as { data?: unknown }).data
  if (!dados || typeof dados !== 'object') {
    return { ...vazio, erro: 'Resposta inesperada ao ler os materiais.' }
  }
  const bruto = (dados as { materiais?: unknown }).materiais
  if (!Array.isArray(bruto)) {
    return { ...vazio, erro: 'Resposta inesperada ao ler os materiais.' }
  }
  return {
    lista: bruto.filter((m): m is MaterialDoProjeto =>
      !!m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'string'),
    erro: '',
  }
}

/** Tamanho legível. Sem casa decimal abaixo de 1 MB: "0,1 MB" não ajuda. */
export function tamanhoLegivel(bytes: number): string {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`
}

/**
 * Quem pode apagar este material?
 *
 * Espelha o handler: quem enviou, ou quem planeja o projeto. A tela esconde o
 * botão para o resto em vez de oferecer um clique que o servidor vai recusar
 * com 403 — e o servidor continua sendo a verdade.
 */
export function podeApagarMaterial(
  material: Pick<MaterialDoProjeto, 'dono_id'>,
  quem: { meuId: string; podePlanejar: boolean },
): boolean {
  if (quem.podePlanejar) return true
  const eu = String(quem.meuId || '')
  return !!eu && String(material.dono_id || '') === eu
}

/**
 * Quantos materiais a lista mostra antes de virar uma lista com rolagem e
 * campo de busca.
 *
 * Abaixo disso o bloco cabe na tela e qualquer enfeite é atrapalho; acima, a
 * lista empurra o resto da página do projeto para longe — com algumas centenas
 * de arquivos, para fora de qualquer rolagem razoável.
 */
export const MUITOS = 8

/** Sem acento e sem caixa: quem procura "contrato" acha "Contrato Anexo.pdf". */
function dobrar(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * A lista que a tela desenha, dado o que foi digitado na busca.
 *
 * Busca vazia devolve TUDO — e devolve a mesma lista, não uma cópia filtrada,
 * para o caso comum não pagar por nada. Nenhum termo casa nada? Devolve vazio,
 * e a tela diz que a busca não achou, que é diferente de "não há material".
 */
export function filtrarMateriais(
  lista: MaterialDoProjeto[],
  busca: string,
): MaterialDoProjeto[] {
  const alvo = dobrar(busca)
  if (!alvo) return lista
  return lista.filter((m) => dobrar(m.nome).includes(alvo))
}

/** O próximo estado do bloco. Mora aqui para o teste poder medir o clique. */
export function alternar(aberto: boolean): boolean {
  return !aberto
}

/** O que a tela desenha. Nada fora disto decide aparecer ou não. */
export type VistaDosMateriais = {
  lista: MaterialDoProjeto[]
  mostrarBusca: boolean
  recadoVazio: string
  recadoSemResultado: string
}

/**
 * O que aparece, dado o estado do bloco.
 *
 * Esta função é a decisão inteira: recolhido, nada; aberto, a lista filtrada,
 * a busca quando o acervo deixa de caber de olho, e um recado diferente para
 * "não há material" e para "a busca não achou". O componente só consome.
 *
 * Mora na régua porque decisão que mora no JSX só pode ser conferida lendo o
 * JSX — e atributo presente não é comportamento. Aqui um teste chama a função
 * e vê o que ela devolve.
 */
export function oQueMostrar(estado: {
  aberto: boolean
  carregando: boolean
  erro: string
  materiais: MaterialDoProjeto[]
  busca: string
}): VistaDosMateriais {
  const nada: VistaDosMateriais = {
    lista: [], mostrarBusca: false, recadoVazio: '', recadoSemResultado: '',
  }
  // Recolhido é recolhido: nem lista, nem busca, nem recado, em qualquer
  // tamanho de acervo e com qualquer busca digitada antes.
  if (!estado.aberto) return nada

  const materiais = estado.materiais || []
  const muitos = materiais.length > MUITOS
  const lista = muitos ? filtrarMateriais(materiais, estado.busca) : materiais

  // Com erro na tela, o recado de vazio sobraria: o bloco já está dizendo que
  // a leitura não deu certo, e "nenhum material ainda" seria mentira.
  const vazio = !estado.carregando && !estado.erro && materiais.length === 0
    ? 'Nenhum material ainda. Envie o que o projeto precisa ter à mão — escopo, contrato, planilha. Vale só dentro deste projeto.'
    : ''
  const semResultado = muitos && materiais.length > 0 && lista.length === 0
    ? 'Nenhum material com esse nome. A busca ignora acento e maiúscula.'
    : ''

  return { lista, mostrarBusca: muitos, recadoVazio: vazio, recadoSemResultado: semResultado }
}

/**
 * O que dizer quando o envio não dá certo.
 *
 * A mensagem do servidor VENCE: é ela que sabe o tipo recusado e o tamanho
 * real. O texto daqui é o último recurso, para a falha não virar um "erro"
 * seco.
 */
export function mensagemDeErroNoEnvio(resposta: unknown): string {
  const padrao = 'Não deu para enviar o material.'
  if (!resposta || typeof resposta !== 'object') return padrao
  const erro = (resposta as { error?: unknown }).error
  return typeof erro === 'string' && erro.trim() ? erro : padrao
}

/**
 * O arquivo escolhido vira o data URI que o servidor espera.
 *
 * O tamanho é conferido ANTES de ler: ler 200 MB para depois recusar trava a
 * aba de quem escolheu o arquivo errado. O servidor confere de novo, no
 * conteúdo — este lado é só a gentileza de avisar antes.
 */
export function recusaAntesDeLer(arquivo: { size: number }): string {
  if (Number(arquivo.size) > MAX_BYTES) {
    return `Material acima do limite de 10 MB (este tem ${tamanhoLegivel(arquivo.size)}).`
  }
  return ''
}
