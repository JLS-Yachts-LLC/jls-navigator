import { createFileRoute } from '@tanstack/react-router'
import { SupportingDocumentsPage } from '@/components/visa/SupportingDocumentsPage'

export const Route = createFileRoute('/_app/crew-immigration/visas/supporting-docs')({
  validateSearch: (search: Record<string, unknown>) => ({
    applicationId: (search.applicationId as string | undefined) ?? '',
  }),
  component: SupportingDocumentsPage,
  head: () => ({ meta: [{ title: 'Supporting Documents — Crew Visa Application — Polaris' }] }),
})
