"use client"

import { useRouter } from "next/navigation"
import { ClienteForm } from "../cliente-form"

export default function NovoClientePage() {
  const router = useRouter()

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Novo Cliente</h1>
      <ClienteForm
        salvar={async (body) => {
          // Na criação, campo vazio não vai.
          const limpo = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== "" && v != null))
          const { arara } = await import("@/lib/arara")
          const data = await arara.createClient(limpo)
          router.push(`/clientes/view?id=${data.id}`)
        }}
        cancelar={() => router.back()}
      />
    </div>
  )
}
