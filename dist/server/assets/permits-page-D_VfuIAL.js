import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-BSYsl9bp.js";
import { t as toast, s as supabase, b as PERMIT_STATUSES, u as useAuth, d as daysUntil, P as PERMIT_META, D as DMA_PHASES, e as expiryVariant } from "./router-0WOApg3Q.js";
import { B as Button } from "./button-C_UVuWgo.js";
import { I as Input } from "./input-P0HOiVbI.js";
import { L as Label } from "./label-BMC-gKrJ.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-Bn-V9QVk.js";
import { a as DialogContent, b as DialogHeader, c as DialogTitle, d as DialogFooter, D as Dialog, e as DialogTrigger } from "./dialog-BmHWKtCu.js";
import { A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-CDGXaw4H.js";
import { S as StatusPill } from "./status-pill-SAx7pdeF.js";
import { L as LoaderCircle } from "./loader-circle-DFMxZ2Xk.js";
import { F as FileCheckCorner } from "./file-check-corner-BP0ansuE.js";
import { c as createLucideIcon } from "./createLucideIcon-BzTIKZ77.js";
import { S as Save } from "./save-BtDyljOY.js";
import { M as Mail } from "./mail-CdwNnJ-R.js";
import { X } from "./x-IdPt_vgf.js";
import { c as cn } from "./utils-Bz4m9VPB.js";
import { S as Search } from "./search-BVGrgeeq.js";
import { P as Plus } from "./index-BX6xHXc7.js";
import { C as CircleCheck } from "./circle-check-CBGaRs5N.js";
import { C as Clock } from "./clock-DjyGFOdd.js";
import { T as TriangleAlert } from "./triangle-alert-CGzYAedn.js";
import { d as Pencil } from "./Combination-C8622hQS.js";
import { T as Trash2 } from "./trash-2-Cg3Hw-Hd.js";
const __iconNode$1 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 16v-4", key: "1dtifu" }],
  ["path", { d: "M12 8h.01", key: "e9boi3" }]
];
const Info = createLucideIcon("info", __iconNode$1);
const __iconNode = [
  [
    "path",
    {
      d: "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551",
      key: "1miecu"
    }
  ]
];
const Paperclip = createLucideIcon("paperclip", __iconNode);
const AUTHORITIES$5 = [
  "Dubai Municipality",
  "Dubai Maritime City Authority",
  "Port Rashid",
  "Hamdan Port",
  "Other"
];
function SanitationDialog({ yachts, editing, userId, onSaved }) {
  const [form, setForm] = reactExports.useState(
    () => editing ?? { permit_type: "sanitation", status: "pending" }
  );
  const [busy, setBusy] = reactExports.useState(false);
  const [emailBusy, setEmailBusy] = reactExports.useState(false);
  const [uploading, setUploading] = reactExports.useState(false);
  const [fileName, setFileName] = reactExports.useState(null);
  const fileRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    setForm(editing ?? { permit_type: "sanitation", status: "pending" });
    if (editing?.document_url) {
      const parts = editing.document_url.split("/");
      setFileName(decodeURIComponent(parts[parts.length - 1].split("?")[0]));
    } else {
      setFileName(null);
    }
  }, [editing]);
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function handleFileUpload(file) {
    setUploading(true);
    try {
      const path = `sanitation/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("permit-documents").getPublicUrl(path);
      set("document_url", data.publicUrl);
      setFileName(file.name);
      toast.success("Certificate uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  function buildPayload() {
    return {
      permit_type: "sanitation",
      yacht_id: form.yacht_id ?? null,
      permit_number: form.permit_number || null,
      status: form.status ?? "pending",
      issue_date: form.issue_date || null,
      expiry_date: form.expiry_date || null,
      issuing_authority: form.issuing_authority || null,
      holder_name: form.holder_name || null,
      contact_email: form.contact_email || null,
      preferred_inspection_date: form.preferred_inspection_date || null,
      jls_quotation_number: form.jls_quotation_number || null,
      document_url: form.document_url || null,
      notes: form.notes || null,
      dma_phase: null
    };
  }
  async function doSave() {
    if (!userId) throw new Error("Not authenticated");
    const payload = buildPayload();
    if (editing) {
      const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
      if (error) throw error;
      toast.success("Permit updated");
      return editing.id;
    } else {
      const { data, error } = await supabase.from("permits").insert([{ ...payload, created_by: userId }]).select("id").single();
      if (error) throw error;
      toast.success("Permit created");
      return data.id;
    }
  }
  async function handleSaveOnly(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await doSave();
      onSaved();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleEmailSave() {
    if (!form.contact_email) {
      toast.error("Add an email address first");
      return;
    }
    setEmailBusy(true);
    try {
      await doSave();
      const { data: templates } = await supabase.from("email_templates").select("subject, body").eq("permit_type", "sanitation").limit(1);
      const tmpl = templates?.[0];
      const yachtName = yachts.find((y) => y.id === form.yacht_id)?.vessel_name ?? "";
      const replace = (s) => s.replace(/\{\{boat_name\}\}/g, yachtName).replace(/\{\{holder_name\}\}/g, form.holder_name ?? "").replace(/\{\{expiry_date\}\}/g, form.expiry_date ?? "").replace(/\{\{issue_date\}\}/g, form.issue_date ?? "").replace(/\{\{authority\}\}/g, form.issuing_authority ?? "").replace(/\{\{permit_number\}\}/g, form.permit_number ?? "").replace(
        /\{\{quotation_number\}\}/g,
        form.jls_quotation_number ?? ""
      ).replace(
        /\{\{preferred_inspection_date\}\}/g,
        form.preferred_inspection_date ?? ""
      );
      const subject = tmpl ? replace(tmpl.subject) : `Sanitation Certificate — ${yachtName}`;
      const body = tmpl ? replace(tmpl.body) : `Dear ${form.holder_name ?? "Client"},

Please find your sanitation certificate details below.

Vessel: ${yachtName}
Issue Date: ${form.issue_date ?? "—"}
Expiry Date: ${form.expiry_date ?? "—"}
Authority: ${form.issuing_authority ?? "—"}
Permit/Invoice No: ${form.permit_number ?? "—"}
${form.jls_quotation_number ? `JLS Quotation No: ${form.jls_quotation_number}
` : ""}${form.document_url ? `
Certificate: ${form.document_url}` : ""}

Kind regards,
JLS Yachts`;
      window.open(
        `mailto:${form.contact_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        "_blank"
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setEmailBusy(false);
    }
  }
  const isBusy = busy || emailBusy || uploading;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
      editing ? "Edit" : "New",
      " Sanitation Permit"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSaveOnly, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 grid grid-cols-3 gap-x-4 gap-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Boat Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.yacht_id ?? "__none",
                onValueChange: (v) => set("yacht_id", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select vessel" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Sanitation date applied" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.issue_date ?? "",
                onChange: (e) => set("issue_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Preferred inspection date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.preferred_inspection_date ?? "",
                onChange: (e) => set("preferred_inspection_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.holder_name ?? "",
                onChange: (e) => set("holder_name", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Email" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "email",
                value: form.contact_email ?? "",
                onChange: (e) => set("contact_email", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Authority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.issuing_authority ?? "__none",
                onValueChange: (v) => set("issuing_authority", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Find items" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    AUTHORITIES$5.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: a, children: a }, a))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Invoice No of Authority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.permit_number ?? "",
                onChange: (e) => set("permit_number", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Expiry Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.expiry_date ?? "",
                onChange: (e) => set("expiry_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", {}),
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "JLS Quotation Number" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.jls_quotation_number ?? "",
                onChange: (e) => set("jls_quotation_number", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", {}),
          " "
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-52 shrink-0 flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Sanitation Certificate" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => !isBusy && fileRef.current?.click(),
              className: `flex-1 min-h-[200px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center p-4 transition cursor-pointer ${fileName ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40"}`,
              children: [
                uploading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) : fileName ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(FileCheckCorner, { className: "h-6 w-6 text-primary" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium break-all leading-tight", children: fileName }),
                  form.document_url && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "a",
                    {
                      href: form.document_url,
                      target: "_blank",
                      rel: "noreferrer",
                      onClick: (e) => e.stopPropagation(),
                      className: "text-xs text-muted-foreground underline hover:text-foreground",
                      children: "View"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: (e) => {
                        e.stopPropagation();
                        set("document_url", null);
                        setFileName(null);
                      },
                      className: "text-xs text-destructive/70 hover:text-destructive",
                      children: "Remove"
                    }
                  )
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-6 w-6 text-muted-foreground/60" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "There is nothing attached." }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium", children: "Attach files for Client" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    ref: fileRef,
                    type: "file",
                    accept: ".pdf,.jpg,.jpeg,.png",
                    className: "hidden",
                    onChange: (e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                      e.target.value = "";
                    }
                  }
                )
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 mt-6 pt-4 border-t border-border", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Button,
          {
            type: "submit",
            variant: "outline",
            disabled: isBusy,
            className: "gap-1.5",
            children: [
              busy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
              "Save only"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Button,
          {
            type: "button",
            onClick: handleEmailSave,
            disabled: isBusy,
            className: "gap-1.5",
            children: [
              emailBusy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Mail, { className: "h-4 w-4" }),
              "Email Pass & Save"
            ]
          }
        )
      ] })
    ] })
  ] });
}
const PORT_OPTIONS = [
  "Dubai Marina",
  "Port Rashid",
  "Hamdan Port",
  "Port Zayed",
  "Mina Seyahi",
  "Khalid Port",
  "Fujairah Port",
  "Khor Fakkan",
  "Abu Dhabi",
  "Muscat",
  "Doha",
  "Bahrain",
  "Kuwait",
  "Jeddah"
];
function ExitEntryDialog({
  yachts,
  editing,
  userId,
  onSaved
}) {
  const [busy, setBusy] = reactExports.useState(false);
  const [uploading, setUploading] = reactExports.useState(false);
  const fileRef = reactExports.useRef(null);
  const [form, setForm] = reactExports.useState(
    () => editing ?? { permit_type: "exit_entry", status: "pending", dma_phase: "Exit" }
  );
  reactExports.useEffect(() => {
    setForm(editing ?? { permit_type: "exit_entry", status: "pending", dma_phase: "Exit" });
  }, [editing]);
  const subType = form.dma_phase ?? "Exit";
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `permits/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("permit-documents").getPublicUrl(path);
      set("document_url", publicUrl);
      toast.success("File attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  async function doSave() {
    if (!userId) return;
    setBusy(true);
    try {
      const payload = {
        permit_type: "exit_entry",
        yacht_id: form.yacht_id ?? null,
        permit_number: form.permit_number || null,
        status: form.status ?? "pending",
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        issuing_authority: form.issuing_authority || null,
        holder_name: form.holder_name || null,
        contact_email: form.contact_email || null,
        jls_quotation_number: form.jls_quotation_number || null,
        dma_phase: subType,
        document_url: form.document_url || null,
        notes: form.notes || null
      };
      if (editing) {
        const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Permit updated");
      } else {
        const { data, error } = await supabase.from("permits").insert([{ ...payload, created_by: userId }]).select("id").single();
        if (error) throw error;
        toast.success("Permit created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  const attachmentName = form.document_url ? decodeURIComponent(form.document_url.split("/").pop() ?? "attachment") : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-2xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
      editing ? "Edit" : "New",
      " ",
      subType,
      " Permit"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Boat Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: form.yacht_id ?? "__none",
            onValueChange: (v) => set("yacht_id", v === "__none" ? null : v),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select yacht" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
              ] })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Permit Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: subType, onValueChange: (v) => set("dma_phase", v), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "Exit", children: "Exit" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "Entry", children: "Entry" })
          ] })
        ] })
      ] }),
      subType === "Exit" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Exit Permit Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            type: "date",
            value: form.issue_date ?? "",
            onChange: (e) => set("issue_date", e.target.value)
          }
        )
      ] }),
      subType === "Entry" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Entry Permit Date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              type: "date",
              value: form.issue_date ?? "",
              onChange: (e) => set("issue_date", e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Entry Permit Expiration" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              type: "date",
              value: form.expiry_date ?? "",
              onChange: (e) => set("expiry_date", e.target.value)
            }
          )
        ] })
      ] }),
      subType === "Exit" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Next Port of Call" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: form.issuing_authority ?? "__none",
            onValueChange: (v) => set("issuing_authority", v === "__none" ? null : v),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select port" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— Select —" }),
                PORT_OPTIONS.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p, children: p }, p))
              ] })
            ]
          }
        )
      ] }),
      subType === "Exit" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Next Other Port" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            value: form.notes ?? "",
            onChange: (e) => set("notes", e.target.value),
            placeholder: "If not in list above"
          }
        )
      ] }),
      subType === "Entry" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Entry Port" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: form.issuing_authority ?? "__none",
            onValueChange: (v) => set("issuing_authority", v === "__none" ? null : v),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select port" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— Select —" }),
                PORT_OPTIONS.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p, children: p }, p))
              ] })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Quotation Number" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            value: form.jls_quotation_number ?? "",
            onChange: (e) => set("jls_quotation_number", e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Client Purser Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            value: form.holder_name ?? "",
            onChange: (e) => set("holder_name", e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Email Address" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            type: "email",
            value: form.contact_email ?? "",
            onChange: (e) => set("contact_email", e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: form.status ?? "pending",
            onValueChange: (v) => set("status", v),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: PERMIT_STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.value, children: s.label }, s.value)) })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 sm:col-span-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Attachments for Client" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center space-y-2", children: [
          attachmentName ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-4 w-4 shrink-0 text-muted-foreground" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "a",
                {
                  href: form.document_url ?? "#",
                  target: "_blank",
                  rel: "noopener noreferrer",
                  className: "truncate text-primary hover:underline",
                  children: attachmentName
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => set("document_url", null),
                className: "ml-2 text-muted-foreground hover:text-destructive",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" })
              }
            )
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-muted-foreground", children: [
            "There is ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-warning", children: "nothing" }),
            " attached."
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: fileRef,
              type: "file",
              className: "hidden",
              onChange: handleFileChange
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => fileRef.current?.click(),
              disabled: uploading,
              className: "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition",
              children: [
                uploading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-4 w-4" }),
                uploading ? "Uploading…" : "Attach file"
              ]
            }
          )
        ] })
      ] })
    ] }),
    form.contact_email && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { className: "h-3.5 w-3.5 shrink-0 mt-0.5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "Email notifications are not yet configured. The permit will be saved but",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: form.contact_email }),
        " will not receive an automated email."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogFooter, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Button,
      {
        type: "button",
        disabled: busy,
        onClick: doSave,
        className: "gap-1.5",
        children: [
          busy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
          editing ? "Save Changes" : "Create Permit"
        ]
      }
    ) })
  ] });
}
const AUTHORITIES$4 = [
  "Dubai Municipality",
  "Dubai Maritime City Authority",
  "Port Rashid",
  "Hamdan Port",
  "Other"
];
const EXTENSION_OPTIONS$2 = [
  { value: "Not Applied", label: "Not Applied" },
  { value: "Pending", label: "Pending" },
  { value: "Granted", label: "Granted" },
  { value: "Refused", label: "Refused" }
];
function CruisingTendersDialog({ yachts, editing, userId, onSaved }) {
  const [form, setForm] = reactExports.useState(
    () => editing ?? { permit_type: "cruising_tenders", status: "pending" }
  );
  const [busy, setBusy] = reactExports.useState(false);
  const [emailBusy, setEmailBusy] = reactExports.useState(false);
  const [uploading, setUploading] = reactExports.useState(false);
  const [fileName, setFileName] = reactExports.useState(null);
  const fileRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    setForm(editing ?? { permit_type: "cruising_tenders", status: "pending" });
    if (editing?.document_url) {
      const parts = editing.document_url.split("/");
      setFileName(decodeURIComponent(parts[parts.length - 1].split("?")[0]));
    } else {
      setFileName(null);
    }
  }, [editing]);
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function handleFileUpload(file) {
    setUploading(true);
    try {
      const path = `cruising-tenders/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("permit-documents").getPublicUrl(path);
      set("document_url", data.publicUrl);
      setFileName(file.name);
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  function buildPayload() {
    return {
      permit_type: "cruising_tenders",
      yacht_id: form.yacht_id ?? null,
      // permit_number repurposed as "Applied By"
      permit_number: form.permit_number || null,
      status: form.status ?? "pending",
      // issue_date = Cruising Permit Date Applied
      issue_date: form.issue_date || null,
      // expiry_date = Cruising Permit Duration end date
      expiry_date: form.expiry_date || null,
      issuing_authority: form.issuing_authority || null,
      holder_name: form.holder_name || null,
      contact_email: form.contact_email || null,
      // dma_phase repurposed as "21 Day Extension" status
      dma_phase: form.dma_phase || null,
      // preferred_inspection_date repurposed as "Issue Date" (actual issue date from authority)
      preferred_inspection_date: form.preferred_inspection_date || null,
      jls_quotation_number: form.jls_quotation_number || null,
      document_url: form.document_url || null,
      notes: form.notes || null
    };
  }
  async function doSave() {
    if (!userId) throw new Error("Not authenticated");
    const payload = buildPayload();
    if (editing) {
      const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
      if (error) throw error;
      toast.success("Permit updated");
      return editing.id;
    } else {
      const { data, error } = await supabase.from("permits").insert([{ ...payload, created_by: userId }]).select("id").single();
      if (error) throw error;
      toast.success("Permit created");
      return data.id;
    }
  }
  async function handleSaveOnly(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await doSave();
      onSaved();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleEmailSave() {
    if (!form.contact_email) {
      toast.error("Add an email address first");
      return;
    }
    setEmailBusy(true);
    try {
      await doSave();
      const { data: templates } = await supabase.from("email_templates").select("subject, body").eq("permit_type", "cruising_tenders").limit(1);
      const tmpl = templates?.[0];
      const yachtName = yachts.find((y) => y.id === form.yacht_id)?.vessel_name ?? "";
      const replace = (s) => s.replace(/\{\{boat_name\}\}/g, yachtName).replace(/\{\{holder_name\}\}/g, form.holder_name ?? "").replace(/\{\{expiry_date\}\}/g, form.expiry_date ?? "").replace(/\{\{issue_date\}\}/g, form.issue_date ?? "").replace(/\{\{authority\}\}/g, form.issuing_authority ?? "").replace(/\{\{applied_by\}\}/g, form.permit_number ?? "").replace(/\{\{quotation_number\}\}/g, form.jls_quotation_number ?? "");
      const subject = tmpl ? replace(tmpl.subject) : `Cruising Permit — ${yachtName}`;
      const body = tmpl ? replace(tmpl.body) : `Dear ${form.holder_name ?? "Client"},

Please find your cruising permit details below.

Vessel: ${yachtName}
Date Applied: ${form.issue_date ?? "—"}
Expiry: ${form.expiry_date ?? "—"}
Authority: ${form.issuing_authority ?? "—"}
Applied By: ${form.permit_number ?? "—"}
${form.jls_quotation_number ? `JLS Quotation No: ${form.jls_quotation_number}
` : ""}${form.document_url ? `
Attachment: ${form.document_url}` : ""}

Kind regards,
JLS Yachts`;
      window.open(
        `mailto:${form.contact_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        "_blank"
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setEmailBusy(false);
    }
  }
  const isBusy = busy || emailBusy || uploading;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
      editing ? "Edit" : "New",
      " Cruising Permit — Tenders & Appurtenances"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSaveOnly, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 grid grid-cols-3 gap-x-4 gap-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Boat Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.yacht_id ?? "__none",
                onValueChange: (v) => set("yacht_id", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select vessel" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Cruising Permit Date Applied" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.issue_date ?? "",
                onChange: (e) => set("issue_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Cruising Permit Duration (6 Months)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.expiry_date ?? "",
                onChange: (e) => set("expiry_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.holder_name ?? "",
                onChange: (e) => set("holder_name", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Email" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "email",
                value: form.contact_email ?? "",
                onChange: (e) => set("contact_email", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Authority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.issuing_authority ?? "__none",
                onValueChange: (v) => set("issuing_authority", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Find items" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    AUTHORITIES$4.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: a, children: a }, a))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "21 Day Extension" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.dma_phase ?? "__none",
                onValueChange: (v) => set("dma_phase", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Find items" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    EXTENSION_OPTIONS$2.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: o.value, children: o.label }, o.value))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Applied By" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.permit_number ?? "",
                onChange: (e) => set("permit_number", e.target.value),
                placeholder: "e.g. External Admin"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Quotation Number" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.jls_quotation_number ?? "",
                onChange: (e) => set("jls_quotation_number", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Issue Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.preferred_inspection_date ?? "",
                onChange: (e) => set("preferred_inspection_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Remarks" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Textarea,
              {
                rows: 2,
                value: form.notes ?? "",
                onChange: (e) => set("notes", e.target.value)
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-52 shrink-0 flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Attachments" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => !isBusy && fileRef.current?.click(),
              className: `flex-1 min-h-[200px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center p-4 transition cursor-pointer ${fileName ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40"}`,
              children: [
                uploading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) : fileName ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(FileCheckCorner, { className: "h-6 w-6 text-primary" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium break-all leading-tight", children: fileName }),
                  form.document_url && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "a",
                    {
                      href: form.document_url,
                      target: "_blank",
                      rel: "noreferrer",
                      onClick: (e) => e.stopPropagation(),
                      className: "text-xs text-muted-foreground underline hover:text-foreground",
                      children: "View"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: (e) => {
                        e.stopPropagation();
                        set("document_url", null);
                        setFileName(null);
                      },
                      className: "text-xs text-destructive/70 hover:text-destructive",
                      children: "Remove"
                    }
                  )
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-6 w-6 text-muted-foreground/60" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "There is nothing attached." }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium", children: "Attach file" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    ref: fileRef,
                    type: "file",
                    accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
                    className: "hidden",
                    onChange: (e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                      e.target.value = "";
                    }
                  }
                )
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 mt-6 pt-4 border-t border-border", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "submit", variant: "outline", disabled: isBusy, className: "gap-1.5", children: [
          busy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
          "Save only"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "button", onClick: handleEmailSave, disabled: isBusy, className: "gap-1.5", children: [
          emailBusy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Mail, { className: "h-4 w-4" }),
          "Email Pass & Save"
        ] })
      ] })
    ] })
  ] });
}
const AUTHORITIES$3 = [
  "Dubai Municipality",
  "Dubai Maritime City Authority",
  "Port Rashid",
  "Hamdan Port",
  "Other"
];
const EXTENSION_OPTIONS$1 = [
  { value: "Not Applied", label: "Not Applied" },
  { value: "Pending", label: "Pending" },
  { value: "Granted", label: "Granted" },
  { value: "Refused", label: "Refused" }
];
function CruisingMothershipDialog({ yachts, editing, userId, onSaved }) {
  const [form, setForm] = reactExports.useState(
    () => editing ?? { permit_type: "cruising_mothership", status: "pending" }
  );
  const [busy, setBusy] = reactExports.useState(false);
  const [emailBusy, setEmailBusy] = reactExports.useState(false);
  const [uploading, setUploading] = reactExports.useState(false);
  const [fileName, setFileName] = reactExports.useState(null);
  const fileRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    setForm(editing ?? { permit_type: "cruising_mothership", status: "pending" });
    if (editing?.document_url) {
      const parts = editing.document_url.split("/");
      setFileName(decodeURIComponent(parts[parts.length - 1].split("?")[0]));
    } else {
      setFileName(null);
    }
  }, [editing]);
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function handleFileUpload(file) {
    setUploading(true);
    try {
      const path = `cruising-mothership/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("permit-documents").getPublicUrl(path);
      set("document_url", data.publicUrl);
      setFileName(file.name);
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  function buildPayload() {
    return {
      permit_type: "cruising_mothership",
      yacht_id: form.yacht_id ?? null,
      // permit_number → Applied By
      permit_number: form.permit_number || null,
      status: form.status ?? "pending",
      // issue_date → Cruising Permit Date Applied
      issue_date: form.issue_date || null,
      // expiry_date → Expiry Date
      expiry_date: form.expiry_date || null,
      issuing_authority: form.issuing_authority || null,
      // holder_name → Client Name/Purser
      holder_name: form.holder_name || null,
      contact_email: form.contact_email || null,
      // dma_phase → 21 Day Extension
      dma_phase: form.dma_phase || null,
      // preferred_inspection_date → Issue Date (actual date from authority)
      preferred_inspection_date: form.preferred_inspection_date || null,
      jls_quotation_number: form.jls_quotation_number || null,
      document_url: form.document_url || null,
      notes: form.notes || null
    };
  }
  async function doSave() {
    if (!userId) throw new Error("Not authenticated");
    const payload = buildPayload();
    if (editing) {
      const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
      if (error) throw error;
      toast.success("Permit updated");
      return editing.id;
    } else {
      const { data, error } = await supabase.from("permits").insert([{ ...payload, created_by: userId }]).select("id").single();
      if (error) throw error;
      toast.success("Permit created");
      return data.id;
    }
  }
  async function handleSaveOnly(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await doSave();
      onSaved();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleEmailSave() {
    if (!form.contact_email) {
      toast.error("Add an email address first");
      return;
    }
    setEmailBusy(true);
    try {
      await doSave();
      const { data: templates } = await supabase.from("email_templates").select("subject, body").eq("permit_type", "cruising_mothership").limit(1);
      const tmpl = templates?.[0];
      const yachtName = yachts.find((y) => y.id === form.yacht_id)?.vessel_name ?? "";
      const replace = (s) => s.replace(/\{\{boat_name\}\}/g, yachtName).replace(/\{\{holder_name\}\}/g, form.holder_name ?? "").replace(/\{\{expiry_date\}\}/g, form.expiry_date ?? "").replace(/\{\{issue_date\}\}/g, form.issue_date ?? "").replace(/\{\{authority\}\}/g, form.issuing_authority ?? "").replace(/\{\{applied_by\}\}/g, form.permit_number ?? "").replace(/\{\{quotation_number\}\}/g, form.jls_quotation_number ?? "");
      const subject = tmpl ? replace(tmpl.subject) : `Cruising Permit — ${yachtName}`;
      const body = tmpl ? replace(tmpl.body) : `Dear ${form.holder_name ?? "Client"},

Please find your Cruising Permit (Mothership) details below.

Vessel: ${yachtName}
Date Applied: ${form.issue_date ?? "—"}
Expiry: ${form.expiry_date ?? "—"}
Authority: ${form.issuing_authority ?? "—"}
Applied By: ${form.permit_number ?? "—"}
${form.jls_quotation_number ? `JLS Quotation No: ${form.jls_quotation_number}
` : ""}${form.document_url ? `
Attachment: ${form.document_url}` : ""}

Kind regards,
JLS Yachts`;
      window.open(
        `mailto:${form.contact_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        "_blank"
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setEmailBusy(false);
    }
  }
  const isBusy = busy || emailBusy || uploading;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
      editing ? "Edit" : "New",
      " Cruising Permit — Mothership"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSaveOnly, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 grid grid-cols-3 gap-x-4 gap-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Boat Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.yacht_id ?? "__none",
                onValueChange: (v) => set("yacht_id", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select vessel" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Cruising Permit Date Applied" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.issue_date ?? "",
                onChange: (e) => set("issue_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Expiry Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.expiry_date ?? "",
                onChange: (e) => set("expiry_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Client Name/Purser" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.holder_name ?? "",
                onChange: (e) => set("holder_name", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Email" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "email",
                value: form.contact_email ?? "",
                onChange: (e) => set("contact_email", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Authority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.issuing_authority ?? "__none",
                onValueChange: (v) => set("issuing_authority", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Find items" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    AUTHORITIES$3.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: a, children: a }, a))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "21 Day Extension" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.dma_phase ?? "__none",
                onValueChange: (v) => set("dma_phase", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Find items" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    EXTENSION_OPTIONS$1.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: o.value, children: o.label }, o.value))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Applied By" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.permit_number ?? "",
                onChange: (e) => set("permit_number", e.target.value),
                placeholder: "e.g. External Admin"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Quotation Number" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.jls_quotation_number ?? "",
                onChange: (e) => set("jls_quotation_number", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Issue Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.preferred_inspection_date ?? "",
                onChange: (e) => set("preferred_inspection_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Remarks" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Textarea,
              {
                rows: 2,
                value: form.notes ?? "",
                onChange: (e) => set("notes", e.target.value)
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-52 shrink-0 flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Attachments for Client" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => !isBusy && fileRef.current?.click(),
              className: `flex-1 min-h-[200px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center p-4 transition cursor-pointer ${fileName ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40"}`,
              children: [
                uploading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) : fileName ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(FileCheckCorner, { className: "h-6 w-6 text-primary" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium break-all leading-tight", children: fileName }),
                  form.document_url && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "a",
                    {
                      href: form.document_url,
                      target: "_blank",
                      rel: "noreferrer",
                      onClick: (e) => e.stopPropagation(),
                      className: "text-xs text-muted-foreground underline hover:text-foreground",
                      children: "View"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: (e) => {
                        e.stopPropagation();
                        set("document_url", null);
                        setFileName(null);
                      },
                      className: "text-xs text-destructive/70 hover:text-destructive",
                      children: "Remove"
                    }
                  )
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-6 w-6 text-muted-foreground/60" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "Please attach any relevant documents." }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium", children: "Attach file" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    ref: fileRef,
                    type: "file",
                    accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
                    className: "hidden",
                    onChange: (e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                      e.target.value = "";
                    }
                  }
                )
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 mt-6 pt-4 border-t border-border", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "submit", variant: "outline", disabled: isBusy, className: "gap-1.5", children: [
          busy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
          "Save only"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "button", onClick: handleEmailSave, disabled: isBusy, className: "gap-1.5", children: [
          emailBusy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Mail, { className: "h-4 w-4" }),
          "Email Pass & Save"
        ] })
      ] })
    ] })
  ] });
}
const AUTHORITIES$2 = [
  "TDRA",
  "Dubai Municipality",
  "Dubai Maritime City Authority",
  "Port Rashid",
  "Hamdan Port",
  "Other"
];
function TdraUploadBox({
  label,
  fileName,
  uploading,
  fileUrl,
  isBusy,
  onClear,
  onPick,
  inputRef,
  onFileChange,
  accept = ".pdf,.jpg,.jpeg,.png"
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        onClick: () => !isBusy && onPick(),
        className: `h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 text-center p-3 transition cursor-pointer ${fileName ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40"}`,
        children: [
          uploading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) : fileName ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(FileCheckCorner, { className: "h-5 w-5 text-primary" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-primary font-medium break-all leading-tight line-clamp-2", children: fileName }),
            fileUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "a",
              {
                href: fileUrl,
                target: "_blank",
                rel: "noreferrer",
                onClick: (e) => e.stopPropagation(),
                className: "text-[10px] text-muted-foreground underline hover:text-foreground",
                children: "View"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: (e) => {
                  e.stopPropagation();
                  onClear();
                },
                className: "text-[10px] text-destructive/70 hover:text-destructive",
                children: "Remove"
              }
            )
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-5 w-5 text-muted-foreground/50" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-muted-foreground", children: "Tap or click to add a file" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: inputRef,
              type: "file",
              accept,
              className: "hidden",
              onChange: (e) => {
                const f = e.target.files?.[0];
                if (f) onFileChange(f);
                e.target.value = "";
              }
            }
          )
        ]
      }
    )
  ] });
}
function TdraDialog({ yachts, editing, userId, onSaved }) {
  const [form, setForm] = reactExports.useState(
    () => editing ?? { permit_type: "tdra", status: "pending" }
  );
  const [busy, setBusy] = reactExports.useState(false);
  const [emailBusy, setEmailBusy] = reactExports.useState(false);
  const [invoiceUrl, setInvoiceUrl] = reactExports.useState(null);
  const [invoiceFileName, setInvoiceFileName] = reactExports.useState(null);
  const [uploadingInvoice, setUploadingInvoice] = reactExports.useState(false);
  const invoiceRef = reactExports.useRef(null);
  const [certFileName, setCertFileName] = reactExports.useState(null);
  const [uploadingCert, setUploadingCert] = reactExports.useState(false);
  const certRef = reactExports.useRef(null);
  const [attachFileName, setAttachFileName] = reactExports.useState(null);
  const [uploadingAttach, setUploadingAttach] = reactExports.useState(false);
  const attachRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    setForm(editing ?? { permit_type: "tdra", status: "pending" });
    if (editing?.document_url) {
      const parts = editing.document_url.split("/");
      setCertFileName(decodeURIComponent(parts[parts.length - 1].split("?")[0]));
    } else {
      setCertFileName(null);
    }
    if (editing?.notes?.startsWith("invoice_url:")) {
      const url = editing.notes.replace("invoice_url:", "");
      setInvoiceUrl(url);
      const parts = url.split("/");
      setInvoiceFileName(decodeURIComponent(parts[parts.length - 1].split("?")[0]));
    } else {
      setInvoiceUrl(null);
      setInvoiceFileName(null);
    }
    setAttachFileName(null);
  }, [editing]);
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function uploadFile(file, folder) {
    const path = `tdra/${folder}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    const { error } = await supabase.storage.from("permit-documents").upload(path, file, { upsert: true });
    if (error) throw error;
    return supabase.storage.from("permit-documents").getPublicUrl(path).data.publicUrl;
  }
  async function handleInvoiceUpload(file) {
    setUploadingInvoice(true);
    try {
      const url = await uploadFile(file, "invoice");
      setInvoiceUrl(url);
      setInvoiceFileName(file.name);
      set("notes", `invoice_url:${url}`);
      toast.success("Invoice uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingInvoice(false);
    }
  }
  async function handleCertUpload(file) {
    setUploadingCert(true);
    try {
      const url = await uploadFile(file, "certificate");
      set("document_url", url);
      setCertFileName(file.name);
      toast.success("Certificate uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingCert(false);
    }
  }
  async function handleAttachUpload(file) {
    setUploadingAttach(true);
    try {
      const url = await uploadFile(file, "attachments");
      set("document_url", url);
      setAttachFileName(file.name);
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingAttach(false);
    }
  }
  function buildPayload() {
    return {
      permit_type: "tdra",
      yacht_id: form.yacht_id ?? null,
      permit_number: form.permit_number || null,
      // Applied By
      status: form.status ?? "pending",
      issue_date: form.issue_date || null,
      // TDRA Date Applied
      expiry_date: form.expiry_date || null,
      // Expiry Date
      issuing_authority: form.issuing_authority || null,
      holder_name: form.holder_name || null,
      // Name
      contact_email: form.contact_email || null,
      dma_phase: null,
      preferred_inspection_date: null,
      jls_quotation_number: form.jls_quotation_number || null,
      document_url: form.document_url || null,
      // TDRA Certificate / Attachments
      notes: invoiceUrl ? `invoice_url:${invoiceUrl}` : null
      // Invoice URL
    };
  }
  async function doSave() {
    if (!userId) throw new Error("Not authenticated");
    const payload = buildPayload();
    if (editing) {
      const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
      if (error) throw error;
      toast.success("Permit updated");
      return editing.id;
    } else {
      const { data, error } = await supabase.from("permits").insert([{ ...payload, created_by: userId }]).select("id").single();
      if (error) throw error;
      toast.success("Permit created");
      return data.id;
    }
  }
  async function handleSaveOnly(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await doSave();
      onSaved();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleEmailSave() {
    if (!form.contact_email) {
      toast.error("Add an email address first");
      return;
    }
    setEmailBusy(true);
    try {
      await doSave();
      const { data: templates } = await supabase.from("email_templates").select("subject, body").eq("permit_type", "tdra").limit(1);
      const tmpl = templates?.[0];
      const yachtName = yachts.find((y) => y.id === form.yacht_id)?.vessel_name ?? "";
      const replace = (s) => s.replace(/\{\{boat_name\}\}/g, yachtName).replace(/\{\{holder_name\}\}/g, form.holder_name ?? "").replace(/\{\{expiry_date\}\}/g, form.expiry_date ?? "").replace(/\{\{issue_date\}\}/g, form.issue_date ?? "").replace(/\{\{authority\}\}/g, form.issuing_authority ?? "").replace(/\{\{applied_by\}\}/g, form.permit_number ?? "").replace(/\{\{quotation_number\}\}/g, form.jls_quotation_number ?? "");
      const subject = tmpl ? replace(tmpl.subject) : `TDRA Permit — ${yachtName}`;
      const body = tmpl ? replace(tmpl.body) : `Dear ${form.holder_name ?? "Client"},

Please find your TDRA Permit details below.

Vessel: ${yachtName}
Date Applied: ${form.issue_date ?? "—"}
Expiry: ${form.expiry_date ?? "—"}
Authority: ${form.issuing_authority ?? "—"}
Applied By: ${form.permit_number ?? "—"}
${form.jls_quotation_number ? `JLS Quotation No: ${form.jls_quotation_number}
` : ""}${form.document_url ? `
Certificate: ${form.document_url}` : ""}

Kind regards,
JLS Yachts`;
      window.open(
        `mailto:${form.contact_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        "_blank"
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setEmailBusy(false);
    }
  }
  const isBusy = busy || emailBusy || uploadingInvoice || uploadingCert || uploadingAttach;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
      editing ? "Edit" : "New",
      " TDRA Permit"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSaveOnly, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-x-4 gap-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Boat Name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Select,
            {
              value: form.yacht_id ?? "__none",
              onValueChange: (v) => set("yacht_id", v === "__none" ? null : v),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select vessel" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                  yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
                ] })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "TDRA Date Applied" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              type: "date",
              value: form.issue_date ?? "",
              onChange: (e) => set("issue_date", e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              value: form.holder_name ?? "",
              onChange: (e) => set("holder_name", e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Email" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              type: "email",
              value: form.contact_email ?? "",
              onChange: (e) => set("contact_email", e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Authority" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Select,
            {
              value: form.issuing_authority ?? "__none",
              onValueChange: (v) => set("issuing_authority", v === "__none" ? null : v),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Find items" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                  AUTHORITIES$2.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: a, children: a }, a))
                ] })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Expiry Date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              type: "date",
              value: form.expiry_date ?? "",
              onChange: (e) => set("expiry_date", e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          TdraUploadBox,
          {
            label: "Invoice from Authority",
            fileName: invoiceFileName,
            uploading: uploadingInvoice,
            fileUrl: invoiceUrl,
            isBusy,
            onClear: () => {
              setInvoiceUrl(null);
              setInvoiceFileName(null);
              set("notes", null);
            },
            onPick: () => invoiceRef.current?.click(),
            inputRef: invoiceRef,
            onFileChange: handleInvoiceUpload
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          TdraUploadBox,
          {
            label: "TDRA Certificate",
            fileName: certFileName,
            uploading: uploadingCert,
            fileUrl: form.document_url ?? null,
            isBusy,
            onClear: () => {
              set("document_url", null);
              setCertFileName(null);
            },
            onPick: () => certRef.current?.click(),
            inputRef: certRef,
            onFileChange: handleCertUpload
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "JLS Quotation No." }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              value: form.jls_quotation_number ?? "",
              onChange: (e) => set("jls_quotation_number", e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Applied By" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              value: form.permit_number ?? "",
              onChange: (e) => set("permit_number", e.target.value),
              placeholder: "e.g. External Admin"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Attachments for Client" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => !isBusy && attachRef.current?.click(),
              className: `h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center p-4 transition cursor-pointer ${attachFileName ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40"}`,
              children: [
                uploadingAttach ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) : attachFileName ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(FileCheckCorner, { className: "h-5 w-5 text-primary" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium", children: attachFileName }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: (e) => {
                        e.stopPropagation();
                        setAttachFileName(null);
                      },
                      className: "text-xs text-destructive/70 hover:text-destructive",
                      children: "Remove"
                    }
                  )
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-5 w-5 text-muted-foreground/60" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "There is nothing attached." }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium", children: "Attach file" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    ref: attachRef,
                    type: "file",
                    accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
                    className: "hidden",
                    onChange: (e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAttachUpload(f);
                      e.target.value = "";
                    }
                  }
                )
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 mt-6 pt-4 border-t border-border", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "submit", variant: "outline", disabled: isBusy, className: "gap-1.5", children: [
          busy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
          "Save only"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "button", onClick: handleEmailSave, disabled: isBusy, className: "gap-1.5", children: [
          emailBusy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Mail, { className: "h-4 w-4" }),
          "Email Pass & Save"
        ] })
      ] })
    ] })
  ] });
}
const AUTHORITIES$1 = [
  "Dubai Municipality",
  "Dubai Maritime City Authority",
  "Port Rashid",
  "Hamdan Port",
  "Other"
];
const EXTENSION_OPTIONS = [
  { value: "Not Applied", label: "Not Applied" },
  { value: "Pending", label: "Pending" },
  { value: "Granted", label: "Granted" },
  { value: "Refused", label: "Refused" }
];
function DmaDialog({ yachts, editing, userId, onSaved }) {
  const [form, setForm] = reactExports.useState(
    () => editing ?? { permit_type: "dma", status: "pending" }
  );
  const [busy, setBusy] = reactExports.useState(false);
  const [emailBusy, setEmailBusy] = reactExports.useState(false);
  const [uploading, setUploading] = reactExports.useState(false);
  const [fileName, setFileName] = reactExports.useState(null);
  const fileRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    setForm(editing ?? { permit_type: "dma", status: "pending" });
    if (editing?.document_url) {
      const parts = editing.document_url.split("/");
      setFileName(decodeURIComponent(parts[parts.length - 1].split("?")[0]));
    } else {
      setFileName(null);
    }
  }, [editing]);
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function handleFileUpload(file) {
    setUploading(true);
    try {
      const path = `dma/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("permit-documents").getPublicUrl(path);
      set("document_url", data.publicUrl);
      setFileName(file.name);
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  function buildPayload() {
    return {
      permit_type: "dma",
      yacht_id: form.yacht_id ?? null,
      // permit_number → Applied By
      permit_number: form.permit_number || null,
      status: form.status ?? "pending",
      // issue_date → Cruising Permit Date Applied
      issue_date: form.issue_date || null,
      // expiry_date → Expiry Date
      expiry_date: form.expiry_date || null,
      issuing_authority: form.issuing_authority || null,
      // holder_name → Client Name/Purser
      holder_name: form.holder_name || null,
      contact_email: form.contact_email || null,
      // dma_phase → 21 Day Extension
      dma_phase: form.dma_phase || null,
      // preferred_inspection_date → Issue Date (from authority)
      preferred_inspection_date: form.preferred_inspection_date || null,
      jls_quotation_number: form.jls_quotation_number || null,
      document_url: form.document_url || null,
      notes: form.notes || null
    };
  }
  async function doSave() {
    if (!userId) throw new Error("Not authenticated");
    const payload = buildPayload();
    if (editing) {
      const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
      if (error) throw error;
      toast.success("Permit updated");
      return editing.id;
    } else {
      const { data, error } = await supabase.from("permits").insert([{ ...payload, created_by: userId }]).select("id").single();
      if (error) throw error;
      toast.success("Permit created");
      return data.id;
    }
  }
  async function handleSaveOnly(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await doSave();
      onSaved();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleEmailSave() {
    if (!form.contact_email) {
      toast.error("Add an email address first");
      return;
    }
    setEmailBusy(true);
    try {
      await doSave();
      const { data: templates } = await supabase.from("email_templates").select("subject, body").eq("permit_type", "dma").limit(1);
      const tmpl = templates?.[0];
      const yachtName = yachts.find((y) => y.id === form.yacht_id)?.vessel_name ?? "";
      const replace = (s) => s.replace(/\{\{boat_name\}\}/g, yachtName).replace(/\{\{holder_name\}\}/g, form.holder_name ?? "").replace(/\{\{expiry_date\}\}/g, form.expiry_date ?? "").replace(/\{\{issue_date\}\}/g, form.issue_date ?? "").replace(/\{\{authority\}\}/g, form.issuing_authority ?? "").replace(/\{\{applied_by\}\}/g, form.permit_number ?? "").replace(/\{\{quotation_number\}\}/g, form.jls_quotation_number ?? "");
      const subject = tmpl ? replace(tmpl.subject) : `DMA Permit — ${yachtName}`;
      const body = tmpl ? replace(tmpl.body) : `Dear ${form.holder_name ?? "Client"},

Please find your DMA Permit details below.

Vessel: ${yachtName}
Date Applied: ${form.issue_date ?? "—"}
Expiry: ${form.expiry_date ?? "—"}
Authority: ${form.issuing_authority ?? "—"}
Applied By: ${form.permit_number ?? "—"}
${form.jls_quotation_number ? `JLS Quotation No: ${form.jls_quotation_number}
` : ""}${form.document_url ? `
Attachment: ${form.document_url}` : ""}

Kind regards,
JLS Yachts`;
      window.open(
        `mailto:${form.contact_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        "_blank"
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setEmailBusy(false);
    }
  }
  const isBusy = busy || emailBusy || uploading;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
      editing ? "Edit" : "New",
      " DMA Permit"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSaveOnly, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 grid grid-cols-3 gap-x-4 gap-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Boat Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.yacht_id ?? "__none",
                onValueChange: (v) => set("yacht_id", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select vessel" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Cruising Permit Date Applied" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.issue_date ?? "",
                onChange: (e) => set("issue_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Expiry Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.expiry_date ?? "",
                onChange: (e) => set("expiry_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Client Name/Purser" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.holder_name ?? "",
                onChange: (e) => set("holder_name", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Email" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "email",
                value: form.contact_email ?? "",
                onChange: (e) => set("contact_email", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Authority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.issuing_authority ?? "__none",
                onValueChange: (v) => set("issuing_authority", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Find items" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    AUTHORITIES$1.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: a, children: a }, a))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "21 Day Extension" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.dma_phase ?? "__none",
                onValueChange: (v) => set("dma_phase", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Find items" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    EXTENSION_OPTIONS.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: o.value, children: o.label }, o.value))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Applied By" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.permit_number ?? "",
                onChange: (e) => set("permit_number", e.target.value),
                placeholder: "e.g. External Admin"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Quotation Number" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.jls_quotation_number ?? "",
                onChange: (e) => set("jls_quotation_number", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Issue Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.preferred_inspection_date ?? "",
                onChange: (e) => set("preferred_inspection_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Remarks" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Textarea,
              {
                rows: 2,
                value: form.notes ?? "",
                onChange: (e) => set("notes", e.target.value)
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-52 shrink-0 flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Attachments for Client" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => !isBusy && fileRef.current?.click(),
              className: `flex-1 min-h-[200px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center p-4 transition cursor-pointer ${fileName ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40"}`,
              children: [
                uploading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) : fileName ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(FileCheckCorner, { className: "h-6 w-6 text-primary" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium break-all leading-tight", children: fileName }),
                  form.document_url && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "a",
                    {
                      href: form.document_url,
                      target: "_blank",
                      rel: "noreferrer",
                      onClick: (e) => e.stopPropagation(),
                      className: "text-xs text-muted-foreground underline hover:text-foreground",
                      children: "View"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: (e) => {
                        e.stopPropagation();
                        set("document_url", null);
                        setFileName(null);
                      },
                      className: "text-xs text-destructive/70 hover:text-destructive",
                      children: "Remove"
                    }
                  )
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-6 w-6 text-muted-foreground/60" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "Please attach any relevant documents." }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium", children: "Attach file" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    ref: fileRef,
                    type: "file",
                    accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
                    className: "hidden",
                    onChange: (e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                      e.target.value = "";
                    }
                  }
                )
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 mt-6 pt-4 border-t border-border", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "submit", variant: "outline", disabled: isBusy, className: "gap-1.5", children: [
          busy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
          "Save only"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "button", onClick: handleEmailSave, disabled: isBusy, className: "gap-1.5", children: [
          emailBusy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Mail, { className: "h-4 w-4" }),
          "Email Pass & Save"
        ] })
      ] })
    ] })
  ] });
}
const AUTHORITIES = [
  "Dubai Municipality",
  "Dubai Maritime City Authority",
  "Port Rashid",
  "Hamdan Port",
  "Other"
];
function NavigationLicenseDialog({ yachts, editing, userId, onSaved }) {
  const [form, setForm] = reactExports.useState(
    () => editing ?? { permit_type: "navigation_license", status: "pending" }
  );
  const [busy, setBusy] = reactExports.useState(false);
  const [emailBusy, setEmailBusy] = reactExports.useState(false);
  const [uploading, setUploading] = reactExports.useState(false);
  const [fileName, setFileName] = reactExports.useState(null);
  const fileRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    setForm(editing ?? { permit_type: "navigation_license", status: "pending" });
    if (editing?.document_url) {
      const parts = editing.document_url.split("/");
      setFileName(decodeURIComponent(parts[parts.length - 1].split("?")[0]));
    } else {
      setFileName(null);
    }
  }, [editing]);
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function handleFileUpload(file) {
    setUploading(true);
    try {
      const path = `navigation-license/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("permit-documents").getPublicUrl(path);
      set("document_url", data.publicUrl);
      setFileName(file.name);
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  function buildPayload() {
    return {
      permit_type: "navigation_license",
      yacht_id: form.yacht_id ?? null,
      permit_number: form.permit_number || null,
      // Applied By
      status: form.status ?? "pending",
      issue_date: form.issue_date || null,
      // Navigation License Date Applied
      expiry_date: form.expiry_date || null,
      // Expiry Date
      issuing_authority: form.issuing_authority || null,
      holder_name: form.holder_name || null,
      // Client Name/Purser
      contact_email: form.contact_email || null,
      dma_phase: null,
      preferred_inspection_date: form.preferred_inspection_date || null,
      // Issue Date
      jls_quotation_number: form.jls_quotation_number || null,
      // Quotation Number
      license_no: form.license_no || null,
      // License No.
      requested_by: form.requested_by || null,
      // Requested By
      document_url: form.document_url || null,
      notes: form.notes || null
      // Remarks
    };
  }
  async function doSave() {
    if (!userId) throw new Error("Not authenticated");
    const payload = buildPayload();
    if (editing) {
      const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
      if (error) throw error;
      toast.success("Permit updated");
      return editing.id;
    } else {
      const { data, error } = await supabase.from("permits").insert([{ ...payload, created_by: userId }]).select("id").single();
      if (error) throw error;
      toast.success("Permit created");
      return data.id;
    }
  }
  async function handleSaveOnly(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await doSave();
      onSaved();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleEmailSave() {
    if (!form.contact_email) {
      toast.error("Add an email address first");
      return;
    }
    setEmailBusy(true);
    try {
      await doSave();
      const { data: templates } = await supabase.from("email_templates").select("subject, body").eq("permit_type", "navigation_license").limit(1);
      const tmpl = templates?.[0];
      const yachtName = yachts.find((y) => y.id === form.yacht_id)?.vessel_name ?? "";
      const replace = (s) => s.replace(/\{\{boat_name\}\}/g, yachtName).replace(/\{\{holder_name\}\}/g, form.holder_name ?? "").replace(/\{\{expiry_date\}\}/g, form.expiry_date ?? "").replace(/\{\{issue_date\}\}/g, form.issue_date ?? "").replace(/\{\{authority\}\}/g, form.issuing_authority ?? "").replace(/\{\{applied_by\}\}/g, form.permit_number ?? "").replace(/\{\{quotation_number\}\}/g, form.jls_quotation_number ?? "").replace(/\{\{requested_by\}\}/g, form.requested_by ?? "").replace(/\{\{license_no\}\}/g, form.license_no ?? "").replace(/\{\{actual_issue_date\}\}/g, form.preferred_inspection_date ?? "");
      const subject = tmpl ? replace(tmpl.subject) : `Navigation License — ${yachtName}`;
      const body = tmpl ? replace(tmpl.body) : `Dear ${form.holder_name ?? "Client"},

Please find your Navigation License details below.

Vessel: ${yachtName}
Date Applied: ${form.issue_date ?? "—"}
Expiry: ${form.expiry_date ?? "—"}
Authority: ${form.issuing_authority ?? "—"}
Applied By: ${form.permit_number ?? "—"}
${form.jls_quotation_number ? `JLS Quotation No: ${form.jls_quotation_number}
` : ""}${form.requested_by ? `Requested By: ${form.requested_by}
` : ""}${form.license_no ? `License No: ${form.license_no}
` : ""}${form.preferred_inspection_date ? `Issue Date: ${form.preferred_inspection_date}
` : ""}${form.notes ? `
Remarks: ${form.notes}` : ""}${form.document_url ? `
Attachment: ${form.document_url}` : ""}

Kind regards,
JLS Yachts`;
      window.open(
        `mailto:${form.contact_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        "_blank"
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setEmailBusy(false);
    }
  }
  const isBusy = busy || emailBusy || uploading;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
      editing ? "Edit" : "New",
      " Navigation License"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSaveOnly, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 grid grid-cols-3 gap-x-4 gap-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Boat Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.yacht_id ?? "__none",
                onValueChange: (v) => set("yacht_id", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select vessel" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Navigation License Date Applied" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.issue_date ?? "",
                onChange: (e) => set("issue_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Expiry Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.expiry_date ?? "",
                onChange: (e) => set("expiry_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Client Name/Purser" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.holder_name ?? "",
                onChange: (e) => set("holder_name", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Email" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "email",
                value: form.contact_email ?? "",
                onChange: (e) => set("contact_email", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Authority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                value: form.issuing_authority ?? "__none",
                onValueChange: (v) => set("issuing_authority", v === "__none" ? null : v),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Find items" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                    AUTHORITIES.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: a, children: a }, a))
                  ] })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Applied By" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.permit_number ?? "",
                onChange: (e) => set("permit_number", e.target.value),
                placeholder: "e.g. External Admin"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Quotation Number" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.jls_quotation_number ?? "",
                onChange: (e) => set("jls_quotation_number", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Requested By" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.requested_by ?? "",
                onChange: (e) => set("requested_by", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "License No." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.license_no ?? "",
                onChange: (e) => set("license_no", e.target.value),
                placeholder: "e.g. NAV-2024-001"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Issue Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.preferred_inspection_date ?? "",
                onChange: (e) => set("preferred_inspection_date", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Remarks" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Textarea,
              {
                rows: 2,
                value: form.notes ?? "",
                onChange: (e) => set("notes", e.target.value)
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-52 shrink-0 flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Attachments for Client" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => !isBusy && fileRef.current?.click(),
              className: `flex-1 min-h-[200px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center p-4 transition cursor-pointer ${fileName ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40"}`,
              children: [
                uploading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) : fileName ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(FileCheckCorner, { className: "h-6 w-6 text-primary" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium break-all leading-tight", children: fileName }),
                  form.document_url && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "a",
                    {
                      href: form.document_url,
                      target: "_blank",
                      rel: "noreferrer",
                      onClick: (e) => e.stopPropagation(),
                      className: "text-xs text-muted-foreground underline hover:text-foreground",
                      children: "View"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: (e) => {
                        e.stopPropagation();
                        set("document_url", null);
                        setFileName(null);
                      },
                      className: "text-xs text-destructive/70 hover:text-destructive",
                      children: "Remove"
                    }
                  )
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-6 w-6 text-muted-foreground/60" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "Please attach any relevant documents." }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-primary font-medium", children: "Attach file" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    ref: fileRef,
                    type: "file",
                    accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
                    className: "hidden",
                    onChange: (e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                      e.target.value = "";
                    }
                  }
                )
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 mt-6 pt-4 border-t border-border", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "submit", variant: "outline", disabled: isBusy, className: "gap-1.5", children: [
          busy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
          "Save only"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "button", onClick: handleEmailSave, disabled: isBusy, className: "gap-1.5", children: [
          emailBusy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Mail, { className: "h-4 w-4" }),
          "Email Pass & Save"
        ] })
      ] })
    ] })
  ] });
}
const ACCESS_ZONES = [
  "Gate A",
  "Gate B",
  "Gate C",
  "Marina Entrance",
  "Dry Dock",
  "Fuel Dock",
  "Administration",
  "All Areas"
];
function GatePassDialog({
  yachts,
  editing,
  userId,
  onSaved
}) {
  const [busy, setBusy] = reactExports.useState(false);
  const [uploading, setUploading] = reactExports.useState(false);
  const fileRef = reactExports.useRef(null);
  const [form, setForm] = reactExports.useState(
    () => editing ?? { permit_type: "gate_pass", status: "pending" }
  );
  reactExports.useEffect(() => {
    setForm(editing ?? { permit_type: "gate_pass", status: "pending" });
  }, [editing]);
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `permits/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("permit-documents").getPublicUrl(path);
      set("document_url", publicUrl);
      toast.success("File attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  async function doSave() {
    if (!userId) return;
    setBusy(true);
    try {
      const payload = {
        permit_type: "gate_pass",
        yacht_id: form.yacht_id ?? null,
        permit_number: form.permit_number || null,
        status: form.status ?? "pending",
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        issuing_authority: form.issuing_authority || null,
        holder_name: form.holder_name || null,
        contact_email: form.contact_email || null,
        jls_quotation_number: form.jls_quotation_number || null,
        dma_phase: null,
        document_url: form.document_url || null,
        notes: form.notes || null
      };
      if (editing) {
        const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Gate pass updated");
      } else {
        const { error } = await supabase.from("permits").insert([{ ...payload, created_by: userId }]);
        if (error) throw error;
        toast.success("Gate pass created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  const attachmentName = form.document_url ? decodeURIComponent(form.document_url.split("/").pop() ?? "attachment") : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-2xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
      editing ? "Edit" : "New",
      " Gate Pass"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Visitor Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            className: "h-8 text-xs",
            value: form.holder_name ?? "",
            onChange: (e) => set("holder_name", e.target.value),
            placeholder: "Full name"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Visitor Email" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            className: "h-8 text-xs",
            type: "email",
            value: form.contact_email ?? "",
            onChange: (e) => set("contact_email", e.target.value),
            placeholder: "visitor@example.com"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 sm:col-span-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Purpose of Visit" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            className: "h-8 text-xs",
            value: form.notes ?? "",
            onChange: (e) => set("notes", e.target.value),
            placeholder: "Reason for access"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Access Zone / Gate" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: form.issuing_authority ?? "__none",
            onValueChange: (v) => set("issuing_authority", v === "__none" ? null : v),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select zone" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— Select —" }),
                ACCESS_ZONES.map((z) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: z, children: z }, z))
              ] })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Yacht (Associated)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: form.yacht_id ?? "__none",
            onValueChange: (v) => set("yacht_id", v === "__none" ? null : v),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select yacht" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
              ] })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Entry Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            className: "h-8 text-xs",
            type: "date",
            value: form.issue_date ?? "",
            onChange: (e) => set("issue_date", e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Expiry / Exit Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            className: "h-8 text-xs",
            type: "date",
            value: form.expiry_date ?? "",
            onChange: (e) => set("expiry_date", e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Quotation / Ref Number" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Input,
          {
            className: "h-8 text-xs",
            value: form.jls_quotation_number ?? "",
            onChange: (e) => set("jls_quotation_number", e.target.value),
            placeholder: "JLS-XXXX"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Select,
          {
            value: form.status ?? "pending",
            onValueChange: (v) => set("status", v),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: PERMIT_STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.value, children: s.label }, s.value)) })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 sm:col-span-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Document / Attachment" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center space-y-2", children: [
          attachmentName ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-4 w-4 shrink-0 text-muted-foreground" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "a",
                {
                  href: form.document_url ?? "#",
                  target: "_blank",
                  rel: "noopener noreferrer",
                  className: "truncate text-primary hover:underline",
                  children: attachmentName
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => set("document_url", null),
                className: "ml-2 text-muted-foreground hover:text-destructive",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" })
              }
            )
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-muted-foreground", children: [
            "There is ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-warning", children: "nothing" }),
            " attached."
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: fileRef,
              type: "file",
              className: "hidden",
              onChange: handleFileChange
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => fileRef.current?.click(),
              disabled: uploading,
              className: "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition",
              children: [
                uploading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-4 w-4" }),
                uploading ? "Uploading…" : "Attach file"
              ]
            }
          )
        ] })
      ] })
    ] }),
    form.contact_email && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { className: "h-3.5 w-3.5 shrink-0 mt-0.5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "Email notifications are not yet configured. The gate pass will be saved but",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: form.contact_email }),
        " will not receive an automated email."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogFooter, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Button,
      {
        type: "button",
        disabled: busy,
        onClick: doSave,
        className: "gap-1.5",
        children: [
          busy ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
          editing ? "Save Changes" : "Create Gate Pass"
        ]
      }
    ) })
  ] });
}
function PermitsPage({ permitType }) {
  const meta = PERMIT_META[permitType];
  const { user } = useAuth();
  const [rows, setRows] = reactExports.useState([]);
  const [yachts, setYachts] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [q, setQ] = reactExports.useState("");
  const [editing, setEditing] = reactExports.useState(null);
  const [open, setOpen] = reactExports.useState(false);
  const [deleteTarget, setDeleteTarget] = reactExports.useState(null);
  reactExports.useEffect(() => {
    void load();
    void loadYachts();
  }, [permitType]);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("permits").select("*").eq("permit_type", permitType).order("expiry_date", { ascending: true, nullsFirst: false });
    if (error) toast.error(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }
  async function loadYachts() {
    const { data } = await supabase.from("yachts").select("id, vessel_name").order("vessel_name");
    setYachts(data ?? []);
  }
  function startNew() {
    setEditing(null);
    setOpen(true);
  }
  function startEdit(p) {
    setEditing(p);
    setOpen(true);
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("permits").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      void load();
    }
    setDeleteTarget(null);
  }
  const filtered = reactExports.useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    const yachtMap = new Map(yachts.map((y) => [y.id, y.vessel_name.toLowerCase()]));
    return rows.filter(
      (r) => [r.permit_number, r.holder_name, r.issuing_authority, r.notes, r.dma_phase, r.yacht_id ? yachtMap.get(r.yacht_id) ?? "" : ""].some((v) => String(v ?? "").toLowerCase().includes(s))
    );
  }, [rows, q, yachts]);
  const stats = reactExports.useMemo(() => {
    const total = rows.length;
    let active = 0, expiring = 0, expired = 0;
    for (const r of rows) {
      const d = daysUntil(r.expiry_date);
      if (r.status === "expired" || d !== null && d < 0) expired++;
      else if (d !== null && d <= 30) expiring++;
      else if (r.status === "active") active++;
    }
    return { total, active, expiring, expired };
  }, [rows]);
  const yachtName = (id) => yachts.find((y) => y.id === id)?.vessel_name ?? "—";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-6 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: meta.breadcrumb }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-xl font-semibold tracking-tight", children: meta.label })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search…", className: "h-9 w-64 pl-8" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: setOpen, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: startNew, className: "h-9 gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3.5 w-3.5" }),
            " New permit"
          ] }) }),
          permitType === "sanitation" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            SanitationDialog,
            {
              yachts,
              editing,
              userId: user?.id,
              onSaved: () => {
                setOpen(false);
                void load();
              }
            }
          ) : permitType === "exit_entry" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            ExitEntryDialog,
            {
              yachts,
              editing,
              userId: user?.id,
              onSaved: () => {
                setOpen(false);
                void load();
              }
            }
          ) : permitType === "cruising_tenders" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            CruisingTendersDialog,
            {
              yachts,
              editing,
              userId: user?.id,
              onSaved: () => {
                setOpen(false);
                void load();
              }
            }
          ) : permitType === "cruising_mothership" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            CruisingMothershipDialog,
            {
              yachts,
              editing,
              userId: user?.id,
              onSaved: () => {
                setOpen(false);
                void load();
              }
            }
          ) : permitType === "tdra" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            TdraDialog,
            {
              yachts,
              editing,
              userId: user?.id,
              onSaved: () => {
                setOpen(false);
                void load();
              }
            }
          ) : permitType === "dma" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            DmaDialog,
            {
              yachts,
              editing,
              userId: user?.id,
              onSaved: () => {
                setOpen(false);
                void load();
              }
            }
          ) : permitType === "gate_pass" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            GatePassDialog,
            {
              yachts,
              editing,
              userId: user?.id,
              onSaved: () => {
                setOpen(false);
                void load();
              }
            }
          ) : permitType === "navigation_license" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            NavigationLicenseDialog,
            {
              yachts,
              editing,
              userId: user?.id,
              onSaved: () => {
                setOpen(false);
                void load();
              }
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
            PermitDialog,
            {
              permitType,
              yachts,
              editing,
              userId: user?.id,
              onSaved: () => {
                setOpen(false);
                void load();
              }
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-3 px-6 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Total", value: stats.total, icon: FileCheckCorner, accent: "text-primary" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Active", value: stats.active, icon: CircleCheck, accent: "text-success" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Expiring ≤ 30d", value: stats.expiring, icon: Clock, accent: "text-warning" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Expired", value: stats.expired, icon: TriangleAlert, accent: "text-destructive" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto px-6 pb-6", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center text-sm text-muted-foreground", children: "Loading…" }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(FileCheckCorner, { className: "h-10 w-10 text-muted-foreground/60" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "mt-3 font-display text-lg font-semibold", children: [
        "No ",
        meta.label.toLowerCase(),
        " yet"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "Create the first record to get started." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: startNew, className: "mt-4 gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
        " New permit"
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto rounded-lg border border-border bg-card", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-card/95 backdrop-blur", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Permit #" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Yacht" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Holder" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Authority" }),
        meta.showDmaPhase && /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Phase" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Issued" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Expiry" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-right font-medium", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: filtered.map((r) => {
        const days = daysUntil(r.expiry_date);
        const variant = expiryVariant(days);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border/50 transition hover:bg-accent/30", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 font-medium tabular-nums", children: r.permit_number ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: yachtName(r.yacht_id) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: r.holder_name ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: r.issuing_authority ?? "—" }),
          meta.showDmaPhase && /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: r.dma_phase ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 tabular-nums", children: r.issue_date ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 tabular-nums", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: r.expiry_date ?? "—" }),
            days !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn("pill", variant), children: days < 0 ? `${Math.abs(days)}d ago` : `${days}d` })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusPill, { status: r.status }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-right", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "inline-flex gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", variant: "ghost", className: "h-7 w-7 p-0", onClick: () => startEdit(r), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", variant: "ghost", className: "h-7 w-7 p-0 text-destructive/70 hover:text-destructive", onClick: () => setDeleteTarget(r), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }) })
          ] }) })
        ] }, r.id);
      }) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: !!deleteTarget, onOpenChange: (o) => !o && setDeleteTarget(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: "Delete permit?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogDescription, { children: [
          deleteTarget?.permit_number ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            "Permit ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: deleteTarget.permit_number }),
            " will be permanently removed."
          ] }) : "This permit will be permanently removed.",
          " ",
          "This cannot be undone."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogCancel, { children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          AlertDialogAction,
          {
            onClick: confirmDelete,
            className: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            children: "Delete"
          }
        )
      ] })
    ] }) })
  ] });
}
function Stat({ label, value, icon: Icon, accent }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-wider text-muted-foreground", children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `font-display text-2xl font-bold tabular-nums ${accent}`, children: value })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: `h-7 w-7 ${accent} opacity-60` })
  ] });
}
function PermitDialog({
  permitType,
  yachts,
  editing,
  userId,
  onSaved
}) {
  const meta = PERMIT_META[permitType];
  const [busy, setBusy] = reactExports.useState(false);
  const [form, setForm] = reactExports.useState(() => editing ?? { permit_type: permitType, status: "pending" });
  reactExports.useEffect(() => {
    setForm(editing ?? { permit_type: permitType, status: "pending" });
  }, [editing, permitType]);
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function save(e) {
    e.preventDefault();
    if (!userId) return;
    setBusy(true);
    try {
      const payload = {
        permit_type: permitType,
        yacht_id: form.yacht_id ?? null,
        permit_number: form.permit_number || null,
        status: form.status ?? "pending",
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        issuing_authority: form.issuing_authority || null,
        holder_name: form.holder_name || null,
        dma_phase: meta.showDmaPhase ? form.dma_phase || null : null,
        document_url: form.document_url || null,
        notes: form.notes || null
      };
      if (editing) {
        const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Permit updated");
      } else {
        const { error } = await supabase.from("permits").insert([{ ...payload, created_by: userId }]);
        if (error) throw error;
        toast.success("Permit created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-2xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
      editing ? "Edit permit" : "New permit",
      " · ",
      meta.label
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: save, className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Yacht" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.yacht_id ?? "__none", onValueChange: (v) => set("yacht_id", v === "__none" ? null : v), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select yacht" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
            yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Permit Number" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.permit_number ?? "", onChange: (e) => set("permit_number", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Holder Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.holder_name ?? "", onChange: (e) => set("holder_name", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Issuing Authority" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.issuing_authority ?? "", onChange: (e) => set("issuing_authority", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Issue Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.issue_date ?? "", onChange: (e) => set("issue_date", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Expiry Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.expiry_date ?? "", onChange: (e) => set("expiry_date", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status ?? "pending", onValueChange: (v) => set("status", v), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: PERMIT_STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.value, children: s.label }, s.value)) })
        ] })
      ] }),
      meta.showDmaPhase && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "DMA Phase" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.dma_phase ?? "__none", onValueChange: (v) => set("dma_phase", v === "__none" ? null : v), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select phase" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
            DMA_PHASES.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p, children: p }, p))
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 sm:col-span-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Document URL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.document_url ?? "", onChange: (e) => set("document_url", e.target.value), placeholder: "https://…" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 sm:col-span-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Notes" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { rows: 3, value: form.notes ?? "", onChange: (e) => set("notes", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogFooter, { className: "sm:col-span-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", disabled: busy, children: busy ? "Saving…" : editing ? "Save changes" : "Create permit" }) })
    ] })
  ] });
}
export {
  PermitsPage as P
};
