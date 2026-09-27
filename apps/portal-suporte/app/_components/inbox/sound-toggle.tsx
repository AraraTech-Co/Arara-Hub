'use client'

// Interruptor do aviso sonoro. Mora aqui, ao lado da busca, porque é a tela de
// quem convive com o som — e porque um aviso que não se desliga acaba
// desligando o portal inteiro (a pessoa fecha a aba).

import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  definirSom,
  estadoDoAviso,
  pedirPermissaoDeAviso,
  sincronizarSom,
  somLigado,
  tocarAviso,
  tocarChamada,
} from '@/lib/wa-som'

export function SoundToggle() {
  const { toast } = useToast()
  // Começa desligado no servidor e no primeiro render: `localStorage` não
  // existe na exportação estática, e ler no render causaria divergência.
  const [ligado, setLigado] = useState(true)
  // Espelho local primeiro (instantâneo), depois o valor do servidor — a
  // preferência segue o usuário, não o navegador.
  useEffect(() => {
    setLigado(somLigado())
    let vivo = true
    void sincronizarSom().then((v) => { if (vivo) setLigado(v) })
    return () => { vivo = false }
  }, [])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={ligado}
      title={
        ligado
          ? 'Avisos ligados — 1 toque: mensagem nova · 2 toques: conversa atribuída a você. Com a aba em segundo plano, também avisa pelo sistema. Clique para silenciar.'
          : 'Aviso sonoro silenciado (vale em todos os seus navegadores)'
      }
      onClick={async () => {
        const novo = !ligado
        definirSom(novo)
        setLigado(novo)
        // Ao ligar, toca os DOIS sons em sequência: confirma que o áudio
        // funciona neste navegador (o clique é o gesto que a política exige) e
        // ensina a diferença — um toque é mensagem, dois é conversa atribuída.
        if (novo) {
          // A permissão do aviso do sistema é pedida AQUI, dentro do clique:
          // `Notification.requestPermission()` exige gesto do usuário, e pedir
          // na carga da página o navegador recusa calado.
          const estado = estadoDoAviso()
          if (estado === 'default') {
            const liberou = await pedirPermissaoDeAviso()
            toast(
              liberou
                ? {
                    title: 'Avisos ligados',
                    description: 'Com a aba em segundo plano, mensagem nova aparece como aviso do sistema.',
                  }
                : {
                    title: 'Só o som, por enquanto',
                    description: 'Você recusou o aviso do sistema. Dá para liberar depois no cadeado ao lado do endereço.',
                  },
            )
          }

          // Silêncio aqui é indistinguível de defeito — se o navegador
          // recusar o áudio, é preciso DIZER, não deixar a pessoa achando que
          // ligou algo que não vai tocar.
          const saiu = await tocarAviso()
          if (saiu) {
            window.setTimeout(() => void tocarChamada(), 900)
            toast({
              title: 'Aviso sonoro ligado',
              description: '1 toque = mensagem nova · 2 toques = conversa atribuída a você.',
            })
          } else {
            toast({
              title: 'O navegador bloqueou o áudio',
              description:
                'Permita som para este site (cadeado ao lado do endereço → Som) e clique de novo.',
              variant: 'destructive',
            })
          }
        }
      }}
      className="shrink-0 text-muted-foreground hover:text-foreground"
    >
      {ligado ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </Button>
  )
}
