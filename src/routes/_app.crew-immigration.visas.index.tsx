import { createFileRoute } from '@tanstack/react-router'
import VisaDashboard from '@/components/visa/VisaDashboard'

export const Route = createFileRoute('/_app/crew-immigration/visas/')({
  component: VisaDashboard,
  head: () => ({ meta: [{ title: 'Visa Applications — Polaris' }] }),
})
