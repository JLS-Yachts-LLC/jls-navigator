import { r as reactExports, U as jsxRuntimeExports, a0 as createServerFn } from "./worker-entry-DhepChOA.js";
import { c as createSsrRpc } from "./createSsrRpc-CTaO8G6H.js";
import { s as supabase, r as reactDomExports, t as toast } from "./router-Bc2HnlN-.js";
import { B as Button } from "./button-D-MC7cwU.js";
import { I as Input } from "./input-BDjT_6ye.js";
import { L as Label } from "./label-C08Ryk5r.js";
import { M as Mail, L as LoaderCircle, C as CircleCheck, S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-CDxkNFcG.js";
import { U as Users } from "./users-CsCC9EKZ.js";
import { c as createLucideIcon } from "./createLucideIcon-DaHG-k7W.js";
import { P as Plus } from "./Combination-C72AcNXt.js";
import { S as Save } from "./save-C702XIfF.js";
import { X, P as Pencil, T as Trash2 } from "./x-BzDK9b3c.js";
import { C as ChevronDown } from "./chevron-down-CMsRUMAv.js";
import { S as Search } from "./search-Cw56PDyy.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const __iconNode$4 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m15 9-6 6", key: "1uzhvr" }],
  ["path", { d: "m9 9 6 6", key: "z0biqf" }]
];
const CircleX = createLucideIcon("circle-x", __iconNode$4);
const __iconNode$3 = [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "1w4ew1" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4", key: "fwvmzm" }]
];
const Lock = createLucideIcon("lock", __iconNode$3);
const __iconNode$2 = [
  ["path", { d: "M12 22v-5", key: "1ega77" }],
  ["path", { d: "M15 8V2", key: "18g5xt" }],
  [
    "path",
    { d: "M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z", key: "1xoxul" }
  ],
  ["path", { d: "M9 8V2", key: "14iosj" }]
];
const Plug = createLucideIcon("plug", __iconNode$2);
const __iconNode$1 = [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
];
const RotateCcw = createLucideIcon("rotate-ccw", __iconNode$1);
const __iconNode = [
  [
    "path",
    {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      key: "oel41y"
    }
  ]
];
const Shield = createLucideIcon("shield", __iconNode);
const getUsers = createServerFn({
  method: "GET"
}).handler(createSsrRpc("b598a33c9588455ecb3ce12296e7a5c891fe206829c4e50f91d7f973eb56986e"));
const doInviteUser = createServerFn({
  method: "POST"
}).handler(createSsrRpc("6a9d2e8c8729ad8ff41a489aa7233b11fe593f113142ce1fee975a0be08937ff"));
const doResetPassword = createServerFn({
  method: "POST"
}).handler(createSsrRpc("6c208b1a0af90def6c360d75213094e233a0acba8750722d51b036f0eac5065f"));
const doSetRole = createServerFn({
  method: "POST"
}).handler(createSsrRpc("7d3f8f88b53cd2506f7c5866f316758f2c377a07d722fe7a2b6516b1c617a55d"));
const doDeleteUser = createServerFn({
  method: "POST"
}).handler(createSsrRpc("91856ceb22fa4c8613b5acd90038f7450b87d64c67af55f7bce83c056854771e"));
const doDisableMFA = createServerFn({
  method: "POST"
}).handler(createSsrRpc("08425488a94a11a3ec1360d716ac0a92d95a2cb2e9ce4dbb05151838b1b49938"));
const getPerms = createServerFn({
  method: "GET"
}).handler(createSsrRpc("750747dffb0e4eff5ebce8c6a9392f223b636914fdc37b24cec906cbbfb7086e"));
const savePerms = createServerFn({
  method: "POST"
}).handler(createSsrRpc("0bcd254e48f20498683455aafab754c4b8994a69e3d9214ee0b7c4ee231d7c81"));
const doDiscoverSharePointColumns = createServerFn({
  method: "POST"
}).handler(createSsrRpc("07225f0bd05122fdd3c1e65c3b8a0ce5e261315493c371cc0e4777ca4edfd3e7"));
const doSyncSharePoint = createServerFn({
  method: "POST"
}).handler(createSsrRpc("5def584ad8cd342e9ac57d676716005d1e7dd545c8c7c727ed9d14e14651fd23"));
const doRegisterWebhook = createServerFn({
  method: "POST"
}).handler(createSsrRpc("41df536649888d975408b3ca854c66fd314108230f3b95a7ed8aeb2ba9dda1cd"));
const doRenewWebhook = createServerFn({
  method: "POST"
}).handler(createSsrRpc("2368c564a41affb19c618b9bddb68f8da7deb02f5f08f7420da4ab8f5d9491e2"));
const doGetWebhookStatus = createServerFn({
  method: "GET"
}).handler(createSsrRpc("86db7fabc9fc3c1b901535e398c233ae9ab26e1a4a0dc520b370af5cf597f50c"));
const DEPARTMENTS = ["Port & Operations", "Logistics", "Crew Cab", "Orbit", "Accounts", "Marketing", "Packages & Deliveries", "Director", "Management"];
const MODULES = ["Yachts", "Permits", "Small Boat Registration", "Orbit", "Crew Cab", "Packages & Deliveries", "Director"];
function SettingsPage() {
  const [tab, setTab] = reactExports.useState("users");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("nav", { className: "w-52 shrink-0 border-r border-border bg-muted/30 p-4 space-y-0.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2", children: "Settings" }),
      [{
        key: "users",
        label: "Users",
        Icon: Users
      }, {
        key: "permissions",
        label: "Permissions",
        Icon: Shield
      }, {
        key: "integrations",
        label: "Integrations",
        Icon: Plug
      }, {
        key: "emailTemplates",
        label: "Email Templates",
        Icon: Mail
      }].map(({
        key,
        label,
        Icon
      }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setTab(key), className: `flex items-center gap-2 w-full rounded-md px-2.5 py-2 text-sm transition ${tab === key ? "bg-primary/15 text-primary font-medium" : "text-foreground/70 hover:bg-accent"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "h-4 w-4 shrink-0" }),
        label
      ] }, key))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto", children: [
      tab === "users" && /* @__PURE__ */ jsxRuntimeExports.jsx(UsersPanel, {}),
      tab === "permissions" && /* @__PURE__ */ jsxRuntimeExports.jsx(PermissionsPanel, {}),
      tab === "integrations" && /* @__PURE__ */ jsxRuntimeExports.jsx(IntegrationsPanel, {}),
      tab === "emailTemplates" && /* @__PURE__ */ jsxRuntimeExports.jsx(EmailTemplatesPanel, {})
    ] })
  ] });
}
function UsersPanel() {
  const [users, setUsers] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [error, setError] = reactExports.useState(null);
  const [showInvite, setShowInvite] = reactExports.useState(false);
  const [inviteEmail, setInviteEmail] = reactExports.useState("");
  const [inviting, setInviting] = reactExports.useState(false);
  const [actionLoading, setActionLoading] = reactExports.useState(null);
  const loadUsers = reactExports.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setUsers(await getUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    loadUsers();
  }, [loadUsers]);
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      setInviting(true);
      await doInviteUser({
        data: {
          email: inviteEmail.trim()
        }
      });
      setInviteEmail("");
      setShowInvite(false);
      await loadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  };
  const handleResetPassword = async (email) => {
    if (!confirm(`Send password reset email to ${email}?`)) return;
    try {
      setActionLoading("reset-" + email);
      await doResetPassword({
        data: {
          email
        }
      });
      alert("Password reset email sent.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to send reset");
    } finally {
      setActionLoading(null);
    }
  };
  const handleRoleChange = async (userId, role) => {
    try {
      setActionLoading("role-" + userId);
      await doSetRole({
        data: {
          userId,
          role
        }
      });
      setUsers((prev) => prev.map((u) => u.id === userId ? {
        ...u,
        role
      } : u));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setActionLoading(null);
    }
  };
  const handleDisableMFA = async (user) => {
    if (!confirm(`Disable MFA for ${user.email}?`)) return;
    try {
      setActionLoading("mfa-" + user.id);
      await doDisableMFA({
        data: {
          userId: user.id,
          factorIds: user.factorIds
        }
      });
      setUsers((prev) => prev.map((u) => u.id === user.id ? {
        ...u,
        mfaEnabled: false,
        factorIds: []
      } : u));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to disable MFA");
    } finally {
      setActionLoading(null);
    }
  };
  const handleRemove = async (user) => {
    if (!confirm(`Permanently remove ${user.email}? This cannot be undone.`)) return;
    try {
      setActionLoading("del-" + user.id);
      await doDeleteUser({
        data: {
          userId: user.id
        }
      });
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to remove user");
    } finally {
      setActionLoading(null);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 max-w-5xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-semibold", children: "Users" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground mt-0.5", children: "Manage access, invitations and security" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: () => setShowInvite(true), className: "gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
        " Invite User"
      ] })
    ] }),
    showInvite && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold", children: "Invite User" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "An invitation email will be sent. The user must accept to gain access." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "email", value: inviteEmail, onChange: (e) => setInviteEmail(e.target.value), onKeyDown: (e) => e.key === "Enter" && handleInvite(), placeholder: "user@example.com", autoFocus: true, className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2 justify-end pt-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => {
          setShowInvite(false);
          setInviteEmail("");
        }, children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: handleInvite, disabled: inviting || !inviteEmail.trim(), children: [
          inviting ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin mr-1.5" }) : null,
          "Send Invite"
        ] })
      ] })
    ] }) }),
    loading && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center py-20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive", children: error }),
    !loading && !error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-xl border border-border overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border bg-muted/40", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium text-muted-foreground", children: "User" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium text-muted-foreground", children: "Role" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium text-muted-foreground", children: "MFA" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium text-muted-foreground", children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium text-muted-foreground", children: "Last seen" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 w-10" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { className: "divide-y divide-border", children: [
        users.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 6, className: "px-4 py-12 text-center text-muted-foreground", children: "No users found" }) }),
        users.map((user) => /* @__PURE__ */ jsxRuntimeExports.jsx(UserRow, { user, isLoading: actionLoading === "role-" + user.id || actionLoading === "mfa-" + user.id || actionLoading === "del-" + user.id || actionLoading === "reset-" + user.email, onResetPassword: () => handleResetPassword(user.email), onRoleChange: (role) => handleRoleChange(user.id, role), onDisableMFA: () => handleDisableMFA(user), onRemove: () => handleRemove(user) }, user.id))
      ] })
    ] }) })
  ] });
}
const ROLE_STYLES = {
  admin: "bg-red-500/15 text-red-400 border-red-500/20",
  manager: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  user: "bg-muted text-muted-foreground border-border"
};
function UserRow({
  user,
  isLoading,
  onResetPassword,
  onRoleChange,
  onDisableMFA,
  onRemove
}) {
  const [open, setOpen] = reactExports.useState(false);
  const [pos, setPos] = reactExports.useState({
    top: 0,
    right: 0
  });
  const btnRef = reactExports.useRef(null);
  const initials = (user.displayName ?? user.email).slice(0, 2).toUpperCase();
  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({
        top: r.bottom + 4,
        right: window.innerWidth - r.right
      });
    }
    setOpen((v) => !v);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary", children: initials }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium truncate", children: user.displayName ?? user.email }),
        user.displayName && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground truncate", children: user.email })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${ROLE_STYLES[user.role]}`, children: user.role }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: user.mfaEnabled ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-xs text-emerald-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-3.5 w-3.5" }),
      " On"
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-xs text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "h-3.5 w-3.5" }),
      " Off"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: user.invited ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400", children: "Invited" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400", children: "Active" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-xs text-muted-foreground", children: user.lastSignIn ? new Date(user.lastSignIn).toLocaleDateString() : "—" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { ref: btnRef, variant: "ghost", size: "sm", className: "h-7 w-7 p-0", onClick: handleOpen, disabled: isLoading, children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "h-3.5 w-3.5" }) }),
      open && reactDomExports.createPortal(/* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-40", onClick: () => setOpen(false) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed z-50 w-52 rounded-lg border border-border bg-popover shadow-xl py-1", style: {
          top: pos.top,
          right: pos.right
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", children: "Change Role" }),
          ["admin", "manager", "user"].map((role) => /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => {
            onRoleChange(role);
            setOpen(false);
          }, className: `flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent capitalize ${user.role === role ? "text-primary font-medium" : ""}`, children: [
            role,
            user.role === role && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-3.5 w-3.5 ml-auto" })
          ] }, role)),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "my-1 border-t border-border" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => {
            onResetPassword();
            setOpen(false);
          }, className: "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { className: "h-3.5 w-3.5" }),
            " Send Password Reset"
          ] }),
          user.mfaEnabled && /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => {
            onDisableMFA();
            setOpen(false);
          }, className: "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { className: "h-3.5 w-3.5" }),
            " Disable MFA"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "my-1 border-t border-border" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => {
            onRemove();
            setOpen(false);
          }, className: "flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }),
            " Remove User"
          ] })
        ] })
      ] }), document.body)
    ] }) })
  ] });
}
function PermissionsPanel() {
  const [perms, setPerms] = reactExports.useState([]);
  const [selectedDept, setSelectedDept] = reactExports.useState(DEPARTMENTS[0]);
  const [loading, setLoading] = reactExports.useState(true);
  const [saving, setSaving] = reactExports.useState(false);
  const [saved, setSaved] = reactExports.useState(false);
  reactExports.useEffect(() => {
    getPerms().then(setPerms).finally(() => setLoading(false));
  }, []);
  const getPerm = (dept, mod) => perms.find((p) => p.department === dept && p.module === mod) ?? {
    department: dept,
    module: mod,
    can_view: false,
    can_create: false,
    can_edit: false
  };
  const toggle = (dept, mod, field) => {
    setPerms((prev) => {
      const idx = prev.findIndex((p) => p.department === dept && p.module === mod);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          [field]: !next[idx][field]
        };
        return next;
      }
      return [...prev, {
        department: dept,
        module: mod,
        can_view: false,
        can_create: false,
        can_edit: false,
        [field]: true
      }];
    });
    setSaved(false);
  };
  const handleSave = async () => {
    try {
      setSaving(true);
      const allPerms = DEPARTMENTS.flatMap((dept) => MODULES.map((mod) => getPerm(dept, mod)));
      await savePerms({
        data: allPerms
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2e3);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-semibold", children: "Department Permissions" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground mt-0.5", children: "Control which modules each department can access" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: handleSave, disabled: saving, className: "min-w-[110px]", children: [
        saving ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin mr-1.5" }) : saved ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-4 w-4 mr-1.5 text-emerald-400" }) : null,
        saved ? "Saved" : "Save Changes"
      ] })
    ] }),
    loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center py-20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-5 h-[calc(100vh-200px)]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-52 shrink-0 rounded-xl border border-border overflow-auto", children: DEPARTMENTS.map((dept, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setSelectedDept(dept), className: `w-full text-left px-3.5 py-2.5 text-sm transition ${i < DEPARTMENTS.length - 1 ? "border-b border-border" : ""} ${selectedDept === dept ? "bg-primary/15 text-primary font-medium" : "hover:bg-muted/50 text-foreground/80"}`, children: dept }, dept)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 rounded-xl border border-border overflow-auto", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4 bg-muted/40 border-b border-border px-5 py-3 sticky top-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground", children: "Module" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center", children: "View" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center", children: "Create" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center", children: "Edit" })
        ] }),
        MODULES.map((mod, i) => {
          const perm = getPerm(selectedDept, mod);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `grid grid-cols-4 gap-4 items-center px-5 py-3.5 border-b border-border last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium", children: mod }),
            ["can_view", "can_create", "can_edit"].map((field) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => toggle(selectedDept, mod, field), className: `h-5 w-5 rounded border transition-all ${perm[field] ? "bg-primary border-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`, "aria-label": `${field} for ${mod}`, children: perm[field] && /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 12 12", fill: "none", className: "h-full w-full p-0.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2 6l3 3 5-5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }) }) }, field))
          ] }, mod);
        })
      ] })
    ] })
  ] });
}
const INTEGRATIONS = [{
  name: "SharePoint",
  key: "sharepoint",
  logo: "📁",
  fields: [{
    key: "tenant_url",
    label: "Tenant URL",
    placeholder: "https://jlsyachts.sharepoint.com"
  }, {
    key: "site_url",
    label: "Site URL",
    placeholder: "/sites/PortOperationsandAgency"
  }, {
    key: "tenant_id",
    label: "Tenant ID",
    placeholder: "Azure AD Tenant GUID (from portal.azure.com)"
  }, {
    key: "client_id",
    label: "Client ID",
    placeholder: "Azure App Registration Client ID"
  }, {
    key: "client_secret",
    label: "Client Secret",
    type: "password",
    placeholder: "••••••••"
  }]
}, {
  name: "Monday.com",
  key: "monday",
  logo: "📋",
  fields: [{
    key: "api_token",
    label: "API Token",
    type: "password",
    placeholder: "••••••••"
  }, {
    key: "board_id",
    label: "Board ID",
    placeholder: "e.g. 1234567890"
  }, {
    key: "workspace_id",
    label: "Workspace ID",
    placeholder: "e.g. 987654"
  }]
}];
function IntegrationsPanel() {
  const [settings, setSettings] = reactExports.useState({});
  const [saving, setSaving] = reactExports.useState(null);
  const [saved, setSaved] = reactExports.useState(null);
  reactExports.useEffect(() => {
    supabase.from("integration_settings").select("integration_name, enabled, config").then(({
      data
    }) => {
      if (!data) return;
      const map = {};
      for (const row of data) {
        map[row.integration_name] = row;
      }
      setSettings(map);
    });
  }, []);
  function getSetting(key) {
    return settings[key] ?? {
      integration_name: key,
      enabled: false,
      config: {}
    };
  }
  function updateField(key, field, value) {
    setSettings((prev) => {
      const cur = prev[key] ?? {
        integration_name: key,
        enabled: false,
        config: {}
      };
      return {
        ...prev,
        [key]: {
          ...cur,
          config: {
            ...cur.config,
            [field]: value
          }
        }
      };
    });
  }
  function toggleEnabled(key) {
    setSettings((prev) => {
      const cur = prev[key] ?? {
        integration_name: key,
        enabled: false,
        config: {}
      };
      return {
        ...prev,
        [key]: {
          ...cur,
          enabled: !cur.enabled
        }
      };
    });
  }
  async function handleSave(key) {
    const s = getSetting(key);
    setSaving(key);
    const {
      error
    } = await supabase.from("integration_settings").upsert({
      integration_name: s.integration_name,
      enabled: s.enabled,
      config: s.config
    }, {
      onConflict: "integration_name"
    });
    setSaving(null);
    if (error) {
      alert(error.message);
      return;
    }
    setSaved(key);
    setTimeout(() => setSaved(null), 2e3);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 max-w-2xl space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-semibold", children: "Integrations" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground mt-0.5", children: "Connect third-party services" })
    ] }),
    INTEGRATIONS.map(({
      name,
      key,
      logo,
      fields
    }) => {
      const s = getSetting(key);
      const isSaving = saving === key;
      const isSaved = saved === key;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-border overflow-hidden", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-5 py-4 bg-muted/30 border-b border-border", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-2xl", children: logo }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold text-sm", children: name }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: s.enabled ? "Connected" : "Not connected" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => toggleEnabled(key), className: `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${s.enabled ? "bg-primary" : "bg-muted-foreground/30"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${s.enabled ? "translate-x-6" : "translate-x-1"}` }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5 space-y-3", children: [
          fields.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-[140px_1fr] items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-right text-xs", children: f.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: f.type ?? "text", placeholder: f.placeholder, value: s.config[f.key] ?? "", onChange: (e) => updateField(key, f.key, e.target.value), className: "h-8 text-sm" })
          ] }, f.key)),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end pt-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", onClick: () => handleSave(key), disabled: isSaving, className: "min-w-[80px]", children: isSaving ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : isSaved ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-4 w-4 mr-1.5" }),
            "Saved"
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4 mr-1.5" }),
            "Save"
          ] }) }) }),
          key === "sharepoint" && /* @__PURE__ */ jsxRuntimeExports.jsx(SharePointSyncSection, {})
        ] })
      ] }, key);
    })
  ] });
}
const PERMIT_TYPE_OPTIONS = [{
  value: "__all",
  label: "All permit types"
}, {
  value: "sanitation",
  label: "Sanitation"
}, {
  value: "exit_entry",
  label: "Exit & Entry"
}, {
  value: "gate_pass",
  label: "Gate Pass"
}, {
  value: "cruising_mothership",
  label: "Cruising — Mothership"
}, {
  value: "cruising_tenders",
  label: "Cruising — Tenders"
}, {
  value: "navigation_license",
  label: "Navigation License"
}, {
  value: "tdra",
  label: "TDRA"
}, {
  value: "dma",
  label: "DMA Permits"
}, {
  value: "permit_to_work",
  label: "Permit to Work"
}, {
  value: "boat_registration_update",
  label: "Boat Registration Update"
}];
const BOAT_REG_TABLE_HTML = `<table style="border:1px solid #b3adad;padding:8px;border-collapse:collapse;width:100%"><thead><tr><th style="border:1px solid #b3adad;padding:8px;background:#153d63;color:#fff">Phase</th><th style="border:1px solid #b3adad;padding:8px;background:#153d63;color:#fff">Status</th><th style="border:1px solid #b3adad;padding:8px;background:#153d63;color:#fff">Remarks</th></tr></thead><tbody><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Phase 1: Application</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Quotation</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Log-in Creation</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td colspan="3" style="border:1px solid #b3adad;padding:4px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Phase 2: Documents</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Collection</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Submission</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Approval</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td colspan="3" style="border:1px solid #b3adad;padding:4px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Phase 3: Technical Inspection</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Booking the inspection</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Inspection result</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td colspan="3" style="border:1px solid #b3adad;padding:4px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Phase 4: License &amp; Payment</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Marine Craft License</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Invoicing</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr></tbody></table>`;
const DEFAULT_TEMPLATES = [{
  name: "Permit to Work",
  permit_type: "permit_to_work",
  subject: "{{boat_name}} - Permit to Work",
  body: `Dear {{holder_name}},

Greetings from JLS Yachts!
Please find the attached approved Permit to Work.

Yacht Name: {{boat_name}}
Permit Duration: {{expiry_date}}
Type of Permit: {{authority}}
Work Description: {{notes}}
Permit No.: {{permit_number}}
Expiry date: {{expiry_date}}

Best Regards,
JLS Yachts Team`
}, {
  name: "Boat Registration Update",
  permit_type: "boat_registration_update",
  subject: "{{boat_name}} - Boat Registration Update",
  body: `Dear {{holder_name}},

Greetings from JLS Yachts!
Please find below the current status of your boat registration.

Yacht Name: {{boat_name}}
Quotation No.: {{quotation_number}}

` + BOAT_REG_TABLE_HTML + `

For any queries please do not hesitate to contact us.

Best Regards,
JLS Yachts Team`
}];
const MERGE_TAGS = ["{{boat_name}}", "{{holder_name}}", "{{expiry_date}}", "{{issue_date}}", "{{authority}}", "{{permit_number}}", "{{quotation_number}}", "{{preferred_inspection_date}}"];
function EmailTemplatesPanel() {
  const [templates, setTemplates] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [editing, setEditing] = reactExports.useState(null);
  const [saving, setSaving] = reactExports.useState(false);
  const loadTemplates = reactExports.useCallback(async () => {
    setLoading(true);
    const {
      data
    } = await supabase.from("email_templates").select("*").order("name");
    setTemplates(data ?? []);
    setLoading(false);
  }, []);
  reactExports.useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);
  function startNew() {
    setEditing({
      name: "",
      permit_type: null,
      subject: "",
      body: ""
    });
  }
  async function seedDefaults() {
    for (const tpl of DEFAULT_TEMPLATES) {
      const existing = templates.find((t) => t.name === tpl.name);
      if (!existing) {
        await supabase.from("email_templates").insert([tpl]);
      }
    }
    await loadTemplates();
    toast.success("Default templates added");
  }
  function startEdit(t) {
    setEditing({
      ...t
    });
  }
  async function handleDelete(id) {
    if (!confirm("Delete this template?")) return;
    await supabase.from("email_templates").delete().eq("id", id);
    await loadTemplates();
  }
  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    const payload = {
      name: editing.name,
      permit_type: editing.permit_type === "__all" ? null : editing.permit_type ?? null,
      subject: editing.subject,
      body: editing.body
    };
    if (editing.id) {
      await supabase.from("email_templates").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("email_templates").insert([payload]);
    }
    setSaving(false);
    setEditing(null);
    await loadTemplates();
  }
  const permitLabel = (type) => PERMIT_TYPE_OPTIONS.find((o) => o.value === (type ?? "__all"))?.label ?? type ?? "All";
  if (editing !== null) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 max-w-3xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setEditing(null), className: "text-muted-foreground hover:text-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-5 w-5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "text-xl font-semibold", children: [
          editing.id ? "Edit" : "New",
          " Template"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Template Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: editing.name ?? "", onChange: (e) => setEditing((prev) => ({
              ...prev,
              name: e.target.value
            })), placeholder: "e.g. Sanitation Pass" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Permit Type" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: editing.permit_type ?? "__all", onValueChange: (v) => setEditing((prev) => ({
              ...prev,
              permit_type: v
            })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: PERMIT_TYPE_OPTIONS.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: o.value, children: o.label }, o.value)) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Subject" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: editing.subject ?? "", onChange: (e) => setEditing((prev) => ({
            ...prev,
            subject: e.target.value
          })), placeholder: "e.g. Sanitation Certificate — {{boat_name}}" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Body" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { rows: 10, value: editing.body ?? "", onChange: (e) => setEditing((prev) => ({
            ...prev,
            body: e.target.value
          })), placeholder: "Dear {{holder_name}},\n\nYour sanitation certificate is attached...", className: "font-mono text-sm" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg bg-muted/40 border border-border p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-muted-foreground mb-2", children: "Available merge tags" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5", children: MERGE_TAGS.map((tag) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setEditing((prev) => ({
            ...prev,
            body: (prev?.body ?? "") + tag
          })), className: "rounded bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs text-primary font-mono hover:bg-primary/20 transition", children: tag }, tag)) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-muted-foreground mt-1.5", children: "Click a tag to insert it at the end of the body." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => setEditing(null), children: "Cancel" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: handleSave, disabled: saving || !editing.name?.trim(), className: "gap-1.5", children: [
            saving ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
            "Save Template"
          ] })
        ] })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-semibold", children: "Email Templates" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground mt-0.5", children: "Templates used when emailing permits. Use merge tags to personalise content." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", variant: "outline", onClick: seedDefaults, className: "gap-1.5", children: "Seed Defaults" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: startNew, className: "gap-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
          " New Template"
        ] })
      ] })
    ] }),
    loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center py-16", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }) : templates.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Mail, { className: "h-10 w-10 text-muted-foreground/50 mb-3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-medium", children: "No templates yet" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground mt-1", children: "Create a template to customise emails sent with permits." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: startNew, className: "mt-4 gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
        " New Template"
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-xl border border-border overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border bg-muted/40", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium text-muted-foreground", children: "Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium text-muted-foreground", children: "Permit Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium text-muted-foreground", children: "Subject" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 w-20" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border", children: templates.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 font-medium", children: t.name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground", children: permitLabel(t.permit_type) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground truncate max-w-xs", children: t.subject }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-1 justify-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", className: "h-7 w-7 p-0", onClick: () => startEdit(t), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", className: "h-7 w-7 p-0 text-destructive hover:text-destructive", onClick: () => handleDelete(t.id), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }) })
        ] }) })
      ] }, t.id)) })
    ] }) })
  ] });
}
const YACHT_DB_FIELDS = [{
  value: "",
  label: "— Skip —"
}, {
  value: "vessel_name",
  label: "Vessel Name"
}, {
  value: "vessel_type",
  label: "Vessel Type"
}, {
  value: "flag",
  label: "Flag"
}, {
  value: "imo_no",
  label: "IMO No."
}, {
  value: "official_no",
  label: "Official No."
}, {
  value: "port_of_registry",
  label: "Port of Registry"
}, {
  value: "built_year",
  label: "Built Year"
}, {
  value: "builders_name",
  label: "Builders Name"
}, {
  value: "built_place",
  label: "Built Place"
}, {
  value: "gross_tonnage",
  label: "Gross Tonnage"
}, {
  value: "net_tonnage",
  label: "Net Tonnage"
}, {
  value: "length_overall_m",
  label: "LOA (m)"
}, {
  value: "breadth_m",
  label: "Breadth (m)"
}, {
  value: "draught_m",
  label: "Draught (m)"
}, {
  value: "mmsi",
  label: "MMSI"
}, {
  value: "radio_call_sign",
  label: "Radio Call Sign"
}, {
  value: "owners_name",
  label: "Owner Name"
}, {
  value: "owners_nationality",
  label: "Owner Nationality"
}, {
  value: "company_name",
  label: "Company"
}, {
  value: "email_address",
  label: "Email"
}, {
  value: "contact_no",
  label: "Contact No."
}, {
  value: "berth",
  label: "Berth"
}, {
  value: "status",
  label: "Status"
}];
function autoSuggest(displayName) {
  const n = displayName.toLowerCase().replace(/[\s._\-()+#]/g, "");
  const map = {
    title: "vessel_name",
    vesselname: "vessel_name",
    vesseltype: "vessel_type",
    flag: "flag",
    imono: "imo_no",
    imonumber: "imo_no",
    imo: "imo_no",
    officialno: "official_no",
    officialnumber: "official_no",
    portofregistry: "port_of_registry",
    registry: "port_of_registry",
    builtyear: "built_year",
    yearbuilt: "built_year",
    buildersname: "builders_name",
    builder: "builders_name",
    builtplace: "built_place",
    grosstonnage: "gross_tonnage",
    gt: "gross_tonnage",
    nettonnage: "net_tonnage",
    nt: "net_tonnage",
    loa: "length_overall_m",
    lengthoverall: "length_overall_m",
    lengthoveral: "length_overall_m",
    lengthoverallinmeters: "length_overall_m",
    breadth: "breadth_m",
    beam: "breadth_m",
    breadthinmeters: "breadth_m",
    draught: "draught_m",
    draft: "draught_m",
    draughtinmeters: "draught_m",
    draftinmeters: "draught_m",
    airdraft: "air_draft_m",
    airdraftinmeters: "air_draft_m",
    airdraftm: "air_draft_m",
    mmsi: "mmsi",
    radiocallsign: "radio_call_sign",
    callsign: "radio_call_sign",
    ownersname: "owners_name",
    ownername: "owners_name",
    owner: "owners_name",
    ownersnationality: "owners_nationality",
    companyname: "company_name",
    company: "company_name",
    emailaddress: "email_address",
    email: "email_address",
    contactno: "contact_no",
    phone: "contact_no",
    contactnumber: "contact_no",
    berth: "berth",
    status: "status",
    maxcrew: "max_crew",
    crew: "max_crew",
    maxguests: "max_guests",
    guests: "max_guests",
    engine: "engine",
    enginetype: "engine",
    vesselimage: "vessel_image",
    image: "vessel_image",
    photo: "vessel_image",
    picture: "vessel_image",
    vesselphoto: "vessel_image"
  };
  return map[n] ?? "";
}
function SharePointSyncSection() {
  const [listName, setListName] = reactExports.useState("Yachts");
  const [columns, setColumns] = reactExports.useState([]);
  const [mapping, setMapping] = reactExports.useState({});
  const [discovering, setDiscovering] = reactExports.useState(false);
  const [syncing, setSyncing] = reactExports.useState(false);
  const [result, setResult] = reactExports.useState(null);
  const [syncErr, setSyncErr] = reactExports.useState(null);
  const [webhook, setWebhook] = reactExports.useState(null);
  const [webhookBusy, setWebhookBusy] = reactExports.useState(false);
  const [webhookErr, setWebhookErr] = reactExports.useState(null);
  reactExports.useEffect(() => {
    doGetWebhookStatus().then(setWebhook).catch(() => {
    });
  }, []);
  async function handleDiscover() {
    setDiscovering(true);
    setSyncErr(null);
    setResult(null);
    try {
      const cols = await doDiscoverSharePointColumns({
        data: {
          listName
        }
      });
      setColumns(cols);
      const auto = {};
      for (const c of cols) auto[c.name] = autoSuggest(c.displayName);
      setMapping(auto);
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }
  async function handleSync() {
    setSyncing(true);
    setSyncErr(null);
    setResult(null);
    try {
      const res = await doSyncSharePoint({
        data: {
          listName,
          fieldMapping: mapping
        }
      });
      setResult(res);
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }
  async function handleRegisterWebhook() {
    setWebhookBusy(true);
    setWebhookErr(null);
    try {
      const appUrl = window.location.origin;
      const res = await doRegisterWebhook({
        data: {
          appUrl
        }
      });
      setWebhook({
        subscriptionId: res.subscriptionId,
        expiresAt: res.expiresAt,
        daysLeft: Math.round((new Date(res.expiresAt).getTime() - Date.now()) / 864e5)
      });
    } catch (e) {
      setWebhookErr(e instanceof Error ? e.message : "Webhook registration failed");
    } finally {
      setWebhookBusy(false);
    }
  }
  async function handleRenewWebhook() {
    setWebhookBusy(true);
    setWebhookErr(null);
    try {
      const newExpiry = await doRenewWebhook();
      setWebhook((prev) => prev ? {
        ...prev,
        expiresAt: newExpiry,
        daysLeft: Math.round((new Date(newExpiry).getTime() - Date.now()) / 864e5)
      } : null);
    } catch (e) {
      setWebhookErr(e instanceof Error ? e.message : "Renewal failed");
    } finally {
      setWebhookBusy(false);
    }
  }
  const webhookActive = webhook?.subscriptionId && webhook.daysLeft !== null && webhook.daysLeft > 0;
  const webhookExpiringSoon = webhookActive && (webhook.daysLeft ?? 0) < 30;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border mt-4 pt-4 space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border bg-muted/20 p-3 space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold", children: "Real-time Webhook (SharePoint → App)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-muted-foreground mt-0.5", children: "SharePoint notifies the app instantly when list items change. Requires a cron fallback for reliability." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          webhookActive && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: handleRenewWebhook, disabled: webhookBusy, className: "gap-1.5 h-7 text-xs", children: [
            webhookBusy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3 w-3 animate-spin" }) : null,
            "Renew"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: webhookActive ? "ghost" : "default", onClick: handleRegisterWebhook, disabled: webhookBusy, className: "gap-1.5 h-7 text-xs", children: [
            webhookBusy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3 w-3 animate-spin" }) : null,
            webhookActive ? "Re-register" : "Register Webhook"
          ] })
        ] })
      ] }),
      webhookErr && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-destructive", children: webhookErr }),
      webhook !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${webhookActive ? webhookExpiringSoon ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `h-1.5 w-1.5 rounded-full ${webhookActive ? webhookExpiringSoon ? "bg-amber-400" : "bg-emerald-400" : "bg-muted-foreground"}` }),
        webhookActive ? `Active · expires in ${webhook.daysLeft}d` : webhook?.subscriptionId ? "Expired — re-register" : "Not registered"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-muted-foreground", children: "Cron fallback runs every 15 min automatically — no action needed." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: "Field Mapping & Full Sync" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: listName, onChange: (e) => setListName(e.target.value), placeholder: "List name", className: "h-8 w-32 text-sm" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: handleDiscover, disabled: discovering, className: "gap-1.5 h-8", children: [
          discovering ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "h-3.5 w-3.5" }),
          "Load Columns"
        ] })
      ] })
    ] }),
    syncErr && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive", children: syncErr }),
    result && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400", children: [
      "Sync complete — ",
      result.synced,
      " records synced, ",
      result.errors,
      " errors (of ",
      result.total,
      " total rows). Field mapping saved — auto-sync will use it going forward."
    ] }),
    columns.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border overflow-hidden text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-[1fr_20px_1fr] gap-2 bg-muted/40 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "SharePoint Column" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "App Field" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "divide-y divide-border max-h-72 overflow-auto", children: columns.map((col) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-[1fr_20px_1fr] gap-2 items-center px-3 py-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium text-xs", children: col.displayName }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-muted-foreground font-mono", children: col.name })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-center text-muted-foreground text-xs", children: "→" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("select", { value: mapping[col.name] ?? "", onChange: (e) => setMapping((prev) => ({
            ...prev,
            [col.name]: e.target.value
          })), className: "w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring", children: YACHT_DB_FIELDS.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: f.value, children: f.label }, f.value)) })
        ] }, col.name)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: handleSync, disabled: syncing, className: "gap-1.5", children: [
        syncing ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
        syncing ? "Syncing…" : "Sync Now"
      ] }) })
    ] }) : !discovering && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-muted-foreground", children: [
      "Click ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Load Columns" }),
      " to fetch the SharePoint list columns, review the auto-suggested field mapping, then click ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Sync Now" }),
      ". The mapping is saved and used for all future auto-syncs."
    ] })
  ] });
}
export {
  SettingsPage as component
};
