import { r as reactExports, U as jsxRuntimeExports, a2 as createServerFn } from "./worker-entry-BhSB73Oa.js";
import { s as supabase, c as createSsrRpc, r as reactDomExports, t as toast } from "./router-DtI2KWt0.js";
import { B as Button } from "./button-DOuRXxl4.js";
import { I as Input } from "./input-tSns-MFM.js";
import { L as Label } from "./label-Ds3qDWN_.js";
import { T as Textarea } from "./textarea-DR2LoV9d.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./select-tXTXPZMs.js";
import { A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-C7GSg9K8.js";
import { U as Users } from "./users-BaWC8y9B.js";
import { c as createLucideIcon } from "./createLucideIcon-DhyYiX_6.js";
import { M as Mail } from "./mail-CGLCq0Wu.js";
import { P as Plus } from "./plus-CfTJ2ZaO.js";
import { L as LoaderCircle } from "./loader-circle-w1KYOQxo.js";
import { C as CircleCheck } from "./circle-check-7tBlyRXp.js";
import { S as Save } from "./save-CnHDMh2H.js";
import { X } from "./x-DFtrhGVJ.js";
import { P as Pencil } from "./index-C-33PlkV.js";
import { T as Trash2 } from "./index-DBkBZibR.js";
import { C as CircleX, R as RotateCcw } from "./rotate-ccw-CP1jVpJD.js";
import { C as ChevronDown } from "./chevron-down-HwTvS_C7.js";
import { S as Search } from "./search-Bc0LlnDZ.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./utils-Bz4m9VPB.js";
import "./Combination-B8MApAKg.js";
import "./index-Br3F6A4M.js";
const __iconNode$2 = [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "1w4ew1" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4", key: "fwvmzm" }]
];
const Lock = createLucideIcon("lock", __iconNode$2);
const __iconNode$1 = [
  ["path", { d: "M12 22v-5", key: "1ega77" }],
  ["path", { d: "M15 8V2", key: "18g5xt" }],
  [
    "path",
    { d: "M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z", key: "1xoxul" }
  ],
  ["path", { d: "M9 8V2", key: "14iosj" }]
];
const Plug = createLucideIcon("plug", __iconNode$1);
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
const doUpdateProfile = createServerFn({
  method: "POST"
}).handler(createSsrRpc("7e6df29da9e1b91876d6bf37eafdc21bc147471ce1396ec890a2024405c14c41"));
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
createServerFn({
  method: "POST"
}).handler(createSsrRpc("5def584ad8cd342e9ac57d676716005d1e7dd545c8c7c727ed9d14e14651fd23"));
const doRegisterWebhook = createServerFn({
  method: "POST"
}).handler(createSsrRpc("41df536649888d975408b3ca854c66fd314108230f3b95a7ed8aeb2ba9dda1cd"));
const doRenewWebhook = createServerFn({
  method: "POST"
}).handler(createSsrRpc("2368c564a41affb19c618b9bddb68f8da7deb02f5f08f7420da4ab8f5d9491e2"));
const doGetSpSyncs = createServerFn({
  method: "GET"
}).handler(createSsrRpc("5b4922fc84c47fc65b18897ea783d6a76a41a68ce5e14c32aae3609057c7a2f7"));
const doSaveSpSync = createServerFn({
  method: "POST"
}).handler(createSsrRpc("4aeec71de219dff2fc3ee14a9cda1d5e07b5e5f336005f4c5f28bc850f8dca75"));
const doDeleteSpSync = createServerFn({
  method: "POST"
}).handler(createSsrRpc("8a9867d86ae6a5fb8bb44b5d97bb762f1e406f9eeb114fe87c085a22ad773638"));
const doSyncById = createServerFn({
  method: "POST"
}).handler(createSsrRpc("7c2148c13e358b569c9bece2a9fdb5d711b9b3e59062970e4038f5aff7cb93c7"));
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
        users.map((user) => /* @__PURE__ */ jsxRuntimeExports.jsx(UserRow, { user, isLoading: actionLoading === "role-" + user.id || actionLoading === "mfa-" + user.id || actionLoading === "del-" + user.id || actionLoading === "reset-" + user.email, onResetPassword: () => handleResetPassword(user.email), onRoleChange: (role) => handleRoleChange(user.id, role), onDisableMFA: () => handleDisableMFA(user), onRemove: () => handleRemove(user), onProfileUpdated: (userId, firstName, lastName) => {
          setUsers((prev) => prev.map((u) => u.id === userId ? {
            ...u,
            firstName,
            lastName,
            displayName: [firstName, lastName].filter(Boolean).join(" ") || u.displayName
          } : u));
        } }, user.id))
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
  onRemove,
  onProfileUpdated
}) {
  const [open, setOpen] = reactExports.useState(false);
  const [pos, setPos] = reactExports.useState({
    top: 0,
    right: 0
  });
  const btnRef = reactExports.useRef(null);
  const [editName, setEditName] = reactExports.useState(false);
  const [nameForm, setNameForm] = reactExports.useState({
    first: user.firstName ?? "",
    last: user.lastName ?? ""
  });
  const [savingName, setSavingName] = reactExports.useState(false);
  const initials = user.firstName && user.lastName ? (user.firstName[0] + user.lastName[0]).toUpperCase() : user.firstName ? user.firstName.slice(0, 2).toUpperCase() : user.email.slice(0, 2).toUpperCase();
  const displayLabel = user.firstName || user.lastName ? [user.firstName, user.lastName].filter(Boolean).join(" ") : user.displayName ?? user.email;
  async function handleSaveName() {
    setSavingName(true);
    try {
      await doUpdateProfile({
        data: {
          userId: user.id,
          firstName: nameForm.first,
          lastName: nameForm.last
        }
      });
      onProfileUpdated(user.id, nameForm.first, nameForm.last);
      setEditName(false);
      toast.success("Name updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update name");
    } finally {
      setSavingName(false);
    }
  }
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    editName && reactDomExports.createPortal(/* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-semibold", children: "Edit Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: user.email })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs", children: "First Name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: nameForm.first, onChange: (e) => setNameForm((f) => ({
            ...f,
            first: e.target.value
          })), onKeyDown: (e) => e.key === "Enter" && handleSaveName(), placeholder: "First", autoFocus: true, className: "h-8 text-sm" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs", children: "Last Name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: nameForm.last, onChange: (e) => setNameForm((f) => ({
            ...f,
            last: e.target.value
          })), onKeyDown: (e) => e.key === "Enter" && handleSaveName(), placeholder: "Last", className: "h-8 text-sm" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "ghost", size: "sm", onClick: () => setEditName(false), disabled: savingName, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-3.5 w-3.5 mr-1" }),
          " Cancel"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: handleSaveName, disabled: savingName, className: "gap-1.5", children: [
          savingName ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-3.5 w-3.5" }),
          "Save"
        ] })
      ] })
    ] }) }), document.body),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary", children: initials }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium truncate", children: displayLabel }),
          (user.firstName || user.lastName || user.displayName) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground truncate", children: user.email })
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
              setEditName(true);
              setNameForm({
                first: user.firstName ?? "",
                last: user.lastName ?? ""
              });
              setOpen(false);
            }, className: "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }),
              " Edit Name"
            ] }),
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
    ] })
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
}, {
  value: "location",
  label: "Location"
}, {
  value: "eta",
  label: "ETA"
}, {
  value: "etd",
  label: "ETD"
}, {
  value: "air_draft_m",
  label: "Air Draft (m)"
}, {
  value: "max_crew",
  label: "Max Crew"
}, {
  value: "max_guests",
  label: "Max Guests"
}, {
  value: "engine",
  label: "Engine"
}];
const PERMIT_DB_FIELDS = [{
  value: "",
  label: "— Skip —"
}, {
  value: "permit_number",
  label: "Permit Number (match)"
}, {
  value: "holder_name",
  label: "Holder / Visitor Name"
}, {
  value: "contact_email",
  label: "Contact Email"
}, {
  value: "issuing_authority",
  label: "Issuing Authority / Zone"
}, {
  value: "issue_date",
  label: "Issue / Entry Date"
}, {
  value: "expiry_date",
  label: "Expiry / Exit Date"
}, {
  value: "status",
  label: "Status"
}, {
  value: "notes",
  label: "Notes / Purpose"
}, {
  value: "jls_quotation_number",
  label: "Quotation Number"
}, {
  value: "dma_phase",
  label: "DMA Phase"
}, {
  value: "license_no",
  label: "License No."
}, {
  value: "requested_by",
  label: "Requested By"
}, {
  value: "preferred_inspection_date",
  label: "Inspection Date"
}, {
  value: "vessel_name",
  label: "Linked Vessel Name"
}];
const SMALL_BOAT_DB_FIELDS = [{
  value: "",
  label: "— Skip —"
}, {
  value: "boat_name",
  label: "Boat Name"
}, {
  value: "boat_type",
  label: "Boat Type"
}, {
  value: "reg_type",
  label: "Registration Type"
}, {
  value: "reg_no",
  label: "Registration No."
}, {
  value: "hull_id",
  label: "Hull ID"
}, {
  value: "color",
  label: "Color"
}, {
  value: "length_m",
  label: "Length (m)"
}, {
  value: "engine_type",
  label: "Engine Type"
}, {
  value: "engine_power_hp",
  label: "Engine Power (HP)"
}, {
  value: "flag",
  label: "Flag"
}, {
  value: "port_of_registry",
  label: "Port of Registry"
}, {
  value: "owner_name",
  label: "Owner Name"
}, {
  value: "owner_nationality",
  label: "Owner Nationality"
}, {
  value: "client_email",
  label: "Client Email"
}, {
  value: "client_phone",
  label: "Client Phone"
}, {
  value: "status",
  label: "Status"
}, {
  value: "registration_expiry",
  label: "Registration Expiry"
}, {
  value: "insurance_expiry",
  label: "Insurance Expiry"
}, {
  value: "notes",
  label: "Notes"
}];
function getFieldSetForList(listName) {
  const n = listName.toLowerCase().trim();
  if (n.includes("tdra") || n.includes("sanitation") || n.includes("gate") || n.includes("cruising") || n.includes("navigation") || n.includes("dma") || n.includes("permit") || n.includes("exit") || n.includes("entry")) {
    return PERMIT_DB_FIELDS;
  }
  if (n.includes("small boat") || n.includes("smallboat") || n.includes("boat reg") || n.includes("boatreg")) {
    return SMALL_BOAT_DB_FIELDS;
  }
  return YACHT_DB_FIELDS;
}
function autoSuggestPermit(displayName) {
  const n = displayName.toLowerCase().replace(/[\s._\-()+#]/g, "");
  const map = {
    title: "holder_name",
    vesselname: "vessel_name",
    yacht: "vessel_name",
    boatname: "vessel_name",
    permitnumber: "permit_number",
    permitno: "permit_number",
    holdername: "holder_name",
    visitorname: "holder_name",
    name: "holder_name",
    email: "contact_email",
    contactemail: "contact_email",
    issuingauthority: "issuing_authority",
    authority: "issuing_authority",
    zone: "issuing_authority",
    accesszone: "issuing_authority",
    issuedate: "issue_date",
    dateapplied: "issue_date",
    startdate: "issue_date",
    entrydate: "issue_date",
    expirydate: "expiry_date",
    expiry: "expiry_date",
    exitdate: "expiry_date",
    enddate: "expiry_date",
    status: "status",
    notes: "notes",
    purpose: "notes",
    remarks: "notes",
    quotation: "jls_quotation_number",
    quotationno: "jls_quotation_number",
    referenceno: "jls_quotation_number",
    phase: "dma_phase",
    dmaphase: "dma_phase",
    licenseno: "license_no",
    licenceno: "license_no",
    requestedby: "requested_by",
    inspectiondate: "preferred_inspection_date",
    preferredinspectiondate: "preferred_inspection_date"
  };
  return map[n] ?? "";
}
function autoSuggestSmallBoat(displayName) {
  const n = displayName.toLowerCase().replace(/[\s._\-()+#]/g, "");
  const map = {
    title: "boat_name",
    boatname: "boat_name",
    name: "boat_name",
    boattype: "boat_type",
    type: "boat_type",
    vesseltype: "boat_type",
    regtype: "reg_type",
    registrationtype: "reg_type",
    regno: "reg_no",
    registrationno: "reg_no",
    hullid: "hull_id",
    hull: "hull_id",
    color: "color",
    colour: "color",
    length: "length_m",
    lengthinmeters: "length_m",
    loa: "length_m",
    enginetype: "engine_type",
    engine: "engine_type",
    enginepower: "engine_power_hp",
    hp: "engine_power_hp",
    flag: "flag",
    portofregistry: "port_of_registry",
    ownername: "owner_name",
    owner: "owner_name",
    ownernationality: "owner_nationality",
    nationality: "owner_nationality",
    email: "client_email",
    contactemail: "client_email",
    phone: "client_phone",
    contactno: "client_phone",
    status: "status",
    registrationexpiry: "registration_expiry",
    regexpiry: "registration_expiry",
    insuranceexpiry: "insurance_expiry",
    notes: "notes",
    remarks: "notes"
  };
  return map[n] ?? "";
}
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
function SyncTargetBadge({
  target
}) {
  const map = {
    yachts: "bg-primary/15 text-primary border-primary/20",
    permits: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    small_boats: "bg-amber-500/15 text-amber-400 border-amber-500/20"
  };
  const label = {
    yachts: "Yachts",
    permits: "Permits",
    small_boats: "Small Boats"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold ${map[target] ?? "bg-muted text-muted-foreground border-border"}`, children: label[target] ?? target });
}
function SyncCard({
  sync,
  onEdit,
  onDelete
}) {
  const [syncing, setSyncing] = reactExports.useState(false);
  const [result, setResult] = reactExports.useState(null);
  const [err, setErr] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (sync.lastSyncSynced !== null || sync.lastSyncErrors !== null) {
      setResult({
        synced: sync.lastSyncSynced ?? 0,
        errors: sync.lastSyncErrors ?? 0
      });
    }
  }, [sync.lastSyncSynced, sync.lastSyncErrors]);
  async function handleSync() {
    setSyncing(true);
    setErr(null);
    setResult(null);
    try {
      const r = await doSyncById({
        data: {
          id: sync.id
        }
      });
      setResult(r);
      toast.success(`Sync complete — ${r.synced} records`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border bg-muted/10 p-3 space-y-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-sm", children: sync.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SyncTargetBadge, { target: sync.syncTarget }),
          !sync.enabled && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-muted-foreground italic", children: "disabled" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono bg-muted/60 rounded px-1", children: sync.listName }),
          sync.lastSyncedAt && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            "· Last sync ",
            new Date(sync.lastSyncedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit"
            })
          ] }),
          !sync.lastSyncedAt && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "· Never synced" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 shrink-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: handleSync, disabled: syncing, className: "h-7 gap-1.5 text-xs px-2.5", children: [
          syncing ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3 w-3 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { className: "h-3 w-3" }),
          syncing ? "Syncing…" : "Sync Now"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", variant: "ghost", onClick: onEdit, className: "h-7 w-7 p-0", title: "Edit mapping", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", variant: "ghost", onClick: onDelete, className: "h-7 w-7 p-0 text-destructive/70 hover:text-destructive", title: "Delete", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }) })
      ] })
    ] }),
    result && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `rounded px-2 py-1 text-[11px] ${result.errors > 0 ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"}`, children: [
      result.synced,
      " synced · ",
      result.errors,
      " errors"
    ] }),
    err && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded px-2 py-1 text-[11px] bg-destructive/10 text-destructive", children: err })
  ] });
}
function SyncEditPanel({
  initial,
  onSaved,
  onCancel
}) {
  const isNew = !initial?.id;
  const [name, setName] = reactExports.useState(initial?.name ?? "");
  const [listName, setListName] = reactExports.useState(initial?.listName ?? "");
  const [syncTarget, setSyncTarget] = reactExports.useState(initial?.syncTarget ?? "yachts");
  const [enabled, setEnabled] = reactExports.useState(initial?.enabled ?? true);
  const [columns, setColumns] = reactExports.useState([]);
  const [mapping, setMapping] = reactExports.useState(initial?.fieldMapping ?? {});
  const [discovering, setDiscovering] = reactExports.useState(false);
  const [saving, setSaving] = reactExports.useState(false);
  const [discoverErr, setDiscoverErr] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const n = listName.toLowerCase().trim();
    if (n.includes("tdra") || n.includes("sanitation") || n.includes("gate") || n.includes("cruising") || n.includes("navigation") || n.includes("dma") || n.includes("permit") || n.includes("exit") || n.includes("entry")) {
      setSyncTarget("permits");
    } else if (n.includes("small boat") || n.includes("smallboat") || n.includes("boat reg") || n.includes("boatreg")) {
      setSyncTarget("small_boats");
    } else {
      setSyncTarget("yachts");
    }
    if (!name && listName) setName(listName);
  }, [listName]);
  function getSuggestFn() {
    if (syncTarget === "permits") return autoSuggestPermit;
    if (syncTarget === "small_boats") return autoSuggestSmallBoat;
    return autoSuggest;
  }
  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverErr(null);
    try {
      const cols = await doDiscoverSharePointColumns({
        data: {
          listName
        }
      });
      setColumns(cols);
      const suggestFn = getSuggestFn();
      const auto = {};
      for (const c of cols) auto[c.name] = suggestFn(c.displayName);
      setMapping(auto);
    } catch (e) {
      setDiscoverErr(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }
  async function handleSave() {
    if (!name.trim() || !listName.trim()) {
      toast.error("Name and List Name are required");
      return;
    }
    setSaving(true);
    try {
      const saved = await doSaveSpSync({
        data: {
          id: initial?.id,
          name: name.trim(),
          listName: listName.trim(),
          syncTarget,
          fieldMapping: mapping,
          enabled
        }
      });
      onSaved(saved);
      toast.success(isNew ? "Sync created" : "Sync updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border mt-4 pt-4 space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onCancel, className: "text-muted-foreground hover:text-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold", children: isNew ? "New Sync" : `Edit — ${initial?.name}` })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs", children: "Display Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: name, onChange: (e) => setName(e.target.value), placeholder: "e.g. Yachts List", className: "h-8 text-sm" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs", children: "SharePoint List Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: listName, onChange: (e) => {
            setListName(e.target.value);
            setColumns([]);
            setMapping({});
          }, placeholder: "e.g. Small Boat Reg", className: "h-8 text-sm flex-1" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: handleDiscover, disabled: discovering || !listName.trim(), className: "h-8 gap-1.5 shrink-0", children: [
            discovering ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "h-3.5 w-3.5" }),
            "Load"
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs", children: "Syncs To" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1.5", children: ["yachts", "permits", "small_boats"].map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setSyncTarget(t), className: `rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${syncTarget === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`, children: t === "yachts" ? "Yachts" : t === "permits" ? "Permits" : "Small Boats" }, t)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs", children: "Enabled" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setEnabled((v) => !v), className: `relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4.5" : "translate-x-0.5"}` }) })
      ] })
    ] }),
    discoverErr && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive", children: discoverErr }),
    columns.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border overflow-hidden text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-[1fr_20px_1fr] gap-2 bg-muted/40 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "SharePoint Column" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          "App Field (",
          syncTarget === "yachts" ? "Yachts" : syncTarget === "permits" ? "Permits" : "Small Boats",
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "divide-y divide-border max-h-64 overflow-auto", children: columns.map((col) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-[1fr_20px_1fr] gap-2 items-center px-3 py-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium text-xs", children: col.displayName }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-muted-foreground font-mono", children: col.name })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-center text-muted-foreground text-xs", children: "→" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("select", { value: mapping[col.name] ?? "", onChange: (e) => setMapping((prev) => ({
          ...prev,
          [col.name]: e.target.value
        })), className: "w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring", children: getFieldSetForList(listName).map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: f.value, children: f.label }, f.value)) })
      ] }, col.name)) })
    ] }),
    columns.length === 0 && !discovering && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-muted-foreground", children: [
      "Enter the SharePoint list name and click ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Load" }),
      " to fetch columns and auto-suggest field mappings."
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "sm", onClick: onCancel, className: "h-7 text-xs", children: "Cancel" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: handleSave, disabled: saving, className: "h-7 gap-1.5 text-xs", children: [
        saving ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-3.5 w-3.5" }),
        isNew ? "Create Sync" : "Save Changes"
      ] })
    ] })
  ] });
}
function SharePointSyncSection() {
  const [syncs, setSyncs] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [editingSync, setEditingSync] = reactExports.useState(null);
  const [isNewSync, setIsNewSync] = reactExports.useState(false);
  const [deleteTargetSync, setDeleteTargetSync] = reactExports.useState(null);
  const [deleting, setDeleting] = reactExports.useState(false);
  const [webhook, setWebhook] = reactExports.useState(null);
  const [webhookBusy, setWebhookBusy] = reactExports.useState(false);
  const [webhookErr, setWebhookErr] = reactExports.useState(null);
  reactExports.useEffect(() => {
    doGetSpSyncs().then(setSyncs).catch(() => {
    }).finally(() => setLoading(false));
  }, []);
  reactExports.useEffect(() => {
    doGetWebhookStatus().then(setWebhook).catch(() => {
    });
  }, []);
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
  async function confirmDeleteSync() {
    if (!deleteTargetSync) return;
    setDeleting(true);
    try {
      await doDeleteSpSync({
        data: {
          id: deleteTargetSync.id
        }
      });
      setSyncs((prev) => prev.filter((s) => s.id !== deleteTargetSync.id));
      toast.success("Sync deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
      setDeleteTargetSync(null);
    }
  }
  const webhookActive = webhook?.subscriptionId && webhook.daysLeft !== null && webhook.daysLeft > 0;
  const webhookExpiringSoon = webhookActive && (webhook.daysLeft ?? 0) < 30;
  if (isNewSync || editingSync !== null) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(SyncEditPanel, { initial: isNewSync ? null : editingSync, onSaved: (saved) => {
      setSyncs((prev) => {
        const idx = prev.findIndex((s) => s.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setEditingSync(null);
      setIsNewSync(false);
    }, onCancel: () => {
      setEditingSync(null);
      setIsNewSync(false);
    } });
  }
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
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: "SharePoint Syncs" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-muted-foreground mt-0.5", children: "Each sync maps one SharePoint list to an app table." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", onClick: () => {
        setEditingSync(null);
        setIsNewSync(true);
      }, className: "gap-1.5 h-7 text-xs", children: "+ Add Sync" })
    ] }),
    loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center py-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : syncs.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-dashed border-border py-8 text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "No syncs configured yet." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-muted-foreground mt-1", children: [
        "Click ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "+ Add Sync" }),
        " to connect a SharePoint list."
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: syncs.map((sync) => /* @__PURE__ */ jsxRuntimeExports.jsx(SyncCard, { sync, onEdit: () => setEditingSync(sync), onDelete: () => setDeleteTargetSync(sync) }, sync.id)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: !!deleteTargetSync, onOpenChange: (open) => {
      if (!open) setDeleteTargetSync(null);
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: "Delete sync?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogDescription, { children: [
          "This will permanently delete the ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: deleteTargetSync?.name }),
          " sync configuration. No data will be removed from the app tables. This cannot be undone."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogCancel, { disabled: deleting, children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogAction, { onClick: confirmDeleteSync, disabled: deleting, className: "bg-destructive text-destructive-foreground hover:bg-destructive/90", children: [
          deleting ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin mr-1" }) : null,
          "Delete"
        ] })
      ] })
    ] }) })
  ] });
}
export {
  SettingsPage as component
};
