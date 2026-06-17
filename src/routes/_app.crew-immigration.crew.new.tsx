import { createFileRoute, useNavigate } from '@tanstack/react-router'
import PassportDetails from '@/components/visa/PassportDetails'
import type { ExtractedPassportData } from '@/components/visa/PassportDetails'

export const Route = createFileRoute('/_app/crew-immigration/crew/new')({
  component: AddCrewMember,
  head: () => ({
    meta: [{ title: 'Add Crew Member — Polaris' }],
  }),
})

function AddCrewMember() {
  const navigate = useNavigate()

  // Step 2 (Verify Details), 3 (Upload Photo), 4 (Review & Complete) to be built.
  // For now, receiving extracted data here ready for the next step.
  function handleContinue(_data: ExtractedPassportData) {
    // TODO: pass extracted data to step 2 via state or search params
    navigate({ to: '/crew-immigration/crew' })
  }

  function handleSaveDraft() {
    navigate({ to: '/crew-immigration/crew' })
  }

  function handleCancel() {
    navigate({ to: '/crew-immigration/crew' })
  }

  return (
    <PassportDetails
      crewMemberId="new"
      onContinue={handleContinue}
      onSaveDraft={handleSaveDraft}
      onCancel={handleCancel}
    />
  )
}
