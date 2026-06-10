import { createFileRoute } from '@tanstack/react-router'
import NewApplicationWizard from '@/components/visa/NewApplicationWizard'

export const Route = createFileRoute('/_app/crew-immigration/visas/new')({
  component: () => <NewApplicationWizard />,
  head: () => ({ meta: [{ title: 'New Visa Application — Polaris' }] }),
})
