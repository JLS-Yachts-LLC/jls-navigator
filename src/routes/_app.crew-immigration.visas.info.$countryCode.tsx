import { createFileRoute } from '@tanstack/react-router'
import CountryInfoPage from '@/components/visa/CountryInfoPage'

export const Route = createFileRoute('/_app/crew-immigration/visas/info/$countryCode')({
  component: function CountryInfo() {
    const { countryCode } = Route.useParams()
    return <CountryInfoPage countryCode={countryCode} />
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.countryCode.toUpperCase()} Visa Guide — Polaris` }],
  }),
})
