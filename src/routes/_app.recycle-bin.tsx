import { createFileRoute } from '@tanstack/react-router'
import { RecycleBinPage } from '@/components/recycle-bin-page'

export const Route = createFileRoute('/_app/recycle-bin')({
  component: RecycleBinPage,
  head: () => ({ meta: [{ title: 'Recycle Bin — Polaris' }] }),
})
