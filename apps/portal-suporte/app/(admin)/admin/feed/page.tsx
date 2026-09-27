'use client'

import { OperationalFeed } from '@/components/admin/operational-feed'

/** Feed operacional. Busca sozinho quando não recebe estado inicial. */
export default function FeedPage() {
  return (
    <div className="pt-14 lg:pt-0">
      <OperationalFeed />
    </div>
  )
}
