import ClientPage from './deal-redirect'

export function generateStaticParams() {
  return [{ id: '_' }]
}

export default function Page() {
  return <ClientPage />
}
