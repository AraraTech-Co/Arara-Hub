import ClientPage from './client'

export function generateStaticParams() {
  return [{ token: '_' }]
}

export default function Page() {
  return <ClientPage />
}
