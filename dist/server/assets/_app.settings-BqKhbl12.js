import { c as createServerRpc } from "./createServerRpc-Dfg1dEJf.js";
import { a0 as createServerFn, a1 as supabaseAdmin, a2 as getGraphToken, a3 as resolveSpSite, a4 as saveSpConfigPatch, a5 as syncFromSharePoint, a6 as registerSharePointWebhook, a7 as renewSharePointWebhook } from "./worker-entry-DhepChOA.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const getUsers_createServerFn_handler = createServerRpc({
  id: "b598a33c9588455ecb3ce12296e7a5c891fe206829c4e50f91d7f973eb56986e",
  name: "getUsers",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => getUsers.__executeServer(opts));
const getUsers = createServerFn({
  method: "GET"
}).handler(getUsers_createServerFn_handler, async () => {
  const [{
    data: auth,
    error
  }, {
    data: roles
  }, {
    data: profiles
  }] = await Promise.all([supabaseAdmin.auth.admin.listUsers({
    perPage: 1e3
  }), supabaseAdmin.from("user_roles").select("user_id, role"), supabaseAdmin.from("profiles").select("id, display_name")]);
  if (error) throw new Error(error.message);
  return (auth?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    displayName: profiles?.find((p) => p.id === u.id)?.display_name ?? null,
    role: roles?.find((r) => r.user_id === u.id)?.role ?? "user",
    mfaEnabled: (u.factors?.length ?? 0) > 0,
    invited: !u.last_sign_in_at,
    lastSignIn: u.last_sign_in_at ?? null,
    createdAt: u.created_at,
    factorIds: (u.factors ?? []).map((f) => f.id)
  }));
});
const doInviteUser_createServerFn_handler = createServerRpc({
  id: "6a9d2e8c8729ad8ff41a489aa7233b11fe593f113142ce1fee975a0be08937ff",
  name: "doInviteUser",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => doInviteUser.__executeServer(opts));
const doInviteUser = createServerFn({
  method: "POST"
}).handler(doInviteUser_createServerFn_handler, async (ctx) => {
  const {
    error
  } = await supabaseAdmin.auth.admin.inviteUserByEmail(ctx.data.email);
  if (error) throw new Error(error.message);
});
const doResetPassword_createServerFn_handler = createServerRpc({
  id: "6c208b1a0af90def6c360d75213094e233a0acba8750722d51b036f0eac5065f",
  name: "doResetPassword",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => doResetPassword.__executeServer(opts));
const doResetPassword = createServerFn({
  method: "POST"
}).handler(doResetPassword_createServerFn_handler, async (ctx) => {
  const {
    error
  } = await supabaseAdmin.auth.resetPasswordForEmail(ctx.data.email);
  if (error) throw new Error(error.message);
});
const doSetRole_createServerFn_handler = createServerRpc({
  id: "7d3f8f88b53cd2506f7c5866f316758f2c377a07d722fe7a2b6516b1c617a55d",
  name: "doSetRole",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => doSetRole.__executeServer(opts));
const doSetRole = createServerFn({
  method: "POST"
}).handler(doSetRole_createServerFn_handler, async (ctx) => {
  const {
    userId,
    role
  } = ctx.data;
  const {
    data: existing
  } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).maybeSingle();
  const {
    error
  } = existing ? await supabaseAdmin.from("user_roles").update({
    role
  }).eq("user_id", userId) : await supabaseAdmin.from("user_roles").insert({
    user_id: userId,
    role
  });
  if (error) throw new Error(error.message);
});
const doDeleteUser_createServerFn_handler = createServerRpc({
  id: "91856ceb22fa4c8613b5acd90038f7450b87d64c67af55f7bce83c056854771e",
  name: "doDeleteUser",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => doDeleteUser.__executeServer(opts));
const doDeleteUser = createServerFn({
  method: "POST"
}).handler(doDeleteUser_createServerFn_handler, async (ctx) => {
  const {
    error
  } = await supabaseAdmin.auth.admin.deleteUser(ctx.data.userId);
  if (error) throw new Error(error.message);
});
const doDisableMFA_createServerFn_handler = createServerRpc({
  id: "08425488a94a11a3ec1360d716ac0a92d95a2cb2e9ce4dbb05151838b1b49938",
  name: "doDisableMFA",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => doDisableMFA.__executeServer(opts));
const doDisableMFA = createServerFn({
  method: "POST"
}).handler(doDisableMFA_createServerFn_handler, async (ctx) => {
  const {
    userId,
    factorIds
  } = ctx.data;
  for (const factorId of factorIds) {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}/factors/${factorId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
      }
    });
    if (!res.ok) throw new Error(`Failed to remove MFA factor: ${res.statusText}`);
  }
});
const getPerms_createServerFn_handler = createServerRpc({
  id: "750747dffb0e4eff5ebce8c6a9392f223b636914fdc37b24cec906cbbfb7086e",
  name: "getPerms",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => getPerms.__executeServer(opts));
const getPerms = createServerFn({
  method: "GET"
}).handler(getPerms_createServerFn_handler, async () => {
  const {
    data
  } = await supabaseAdmin.from("department_permissions").select("department, module, can_view, can_create, can_edit");
  return data ?? [];
});
const savePerms_createServerFn_handler = createServerRpc({
  id: "0bcd254e48f20498683455aafab754c4b8994a69e3d9214ee0b7c4ee231d7c81",
  name: "savePerms",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => savePerms.__executeServer(opts));
const savePerms = createServerFn({
  method: "POST"
}).handler(savePerms_createServerFn_handler, async (ctx) => {
  const {
    error
  } = await supabaseAdmin.from("department_permissions").upsert(ctx.data, {
    onConflict: "department,module"
  });
  if (error) throw new Error(error.message);
});
const doDiscoverSharePointColumns_createServerFn_handler = createServerRpc({
  id: "07225f0bd05122fdd3c1e65c3b8a0ce5e261315493c371cc0e4777ca4edfd3e7",
  name: "doDiscoverSharePointColumns",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => doDiscoverSharePointColumns.__executeServer(opts));
const doDiscoverSharePointColumns = createServerFn({
  method: "POST"
}).handler(doDiscoverSharePointColumns_createServerFn_handler, async (ctx) => {
  const {
    data: row
  } = await supabaseAdmin.from("integration_settings").select("config").eq("integration_name", "sharepoint").maybeSingle();
  const cfg = row?.config ?? {};
  const {
    tenant_id,
    client_id,
    client_secret,
    tenant_url,
    site_url
  } = cfg;
  if (!tenant_id || !client_id || !client_secret || !tenant_url || !site_url) {
    throw new Error("Complete the SharePoint credentials first (Tenant ID, Client ID, Secret, URLs).");
  }
  const token = await getGraphToken(tenant_id, client_id, client_secret);
  const siteId = await resolveSpSite(token, tenant_url, site_url);
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${ctx.data.listName}/columns`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = await res.json();
  if (!data.value) throw new Error(`Could not read list columns: ${data.error?.message ?? "List not found"}`);
  return data.value.filter((c) => !c.readOnly && c.name !== "id").map((c) => ({
    name: c.name,
    displayName: c.displayName
  }));
});
const doSyncSharePoint_createServerFn_handler = createServerRpc({
  id: "5def584ad8cd342e9ac57d676716005d1e7dd545c8c7c727ed9d14e14651fd23",
  name: "doSyncSharePoint",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => doSyncSharePoint.__executeServer(opts));
const doSyncSharePoint = createServerFn({
  method: "POST"
}).handler(doSyncSharePoint_createServerFn_handler, async (ctx) => {
  await saveSpConfigPatch({
    list_name: ctx.data.listName,
    field_mapping: ctx.data.fieldMapping,
    // Reset delta token so this full sync acts as a fresh baseline
    delta_token: null
  });
  const {
    synced,
    errors
  } = await syncFromSharePoint();
  return {
    synced,
    errors,
    total: synced + errors
  };
});
const doRegisterWebhook_createServerFn_handler = createServerRpc({
  id: "41df536649888d975408b3ca854c66fd314108230f3b95a7ed8aeb2ba9dda1cd",
  name: "doRegisterWebhook",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => doRegisterWebhook.__executeServer(opts));
const doRegisterWebhook = createServerFn({
  method: "POST"
}).handler(doRegisterWebhook_createServerFn_handler, async (ctx) => {
  const notificationUrl = `${ctx.data.appUrl.replace(/\/$/, "")}/sp-hook`;
  return registerSharePointWebhook(notificationUrl);
});
const doRenewWebhook_createServerFn_handler = createServerRpc({
  id: "2368c564a41affb19c618b9bddb68f8da7deb02f5f08f7420da4ab8f5d9491e2",
  name: "doRenewWebhook",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => doRenewWebhook.__executeServer(opts));
const doRenewWebhook = createServerFn({
  method: "POST"
}).handler(doRenewWebhook_createServerFn_handler, async () => {
  return renewSharePointWebhook();
});
const doGetWebhookStatus_createServerFn_handler = createServerRpc({
  id: "86db7fabc9fc3c1b901535e398c233ae9ab26e1a4a0dc520b370af5cf597f50c",
  name: "doGetWebhookStatus",
  filename: "src/routes/_app.settings.tsx"
}, (opts) => doGetWebhookStatus.__executeServer(opts));
const doGetWebhookStatus = createServerFn({
  method: "GET"
}).handler(doGetWebhookStatus_createServerFn_handler, async () => {
  const {
    data: row
  } = await supabaseAdmin.from("integration_settings").select("config").eq("integration_name", "sharepoint").maybeSingle();
  const cfg = row?.config ?? {};
  const subId = cfg.webhook_subscription_id ?? null;
  const expiresAt = cfg.webhook_expires_at ?? null;
  let daysLeft = null;
  if (expiresAt) {
    daysLeft = Math.round((new Date(expiresAt).getTime() - Date.now()) / 864e5);
  }
  return {
    subscriptionId: subId,
    expiresAt,
    daysLeft
  };
});
export {
  doDeleteUser_createServerFn_handler,
  doDisableMFA_createServerFn_handler,
  doDiscoverSharePointColumns_createServerFn_handler,
  doGetWebhookStatus_createServerFn_handler,
  doInviteUser_createServerFn_handler,
  doRegisterWebhook_createServerFn_handler,
  doRenewWebhook_createServerFn_handler,
  doResetPassword_createServerFn_handler,
  doSetRole_createServerFn_handler,
  doSyncSharePoint_createServerFn_handler,
  getPerms_createServerFn_handler,
  getUsers_createServerFn_handler,
  savePerms_createServerFn_handler
};
