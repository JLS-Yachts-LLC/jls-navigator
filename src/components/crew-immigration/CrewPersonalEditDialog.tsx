/**
 * CrewPersonalEditDialog — edit a crew member's personal details in place.
 *
 * Saves the core identity fields to `crew_members` and the visa-specific extras
 * (marital status, parents' names, etc.) to the personal-info endpoint, so the
 * same edit works from the crew profile and the visa Review step.
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface Props {
  crewId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved?: () => void
}

type F = Record<string, string>

const GENDERS = ['', 'Male', 'Female', 'Other', 'Prefer not to say']
const MARITAL = ['', 'Single', 'Married', 'Divorced', 'Widowed']
const RELIGIONS = ['', 'Christianity', 'Islam', 'Muslim', 'Hinduism', 'Buddhism', 'Judaism', 'None / prefer not to say', 'Other']

export function CrewPersonalEditDialog({ crewId, open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState<F>({})
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const db = supabase as any
      const { data: c } = await db.from('crew_members').select('*').eq('id', crewId).maybeSingle()
      let pi: any = {}
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const r = await fetch(`/api/crew/${crewId}/personal-info`, {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        })
        if (r.ok) pi = await r.json()
      } catch { /* fall back to crew columns */ }
      if (!alive) return
      setF({
        first_name: c?.first_name ?? '',
        middle_name: c?.middle_name ?? '',
        last_name: c?.last_name ?? '',
        date_of_birth: c?.date_of_birth ?? '',
        gender: pi.gender ?? c?.gender ?? '',
        nationality: pi.nationalityCitizenship ?? c?.nationality ?? '',
        email: c?.email ?? '',
        phone: c?.phone ?? '',
        placeOfBirth: pi.placeOfBirth ?? c?.place_of_birth ?? '',
        countryOfBirth: pi.countryOfBirth ?? c?.country_of_birth ?? '',
        maritalStatus: pi.maritalStatus ?? '',
        nativeLanguage: pi.nativeLanguage ?? '',
        mothersMaidenName: pi.mothersMaidenName ?? '',
        fathersFullName: pi.fathersFullName ?? '',
        occupation: pi.occupation ?? c?.rank ?? '',
        religion: pi.religion ?? '',
        residenceAddressLine1: pi.residenceAddressLine1 ?? '',
        residenceAddressLine2: pi.residenceAddressLine2 ?? '',
        residenceCity: pi.residenceCity ?? '',
        residenceCountry: pi.residenceCountry ?? '',
        residencePhone: pi.residencePhone ?? '',
      })
      setLoading(false)
    })()
    return () => { alive = false }
  }, [open, crewId])

  async function save() {
    setSaving(true)
    try {
      const db = supabase as any
      const fullName = [f.first_name, f.middle_name, f.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
      const { error: cErr } = await db.from('crew_members').update({
        first_name: f.first_name.trim() || null,
        middle_name: f.middle_name.trim() || null,
        last_name: f.last_name.trim() || null,
        full_name: fullName || null,
        date_of_birth: f.date_of_birth || null,
        gender: f.gender || null,
        nationality: f.nationality.trim() || null,
        email: f.email.trim() || null,
        phone: f.phone.trim() || null,
        rank: f.occupation.trim() || null,
        place_of_birth: f.placeOfBirth.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', crewId)
      if (cErr) throw cErr

      // Visa-specific extras → personal-info endpoint.
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`/api/crew/${crewId}/personal-info`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          nationalityCitizenship: f.nationality.trim() || null,
          placeOfBirth: f.placeOfBirth.trim() || null,
          countryOfBirth: f.countryOfBirth.trim() || null,
          gender: f.gender || null,
          maritalStatus: f.maritalStatus || null,
          nativeLanguage: f.nativeLanguage.trim() || null,
          occupation: f.occupation.trim() || null,
          mothersMaidenName: f.mothersMaidenName.trim() || null,
          fathersFullName: f.fathersFullName.trim() || null,
          religion: f.religion || null,
          residenceAddressLine1: f.residenceAddressLine1?.trim() || null,
          residenceAddressLine2: f.residenceAddressLine2?.trim() || null,
          residenceCity: f.residenceCity?.trim() || null,
          residenceCountry: f.residenceCountry?.trim() || null,
          residencePhone: f.residencePhone?.trim() || null,
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to save personal info')
      }
      toast.success('Personal details saved')
      onOpenChange(false)
      onSaved?.()
    } catch (e: any) {
      toast.error(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const fieldText = (key: string, label: string, type = 'text', placeholder = '') => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={f[key] ?? ''} onChange={e => set(key, e.target.value)} placeholder={placeholder} className="h-9" />
    </div>
  )
  const fieldSelect = (key: string, label: string, opts: string[]) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <select value={f[key] ?? ''} onChange={e => set(key, e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
        {opts.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit personal details</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-auto py-1 pr-1">
            {fieldText('first_name', 'First name')}
            {fieldText('middle_name', 'Middle name')}
            {fieldText('last_name', 'Last name')}
            {fieldText('date_of_birth', 'Date of birth', 'date')}
            {fieldSelect('gender', 'Gender', GENDERS)}
            {fieldText('nationality', 'Nationality')}
            {fieldText('placeOfBirth', 'Place of birth')}
            {fieldText('countryOfBirth', 'Country of birth')}
            {fieldSelect('maritalStatus', 'Marital status', MARITAL)}
            {fieldText('nativeLanguage', 'Native language')}
            {fieldText('mothersMaidenName', "Mother's maiden name")}
            {fieldText('fathersFullName', "Father's full name")}
            {fieldText('occupation', 'Occupation / rank')}
            {fieldSelect('religion', 'Religion', RELIGIONS)}
            {fieldText('email', 'Email', 'email')}
            {fieldText('phone', 'Phone')}
            {/* Country of residence address — editable here so this dialog shows
                the full picture (it previously omitted these, which wiped them). */}
            <div className="col-span-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Country of residence address / contact
            </div>
            {fieldText('residenceAddressLine1', 'Address line 1')}
            {fieldText('residenceAddressLine2', 'Address line 2')}
            {fieldText('residenceCity', 'City')}
            {fieldText('residenceCountry', 'Country')}
            {fieldText('residencePhone', 'Telephone No.')}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CrewPersonalEditDialog
