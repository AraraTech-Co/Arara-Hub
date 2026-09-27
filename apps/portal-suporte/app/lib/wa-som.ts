// =============================================================================
// Avisos sonoros do atendimento.
//
// Sintetizados no navegador (WebAudio), sem arquivo de áudio: o portal é export
// estático servido pela hospedagem da plataforma, e um .mp3 seria mais um
// arquivo para versionar, servir e cachear.
//
// São DOIS sons, de propósito — quem está trabalhando precisa saber o que
// aconteceu sem olhar para a tela:
//
//   tocarAviso()    UM toque   → chegou mensagem de cliente
//   tocarChamada()  DOIS toques → o rodízio entregou uma conversa a você
//
// Tom *suave* de propósito (23/09/2026): o sino metálico antigo (parciais
// inarmônicos agudos + cauda longa) cansava em volume alto o dia inteiro.
// Agora é um "ploc" curto — fundamental + 2ª harmônica fraca, volume baixo,
// cauda curta. Continua distinguível do silêncio e entre aviso/chamada, sem
// o "tlim" de campainha.
//
// Duas regras que todo aviso em ferramenta de trabalho precisa ter:
//
//   silenciável   `localStorage.wa_som = "0"` desliga. Quem atende fica com o
//                 portal aberto o dia inteiro; som que não se desliga vira
//                 motivo para fechar a aba.
//   sem susto     o navegador bloqueia áudio antes do primeiro clique
//                 (política de autoplay). Esperamos o primeiro gesto e só
//                 então destravamos o contexto.
// =============================================================================

import { whatsappApi } from '@/lib/api/whatsapp'

const CHAVE = 'wa_som'

let contexto: AudioContext | null = null
let liberado = false

// ── A preferência SEGUE O USUÁRIO (16/09/2026) ──
// Antes vivia só no localStorage, ou seja, por navegador: silenciar no PC da
// mesa não silenciava o notebook nem outra aba em outro endereço. Agora a
// verdade é o servidor (WaAgentProfiles.som_ligado, via /whatsapp/presence);
// o localStorage é só o espelho que as funções síncronas leem. Espelho e
// servidor se acertam na carga e a cada minuto.
const SINCRONIA_MS = 60_000
let sincronizando: Promise<boolean> | null = null

/** Deve tocar? Só o navegador responde — no servidor, nunca. */
export function somLigado(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(CHAVE) !== '0'
}

/** Grava no espelho e no servidor. O espelho muda na hora; o servidor, em seguida. */
export function definirSom(ligado: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CHAVE, ligado ? '1' : '0')
  whatsappApi.setSom(ligado).catch(() => {
    /* sem rede: o espelho já vale para esta aba; a próxima sincronia acerta */
  })
}

/** Lê a preferência do servidor e atualiza o espelho. Devolve o valor vigente. */
export function sincronizarSom(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (sincronizando) return sincronizando
  sincronizando = whatsappApi
    .getPresence()
    .then((r) => {
      if (typeof r.data?.som === 'boolean') {
        window.localStorage.setItem(CHAVE, r.data.som ? '1' : '0')
      }
      return somLigado()
    })
    .catch(() => somLigado())
    .finally(() => {
      sincronizando = null
    })
  return sincronizando
}

/**
 * Destrava o áudio no primeiro clique/tecla da sessão. Chamar no carregamento
 * da casca; é barato e idempotente.
 */
let sincroniaAgendada = false
export function prepararSom() {
  if (typeof window === 'undefined') return
  if (!sincroniaAgendada) {
    sincroniaAgendada = true
    void sincronizarSom()
    window.setInterval(() => void sincronizarSom(), SINCRONIA_MS)
  }
  if (liberado) return
  const liberar = () => {
    liberado = true
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor && !contexto) contexto = new Ctor()
      void contexto?.resume()
    } catch {
      /* sem áudio neste navegador — o aviso visual continua valendo */
    }
    window.removeEventListener('pointerdown', liberar)
    window.removeEventListener('keydown', liberar)
  }
  window.addEventListener('pointerdown', liberar, { once: true })
  window.addEventListener('keydown', liberar, { once: true })
}

/** Harmônicas suaves (não inarmônicas de sino) — sem o brilho metálico. */
const PARCIAIS: { razao: number; peso: number }[] = [
  { razao: 1, peso: 1 },
  { razao: 2, peso: 0.22 },
]

/** Um toque curto: ataque macio e cauda breve. */
function toque(quando: number, base: number, volume: number, cauda: number) {
  if (!contexto) return
  for (const { razao, peso } of PARCIAIS) {
    const osc = contexto.createOscillator()
    const vol = contexto.createGain()
    osc.type = 'sine'
    osc.frequency.value = base * razao
    const dur = cauda * (razao === 1 ? 1 : 0.55)
    const pico = volume * peso
    // Ataque um pouco mais lento que o sino antigo = menos "estalo" no ouvido.
    vol.gain.setValueAtTime(0.0001, quando)
    vol.gain.exponentialRampToValueAtTime(pico, quando + 0.018)
    vol.gain.exponentialRampToValueAtTime(0.0001, quando + dur)
    osc.connect(vol).connect(contexto.destination)
    osc.start(quando)
    osc.stop(quando + dur + 0.02)
  }
}

/**
 * Garante um contexto TOCANDO, criando e retomando se preciso.
 *
 * Antes eu dependia de o ouvinte de gesto ter rodado antes, e quando não
 * tinha, o som simplesmente não saía — sem erro, sem aviso, nada. Chamado de
 * dentro de um clique, isto resolve na hora; chamado de um temporizador, o
 * navegador recusa e devolvemos `false`, que é o que o chamador precisa saber.
 */
async function garantirContexto(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return false
    if (!contexto) contexto = new Ctor()
    // `resume()` é assíncrono: sem aguardar, o estado ainda é "suspended" na
    // linha seguinte e o toque é descartado. Era exatamente essa a corrida.
    if (contexto.state !== 'running') await contexto.resume()
    return contexto.state === 'running'
  } catch {
    return false
  }
}

/** Mensagem nova de cliente: UM toque. Devolve se conseguiu tocar. */
export async function tocarAviso(): Promise<boolean> {
  if (!somLigado()) return false
  if (!(await garantirContexto())) return false
  // ~E5, baixo e curto — audível sem furar a cabeça.
  toque(contexto!.currentTime, 659, 0.11, 0.28)
  return true
}

/**
 * Rodízio entregou uma conversa a você: DOIS toques (antes eram três sino).
 * Ainda distingue de mensagem nova, sem a campainha insistente.
 */
export async function tocarChamada(): Promise<boolean> {
  if (!somLigado()) return false
  if (!(await garantirContexto())) return false
  const t = contexto!.currentTime
  toque(t, 523, 0.1, 0.26) // dó
  toque(t + 0.2, 659, 0.1, 0.32) // mi
  return true
}

// ─── Aviso do sistema operacional ────────────────────────────────────────────
//
// O som resolve quem está com a aba à vista. Quem está noutra janela — que é a
// maior parte do turno — não ouve nada útil: o navegador pode ter silenciado a
// aba em segundo plano, e som sozinho não diz DE QUEM é a mensagem.
//
// A permissão é pedida no mesmo clique que liga o som. Não é economia de
// código: `Notification.requestPermission()` exige gesto do usuário, e pedir
// na carga da página faz o navegador recusar em silêncio (ou o Chrome punir o
// site por pedido não solicitado).

/** `default` = nunca perguntado · `granted` · `denied` · `indisponivel`. */
export function estadoDoAviso(): 'default' | 'granted' | 'denied' | 'indisponivel' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'indisponivel'
  return Notification.permission as 'default' | 'granted' | 'denied'
}

/** Pede a permissão. Só chame de dentro de um clique. */
export async function pedirPermissaoDeAviso(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/**
 * Mostra o aviso. Silencioso por contrato: quem toca é `tocarAviso()`, e dois
 * sons na mesma chegada é o caminho para a pessoa desligar tudo.
 *
 * `tag` agrupa por conversa — dez mensagens do mesmo cliente substituem o aviso
 * anterior em vez de empilharem dez cartões na tela.
 */
export function mostrarAviso(titulo: string, corpo: string, tag?: string): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false
  // Respeita o MESMO interruptor do som: um botão só para "me avise".
  if (!somLigado()) return false
  try {
    const n = new Notification(titulo, { body: corpo, tag, silent: true })
    n.onclick = () => {
      window.focus()
      n.close()
    }
    return true
  } catch {
    return false
  }
}
