/**
 * Duplicate Crew & Folders — fuzzy-match the same person recorded twice, and
 * merge split SharePoint document folders.
 * Route: /crew-immigration/duplicates
 */
import { createFileRoute } from '@tanstack/react-router'
import { CrewDuplicatesPage } from '@/components/crew-immigration/duplicates-page'

export const Route = createFileRoute('/_app/crew-immigration/duplicates')({
  component: CrewDuplicatesPage,
  head: () => ({ meta: [{ title: 'Duplicate Crew & Folders — Polaris' }] }),
})
