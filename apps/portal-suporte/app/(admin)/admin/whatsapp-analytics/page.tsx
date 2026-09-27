'use client'

import { WhatsAppAnalyticsClient } from '@/components/admin/whatsapp-analytics-client'
import { useMeuAcesso } from '@/hooks/use-meu-acesso'

export default function WhatsAppAnalyticsPage() {
  // `useMeuAcesso` e nao `user.roles`: no JWT da plataforma master NAO contem
  // "admin" (sao papeis irmaos na lista, e o apelido so existe no servidor),
  // entao `roles.includes("admin")` escondia a conexao do WhatsApp justamente
  // de quem tem o nivel mais alto. Mesmo defeito que ja tinha escondido o botao
  // de situacao no inbox.
  const { temNivel } = useMeuAcesso()
  const canEditReasons = temNivel('admin')
  // Guardar credencial da empresa: mesmo nivel de disparar mensagem real.
  const canManageToken = temNivel('admin')

  return (
    <div className="pt-14 lg:pt-0">
      <WhatsAppAnalyticsClient
        canEditReasons={canEditReasons}
        canManageToken={canManageToken}
      />
    </div>
  )
}
