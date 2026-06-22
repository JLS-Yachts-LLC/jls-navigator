import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import { AdminStatsBar } from '@/components/admin/AdminStatsBar'
import { UserTable } from '@/components/admin/users/UserTable'
import { RBACMatrix } from '@/components/admin/rbac/RBACMatrix'
import { COLORS } from '@/lib/tokens'
import type { UserRole, PermissionRule, RoleOption } from '@/lib/admin/types'

export const Route = createFileRoute('/_app/admin/users')({
  component: AdminUsersPage,
  head: () => ({ meta: [{ title: 'Users & Roles — Admin — Polaris' }] }),
})

function SectionHeading({ title }: { title: string }) {
  return (
    <h2
      style={{
        fontFamily:    "'Space Grotesk', sans-serif",
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color:         COLORS.steel,
        marginBottom:  10,
        marginTop:     0,
      }}
    >
      {title}
    </h2>
  )
}

function AdminUsersPage() {
  const { session } = useAuth()
  const token = (session as any)?.access_token ?? ''

  const [users,       setUsers]       = useState<UserRole[]>([])
  const [usersTotal,  setUsersTotal]  = useState(0)
  const [roles,       setRoles]       = useState<RoleOption[]>([])
  const [rules,       setRules]       = useState<PermissionRule[]>([])
  const [loading,     setLoading]     = useState(true)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [uRes, pRes] = await Promise.all([
        fetch('/api/admin/users?pageSize=50', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/permissions',       { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const [uData, pData] = await Promise.all([uRes.json(), pRes.json()])
      setUsers(uData.users ?? [])
      setUsersTotal(uData.total ?? 0)
      setRoles(uData.roles ?? [])
      setRules(pData.rules ?? [])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <AdminStatsBar />

      <section>
        <SectionHeading title="RBAC permissions matrix" />
        <div
          style={{
            background:   COLORS.abyss,
            border:       `1px solid ${COLORS.deep}`,
            borderRadius: 8,
            overflow:     'hidden',
          }}
        >
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.steel, fontSize: 12 }}>
              Loading…
            </div>
          ) : (
            <RBACMatrix rules={rules} onRefresh={fetchData} />
          )}
        </div>
      </section>

      <section>
        <SectionHeading title="Users & roles" />
        <div
          style={{
            background:   COLORS.abyss,
            border:       `1px solid ${COLORS.deep}`,
            borderRadius: 8,
            overflow:     'hidden',
          }}
        >
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.steel, fontSize: 12 }}>
              Loading…
            </div>
          ) : (
            <UserTable users={users} total={usersTotal} roles={roles} onRefresh={fetchData} />
          )}
        </div>
      </section>
    </div>
  )
}
