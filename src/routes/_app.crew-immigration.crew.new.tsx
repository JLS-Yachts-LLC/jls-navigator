import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import PassportDetails from '@/components/visa/PassportDetails'
import type { ExtractedPassportDataWithVessel } from '@/components/visa/PassportDetails'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/lib/auth'
import { doPushToSharePoint } from '@/lib/sharepoint-push.server'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Check, Loader2, IdCard, UserCog, ClipboardCheck } from 'lucide-react'

export const Route = createFileRoute('/_app/crew-immigration/crew/new')({
  component: AddCrewMember,
  head: () => ({ meta: [{ title: 'Add Crew Member — Polaris' }] }),
})

const DEPARTMENTS = ['Bridge', 'Deck', 'Engineering', 'Interior', 'Galley', 'Other']
const STATUSES = ['active', 'onboard', 'on_leave', 'available', 'inactive']
const STEPS = [
  { n: 1, label: 'Passport', icon: IdCard },
  { n: 2, label: 'Details', icon: UserCog },
  { n: 3, label: 'Review', icon: ClipboardCheck },
]
/** Best-effort convert an OCR date (various formats) to YYYY-MM-DD. */
function toISODate(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function AddCrewMember() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [yachts, setYachts] = useState<{ id: string; vessel_name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    first_name: '', middle_name: '', last_name: '', nationality: '', rank: '', department: '',
    email: '', phone_country_code: '', phone_number: '', status: 'active',
    passport_number: '', passport_expiry_date: '', yacht_id: '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).from('yachts').select('id, vessel_name').eq('archive', false).order('vessel_name')
      setYachts(data ?? [])
    })()
  }, [])

  function onPassport(d: ExtractedPassportDataWithVessel) {
    setForm((f) => ({
      ...f,
      nationality: d.nationality || f.nationality,
      passport_number: d.passportNumber || f.passport_number,
      passport_expiry_date: toISODate(d.expiryDate) || f.passport_expiry_date,
      yacht_id: d.vesselId || f.yacht_id,
    }))
    setStep(2)
  }

  async function create() {
    if (!form.first_name.trim() || !form.last_name.trim()) { toast.error('First and last name are required'); return }
    setBusy(true)
    try {
      const payload: any = {
        first_name: form.first_name.trim(), middle_name: form.middle_name.trim() || null, last_name: form.last_name.trim(),
        nationality: form.nationality || null, rank: form.rank || null, department: form.department || null,
        email: form.email.trim() || null,
        phone_country_code: form.phone_number ? (form.phone_country_code || null) : null,
        phone_number: form.phone_number || null, status: form.status,
        passport_number: form.passport_number.trim() || null, passport_expiry_date: form.passport_expiry_date || null,
        yacht_id: form.yacht_id || null, created_by: user?.id, updated_at: new Date().toISOString(),
      }
      const { data: saved, error } = await (supabase as any).from('crew_members').insert([payload]).select('id').single()
      if (error) throw error
      if (saved?.id) doPushToSharePoint({ data: { target: 'crew_members', id: saved.id } } as any).catch(() => {})
      toast.success('Crew member added')
      navigate({ to: '/crew-immigration/crew' })
    } catch (e: any) { toast.error(e.message ?? 'Failed to create crew member') } finally { setBusy(false) }
  }

  const yachtName = yachts.find((y) => y.id === form.yacht_id)?.vessel_name

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/40 px-6 py-3">
        <button onClick={() => navigate({ to: '/crew-immigration/crew' })} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Crew</button>
        <h1 className="font-display text-xl font-semibold tracking-tight">Add Crew Member</h1>
        {/* Stepper */}
        <div className="mt-3 flex items-center gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = step > s.n, active = step === s.n
            return (
              <div key={s.n} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${active ? 'bg-primary/15 text-primary' : done ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                  {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />} {s.label}
                </div>
                {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
              </div>
            )
          })}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {step === 1 && (
          <PassportDetails crewMemberId="new" onContinue={onPassport}
            onSaveDraft={() => navigate({ to: '/crew-immigration/crew' })}
            onCancel={() => navigate({ to: '/crew-immigration/crew' })} />
        )}

        {step === 2 && (
          <div className="mx-auto max-w-3xl p-6">
            <h2 className="mb-1 font-display text-lg font-semibold">Verify details</h2>
            <p className="mb-4 text-sm text-muted-foreground">Passport fields are pre-filled from the scan — complete the rest. Leave anything you don't have blank.</p>
            <div className="grid grid-cols-2 gap-4">
              <F label="First name *"><Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></F>
              <F label="Last name *"><Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></F>
              <F label="Middle name"><Input value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} /></F>
              <F label="Nationality"><Input value={form.nationality} onChange={(e) => set('nationality', e.target.value)} /></F>
              <F label="Rank / position"><Input value={form.rank} onChange={(e) => set('rank', e.target.value)} /></F>
              <F label="Department"><Sel value={form.department} onChange={(v) => set('department', v)} opts={['', ...DEPARTMENTS]} /></F>
              <F label="Vessel"><Sel value={form.yacht_id} onChange={(v) => set('yacht_id', v)} opts={[{ v: '', l: '— none —' }, ...yachts.map((y) => ({ v: y.id, l: y.vessel_name }))]} /></F>
              <F label="Status"><Sel value={form.status} onChange={(v) => set('status', v)} opts={STATUSES} /></F>
              <F label="Email"><Input value={form.email} onChange={(e) => set('email', e.target.value)} /></F>
              <F label="Phone"><div className="flex gap-2"><Input className="w-20" placeholder="+971" value={form.phone_country_code} onChange={(e) => set('phone_country_code', e.target.value)} /><Input value={form.phone_number} onChange={(e) => set('phone_number', e.target.value)} /></div></F>
              <F label="Passport number"><Input value={form.passport_number} onChange={(e) => set('passport_number', e.target.value)} /></F>
              <F label="Passport expiry"><Input type="date" value={form.passport_expiry_date} onChange={(e) => set('passport_expiry_date', e.target.value)} /></F>
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={() => { if (!form.first_name.trim() || !form.last_name.trim()) { toast.error('First and last name are required'); return } setStep(3) }} className="gap-1.5">Review <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mx-auto max-w-3xl p-6">
            <h2 className="mb-4 font-display text-lg font-semibold">Review &amp; create</h2>
            <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
              {[
                ['Name', [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ')],
                ['Nationality', form.nationality], ['Rank', form.rank], ['Department', form.department],
                ['Vessel', yachtName], ['Status', form.status], ['Email', form.email],
                ['Phone', [form.phone_country_code, form.phone_number].filter(Boolean).join(' ')],
                ['Passport no.', form.passport_number], ['Passport expiry', form.passport_expiry_date],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between px-4 py-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="font-medium">{(v as string) || '—'}</span></div>
              ))}
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={create} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create crew member</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>{children}</div>
}
function Sel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: (string | { v: string; l: string })[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
      {opts.map((o) => typeof o === 'string'
        ? <option key={o} value={o}>{o ? o.replace(/_/g, ' ') : '—'}</option>
        : <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}
