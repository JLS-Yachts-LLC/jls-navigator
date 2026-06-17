import { createFileRoute, useNavigate } from '@tanstack/react-router'
import PassportDetails from '@/components/visa/PassportDetails'
import type { ExtractedPassportData } from '@/components/visa/PassportDetails'
import { supabase } from '@/integrations/supabase/client'

export const Route = createFileRoute(
  '/_app/crew-immigration/crew/add/$crewMemberId/passport',
)({
  component: PassportStep,
  head: () => ({
    meta: [{ title: 'Add Crew Member — Passport Details · Polaris' }],
  }),
})

function PassportStep() {
  const { crewMemberId } = Route.useParams()
  const navigate = useNavigate()

  async function handleContinue(data: ExtractedPassportData) {
    // Persist a draft row so the wizard can be resumed later.
    // crew_visa_drafts holds step state keyed by crew member id.
    try {
      const db = supabase as any
      await db.from('crew_visa_drafts').upsert(
        {
          crew_member_id:  crewMemberId,
          step:            1,
          passport_data:   data,
          updated_at:      new Date().toISOString(),
        },
        { onConflict: 'crew_member_id' },
      )
    } catch {
      // Non-fatal — draft saving failure must never block the wizard.
    }

    navigate({
      to: '/crew-immigration/crew/add/$crewMemberId/verify',
      params: { crewMemberId },
      state: { passportData: data },
    })
  }

  async function handleSaveDraft() {
    // Called with no data — just signal draft intent and return to the list.
    navigate({ to: '/crew-immigration/crew' })
  }

  function handleCancel() {
    navigate({ to: '/crew-immigration/crew' })
  }

  return (
    <PassportDetails
      crewMemberId={crewMemberId}
      onContinue={handleContinue}
      onSaveDraft={handleSaveDraft}
      onCancel={handleCancel}
    />
  )
}
