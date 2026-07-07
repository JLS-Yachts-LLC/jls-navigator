const ROLE_STYLES: Record<string, string> = {
  global_admin:   'bg-orange-500/15 text-orange-400',
  org_admin:      'bg-orange-400/10 text-orange-300',
  jls_staff:      'bg-cyan-500/10 text-cyan-400',
  vessel_owner:   'bg-emerald-500/10 text-emerald-400',
  captain:        'bg-sky-500/10 text-sky-400',
  crew:           'bg-slate-500/20 text-slate-400',
  supplier:       'bg-amber-500/10 text-amber-400',
  port_agent:     'bg-indigo-500/10 text-indigo-400',
  training_user:  'bg-purple-500/10 text-purple-400',
  placement_user: 'bg-pink-500/10 text-pink-400',
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide
                  ${ROLE_STYLES[role] ?? 'bg-gray-500/20 text-gray-400'}`}
    >
      {role.replace(/_/g, ' ')}
    </span>
  )
}
