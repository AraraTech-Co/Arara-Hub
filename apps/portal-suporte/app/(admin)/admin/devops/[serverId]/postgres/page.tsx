import ClientPage from './client'

export function generateStaticParams() {
  return [{ serverId: '_' }]
}

export default function Page() {
  return <ClientPage />
}
