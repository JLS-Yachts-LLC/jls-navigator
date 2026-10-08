/**
 * Expenses & APA (On board) — the vessel's money on board.
 *
 *   Accounts  petty cash, crew cards, bank, and each charter's APA, with the
 *             balance worked out from the ledger (and a low-balance warning)
 *   Ledger    every payment, top-up and return; scan a receipt to fill it in
 *   Budget    the year's budget per category against what was spent on board,
 *             beside what JLS and Waypoint have invoiced
 *
 * Reads through RLS (vessel-scoped, also works in staff preview); writes go
 * through /api/portal/expenses. Anyone who sees Expenses records what they
 * spend and edits their own entries; the Captain, officers, purser and owner
 * (canManageMoney) open accounts, set budgets and correct anyone's entries.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import {
  Camera, CheckCircle2, CreditCard, Download, FileText, Landmark, Loader2, Paperclip, PiggyBank,
  Plus, Search, Ship, Sparkles, Trash2, Wallet, X,
} from "lucide-react";
import { AddButton, AttachedFiles, SectionCard, SectionEmpty, SectionHeader, SectionLoading, fmtDate, uploadPortalFile } from "./section-ui";
import {
  ACCOUNT_KINDS, ENTRY_KINDS, EXPENSE_CATEGORIES, MONEY_CURRENCIES, accountKindLabel, accountTotals, categoryLabel, money,
  type CashAccount, type ExpenseEntry,
} from "@/lib/portal/expenses";

const db = supabase as any;

const DEPARTMENTS: Array<[string, string]> = [
  ["galley", "Galley"], ["interior", "Interior"], ["bar", "Bar"], ["deck", "Deck"], ["engine", "Engineering"], ["safety", "Safety"], ["other", "Other"],
];
const KIND_ICON = { petty_cash: Wallet, card: CreditCard, bank: Landmark, apa: Ship } as const;

type Charter = { id: string; charterer_name: string | null; charter_ref: string | null; start_date: string | null; end_date: string | null };
type Budget = { id: string; year: number; category: string; currency: string; amount: number };

/** Call /api/portal/expenses; throws the server's message on failure. */
async function expensesRequest(params: Record<string, string>, init: RequestInit = {}) {
  const res = await portalFetch(`/api/portal/expenses?${new URLSearchParams(params)}`, {
    ...init,
    headers: typeof init.body === "string" ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

async function openPdf(url: string) {
  const res = await portalFetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "That couldn't be opened.");
  const blob = URL.createObjectURL(await res.blob());
  window.open(blob, "_blank", "noreferrer");
  setTimeout(() => URL.revokeObjectURL(blob), 60000);
}

const thisYear = () => new Date().getFullYear();

export function ExpensesSection({ yachtId, canEdit, canManage, showJlsSpend }: {
  yachtId: string; canEdit: boolean; canManage: boolean; showJlsSpend: boolean;
}) {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [charters, setCharters] = useState<Charter[]>([]);
  const [withReceipt, setWithReceipt] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"ledger" | "budget">("ledger");
  const [entryOpen, setEntryOpen] = useState<ExpenseEntry | { new: true; accountId?: string } | null>(null);
  const [accountOpen, setAccountOpen] = useState<CashAccount | "new" | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [filterAccount, setFilterAccount] = useState("all");

  const load = useCallback(async () => {
    const [a, e, b, c, f, s] = await Promise.all([
      db.from("onboard_cash_accounts").select("*").eq("yacht_id", yachtId).order("created_at"),
      db.from("onboard_expenses").select("*").eq("yacht_id", yachtId).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(5000),
      db.from("onboard_budgets").select("id, year, category, currency, amount").eq("yacht_id", yachtId),
      db.from("charter_bookings").select("id, charterer_name, charter_ref, start_date, end_date").eq("yacht_id", yachtId).order("start_date", { ascending: false, nullsFirst: false }).limit(100),
      db.from("portal_files").select("ref_id").eq("ref_table", "onboard_expenses").eq("yacht_id", yachtId).limit(10000),
      supabase.auth.getSession(),
    ]);
    setAccounts(a.data ?? []);
    setEntries(e.data ?? []);
    setBudgets(b.data ?? []);
    setCharters(c.data ?? []);
    setWithReceipt(new Set(((f.data ?? []) as any[]).map((r) => r.ref_id)));
    setMe(s.data.session?.user.id ?? null);
    setLoading(false);
  }, [yachtId]);
  useEffect(() => { void load(); }, [load]);

  const open = accounts.filter((a) => !a.archived);
  const shownAccounts = showClosed ? accounts : open;
  const charterOf = (id: string | null) => charters.find((c) => c.id === id) ?? null;

  if (loading) return <SectionLoading />;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Expenses & APA"
        subtitle="Petty cash, crew cards and charter APA — every receipt in one place, and the budget against what's spent."
        action={
          <div className="flex flex-wrap gap-2">
            {canManage && canEdit && (
              <button type="button" onClick={() => setAccountOpen("new")}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50">
                <Plus className="h-3.5 w-3.5" /> New account
              </button>
            )}
            {canEdit && open.length > 0 && <AddButton onClick={() => setEntryOpen({ new: true })}>Add expense</AddButton>}
          </div>
        }
      />

      {accounts.length === 0 ? (
        <SectionEmpty icon={PiggyBank} message={canManage && canEdit
          ? "Start by opening an account — the petty cash tin, a crew card, or a charter's APA. Then the crew can scan receipts straight into it."
          : "No accounts have been opened yet. The Captain or purser opens the petty cash and APA accounts here."} />
      ) : (
        <>
          {/* Accounts */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shownAccounts.map((a) => (
              <AccountCard key={a.id} account={a} entries={entries} charter={charterOf(a.charter_booking_id)}
                           canEdit={canEdit} canManage={canManage}
                           onAdd={() => setEntryOpen({ new: true, accountId: a.id })}
                           onEdit={() => setAccountOpen(a)}
                           onFilter={() => { setFilterAccount(a.id); setView("ledger"); }} />
            ))}
          </div>
          {accounts.some((a) => a.archived) && (
            <button type="button" onClick={() => setShowClosed((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
              {showClosed ? "Hide closed accounts" : `Show ${accounts.filter((a) => a.archived).length} closed account${accounts.filter((a) => a.archived).length === 1 ? "" : "s"}`}
            </button>
          )}

          <div className="inline-flex rounded-xl border border-border p-1 text-sm">
            {([["ledger", "Ledger"], ["budget", "Budget"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setView(k)}
                      className={cn("rounded-lg px-4 py-1.5 font-medium transition", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {l}
              </button>
            ))}
          </div>

          {view === "ledger" ? (
            <Ledger accounts={accounts} entries={entries} withReceipt={withReceipt}
                    filterAccount={filterAccount} setFilterAccount={setFilterAccount}
                    onOpen={(e) => setEntryOpen(e)} />
          ) : (
            <BudgetView accounts={accounts} entries={entries} budgets={budgets} canManage={canManage && canEdit}
                        showJlsSpend={showJlsSpend} onChanged={() => void load()} />
          )}
        </>
      )}

      {entryOpen && (
        <EntryDialog
          entry={"id" in entryOpen ? entryOpen : null}
          defaultAccountId={"new" in entryOpen ? entryOpen.accountId ?? (filterAccount !== "all" ? filterAccount : open[0]?.id) : undefined}
          accounts={"id" in entryOpen ? accounts : open}
          canEdit={canEdit && (!("id" in entryOpen) || canManage || entryOpen.created_by === me)}
          onClose={() => setEntryOpen(null)}
          onSaved={() => { setEntryOpen(null); void load(); }}
        />
      )}
      {accountOpen && (
        <AccountDialog account={accountOpen === "new" ? null : accountOpen} charters={charters}
                       hasEntries={accountOpen !== "new" && entries.some((e) => e.account_id === accountOpen.id)}
                       onClose={() => setAccountOpen(null)} onSaved={() => { setAccountOpen(null); void load(); }} />
      )}
    </div>
  );
}

// ─── Account card ────────────────────────────────────────────────────────────

function AccountCard({ account: a, entries, charter, canEdit, canManage, onAdd, onEdit, onFilter }: {
  account: CashAccount; entries: ExpenseEntry[]; charter: Charter | null; canEdit: boolean; canManage: boolean;
  onAdd: () => void; onEdit: () => void; onFilter: () => void;
}) {
  const t = accountTotals(a, entries);
  const Icon = KIND_ICON[a.kind] ?? Wallet;
  const low = a.low_balance != null && t.balance <= Number(a.low_balance);
  const apa = a.kind === "apa";
  const received = t.opening + t.moneyIn;
  const usedPct = apa && received > 0 ? Math.min(100, Math.round((t.spent / received) * 100)) : null;
  const [busy, setBusy] = useState(false);

  return (
    <SectionCard className={cn("p-4", low && "border-amber-500/40", a.archived && "opacity-60")}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onFilter} className="block max-w-full truncate text-left text-sm font-semibold hover:underline">{a.name}</button>
          <div className="truncate text-[11px] text-muted-foreground">
            {[accountKindLabel(a.kind), a.holder_name, apa && charter && (charter.charterer_name || charter.charter_ref), a.archived && "closed"].filter(Boolean).join(" · ")}
          </div>
        </div>
        {canManage && canEdit && (
          <button type="button" onClick={onEdit} className="text-[11px] text-muted-foreground hover:text-foreground">Edit</button>
        )}
      </div>
      <div className={cn("mt-3 text-[26px] leading-none tabular-nums", t.balance < 0 ? "text-red-300" : low ? "text-amber-300" : "")} style={{ fontFamily: "var(--pds-font-display)" }}>
        {money(t.balance, a.currency)}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {apa ? (t.balance >= 0 ? "APA remaining" : "Over the APA — owed by the charterer") : low ? "Running low — time for a top-up" : "Balance"}
      </div>
      {apa && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
            <div className={cn("h-full", (usedPct ?? 0) >= 90 ? "bg-amber-400" : "bg-primary")} style={{ width: `${usedPct ?? 0}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>Received {money(received, a.currency)}</span>
            <span>Spent {money(t.spent, a.currency)}{usedPct != null ? ` · ${usedPct}%` : ""}</span>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {canEdit && !a.archived && (
          <button type="button" onClick={onAdd}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium transition hover:border-primary/50">
            <Plus className="h-3 w-3" /> Add
          </button>
        )}
        <button type="button" disabled={busy}
                onClick={() => { setBusy(true); void openPdf(`/api/portal/expenses?action=apa-statement&id=${a.id}`).catch((e) => alert(e.message)).finally(() => setBusy(false)); }}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium transition hover:border-primary/50 disabled:opacity-50">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} {apa ? "APA statement" : "Statement"}
        </button>
      </div>
    </SectionCard>
  );
}

// ─── Ledger ──────────────────────────────────────────────────────────────────

function Ledger({ accounts, entries, withReceipt, filterAccount, setFilterAccount, onOpen }: {
  accounts: CashAccount[]; entries: ExpenseEntry[]; withReceipt: Set<string>;
  filterAccount: string; setFilterAccount: (v: string) => void; onOpen: (e: ExpenseEntry) => void;
}) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const acctOf = (id: string) => accounts.find((a) => a.id === id);

  const months = useMemo(() => {
    const set = new Set(entries.map((e) => e.entry_date.slice(0, 7)));
    set.add(new Date().toISOString().slice(0, 7));
    return [...set].sort().reverse();
  }, [entries]);

  const rows = entries.filter((e) => {
    if (filterAccount !== "all" && e.account_id !== filterAccount) return false;
    if (month !== "all" && !e.entry_date.startsWith(month)) return false;
    if (category !== "all" && (e.category ?? "") !== category) return false;
    const q = search.trim().toLowerCase();
    if (q && ![e.supplier, e.description, e.reference, e.created_by_name].filter(Boolean).join(" ").toLowerCase().includes(q)) return false;
    return true;
  });

  // Totals per currency for what's shown.
  const totals = new Map<string, { spent: number; moneyIn: number }>();
  for (const e of rows) {
    const ccy = acctOf(e.account_id)?.currency ?? "EUR";
    const t = totals.get(ccy) ?? { spent: 0, moneyIn: 0 };
    if (e.kind === "funds_in") t.moneyIn += Number(e.amount); else t.spent += Number(e.amount);
    totals.set(ccy, t);
  }
  const byCat = new Map<string, number>();
  for (const e of rows) if (e.kind === "expense") byCat.set(e.category ?? "", (byCat.get(e.category ?? "") ?? 0) + Number(e.amount));
  const singleCcy = totals.size === 1 ? [...totals.keys()][0] : null;

  const selectCls = "rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className={selectCls} aria-label="Account">
          <option value="all">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? " (closed)" : ""}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls} aria-label="Month">
          <option value="all">All dates</option>
          {months.map((m) => <option key={m} value={m}>{new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls} aria-label="Category">
          <option value="all">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Supplier, item, who…"
                 className="w-full rounded-xl border border-border bg-background/50 py-2 pl-8 pr-3 text-sm outline-none focus:border-primary/60" />
        </div>
      </div>

      {totals.size > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[...totals.entries()].map(([ccy, t]) => (
            <span key={ccy}><span className="text-muted-foreground">Spent </span><b className="tabular-nums">{money(t.spent, ccy)}</b>
              {t.moneyIn > 0 && <><span className="text-muted-foreground"> · in </span><span className="tabular-nums text-emerald-300">{money(t.moneyIn, ccy)}</span></>}</span>
          ))}
        </div>
      )}
      {singleCcy && byCat.size > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setCategory(k || "all")}
                    className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
              {categoryLabel(k || null)} · {money(v, singleCcy)}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <SectionCard className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing recorded for this selection.</SectionCard>
      ) : (
        <SectionCard className="divide-y divide-border/60 overflow-hidden">
          {rows.slice(0, 400).map((e) => {
            const a = acctOf(e.account_id);
            const out = e.kind !== "funds_in";
            return (
              <button key={e.id} type="button" onClick={() => onOpen(e)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-background/40">
                <div className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">{new Date(`${e.entry_date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {e.supplier || e.description || (e.kind === "funds_in" ? "Money in" : e.kind === "return" ? "Returned" : "Expense")}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {[e.kind === "expense" ? categoryLabel(e.category) : ENTRY_KINDS.find((k) => k.key === e.kind)?.label,
                      e.supplier && e.description, a?.name, e.created_by_name,
                      e.original_amount && e.original_currency && `paid ${e.original_currency} ${Number(e.original_amount).toLocaleString("en-GB")}`]
                      .filter(Boolean).join(" · ")}
                  </div>
                </div>
                {withReceipt.has(e.id) && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Has a receipt" />}
                {e.receipt_scanned && <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-label="Read from the receipt" />}
                <div className={cn("shrink-0 text-right text-sm font-semibold tabular-nums", out ? "" : "text-emerald-300")}>
                  {out ? "−" : "+"}{money(Number(e.amount), a?.currency ?? "")}
                </div>
              </button>
            );
          })}
          {rows.length > 400 && <div className="px-3 py-2 text-[11px] text-muted-foreground">Showing the latest 400 — narrow the dates to see more.</div>}
        </SectionCard>
      )}
    </div>
  );
}

// ─── Budget ──────────────────────────────────────────────────────────────────

function BudgetView({ accounts, entries, budgets, canManage, showJlsSpend, onChanged }: {
  accounts: CashAccount[]; entries: ExpenseEntry[]; budgets: Budget[]; canManage: boolean; showJlsSpend: boolean; onChanged: () => void;
}) {
  const [year, setYear] = useState(thisYear());
  // The budget's currency: the one most of the money on board is kept in.
  const defaultCcy = useMemo(() => {
    const count = new Map<string, number>();
    for (const a of accounts) count.set(a.currency, (count.get(a.currency) ?? 0) + 1);
    const fromBudgets = budgets.find((b) => b.year === year)?.currency;
    return fromBudgets ?? [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "EUR";
  }, [accounts, budgets, year]);
  const [ccy, setCcy] = useState(defaultCcy);
  useEffect(() => setCcy(defaultCcy), [defaultCcy]);
  const [jls, setJls] = useState<Map<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // What JLS and Waypoint invoiced the vessel this year (from QuickBooks).
  useEffect(() => {
    if (!showJlsSpend) return;
    void portalFetch("/api/portal/finance").then(async (r) => {
      if (!r.ok) return;
      const j = await r.json();
      const m = new Map<string, number>();
      for (const i of j.invoices ?? []) if (String(i.date ?? "").startsWith(String(year))) m.set(i.currency, (m.get(i.currency) ?? 0) + Number(i.total || 0));
      setJls(m);
    }).catch(() => {});
  }, [showJlsSpend, year]);

  const ccyAccounts = new Set(accounts.filter((a) => a.currency === ccy).map((a) => a.id));
  const spentBy = new Map<string, number>();
  let otherCcy = 0;
  for (const e of entries) {
    if (e.kind !== "expense" || !e.entry_date.startsWith(String(year))) continue;
    if (!ccyAccounts.has(e.account_id)) { otherCcy++; continue; }
    spentBy.set(e.category ?? "other", (spentBy.get(e.category ?? "other") ?? 0) + Number(e.amount));
  }
  const budgetOf = (cat: string) => budgets.find((b) => b.year === year && b.category === cat && b.currency === ccy);
  const totalBudget = EXPENSE_CATEGORIES.reduce((s, c) => s + Number(budgetOf(c.key)?.amount ?? 0), 0);
  const totalSpent = [...spentBy.values()].reduce((s, n) => s + n, 0);
  const years = [...new Set([thisYear() - 1, thisYear(), thisYear() + 1, ...budgets.map((b) => b.year)])].sort();

  const save = async (category: string, raw: string) => {
    const current = budgetOf(category);
    const value = raw.trim() === "" ? null : Number(raw.replace(/,/g, ""));
    if (value != null && (!Number.isFinite(value) || value < 0)) { setError("Enter a budget as a number"); return; }
    if ((current?.amount ?? null) === value) return;
    setError(null);
    try { await expensesRequest({ kind: "budget" }, { method: "POST", body: JSON.stringify({ year, category, currency: ccy, amount: value }) }); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the budget"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none" aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={ccy} onChange={(e) => setCcy(e.target.value)} className="rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none" aria-label="Currency">
          {MONEY_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">
          {totalBudget ? <>Spent <b className="text-foreground">{money(totalSpent, ccy)}</b> of {money(totalBudget, ccy)} ({Math.round((totalSpent / totalBudget) * 100)}%)</> : canManage ? "Type a budget against each category — it saves as you go." : "No budget set for this year."}
        </span>
      </div>
      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}

      <SectionCard className="overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-x-3 border-b border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Category</span><span className="text-right">Budget</span><span className="text-right">Spent on board</span><span>Used</span>
        </div>
        {EXPENSE_CATEGORIES.map((c) => {
          const b = budgetOf(c.key);
          const spent = spentBy.get(c.key) ?? 0;
          const pct = b && Number(b.amount) > 0 ? Math.round((spent / Number(b.amount)) * 100) : null;
          return (
            <div key={c.key} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-x-3 border-b border-border/40 px-3 py-2 last:border-0">
              <span className="truncate text-sm" title={c.hint}>{c.label}</span>
              {canManage ? (
                <input key={`${year}-${ccy}-${b?.amount ?? ""}`} defaultValue={b ? String(b.amount) : ""} inputMode="decimal" placeholder="—"
                       onBlur={(e) => void save(c.key, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                       className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-right text-sm tabular-nums outline-none hover:border-border focus:border-primary/60" />
              ) : (
                <span className="text-right text-sm tabular-nums">{b ? Number(b.amount).toLocaleString("en-GB") : "—"}</span>
              )}
              <span className="text-right text-sm tabular-nums">{spent ? spent.toLocaleString("en-GB", { maximumFractionDigits: 0 }) : "—"}</span>
              <span className="flex items-center gap-2">
                {pct != null ? (
                  <>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/60">
                      <span className={cn("block h-full", pct > 100 ? "bg-red-400" : pct > 85 ? "bg-amber-400" : "bg-primary")} style={{ width: `${Math.min(100, pct)}%` }} />
                    </span>
                    <span className={cn("w-10 text-right text-[11px] tabular-nums", pct > 100 ? "text-red-300" : "text-muted-foreground")}>{pct}%</span>
                  </>
                ) : <span className="text-[11px] text-muted-foreground">{spent ? "no budget" : ""}</span>}
              </span>
            </div>
          );
        })}
      </SectionCard>
      {otherCcy > 0 && <p className="text-[11px] text-muted-foreground">{otherCcy} expense{otherCcy === 1 ? "" : "s"} this year were paid from accounts in another currency — switch the currency above to see them.</p>}

      {showJlsSpend && jls && jls.size > 0 && (
        <SectionCard className="flex flex-wrap items-center gap-3 p-4">
          <FileText className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">Invoiced by JLS & Waypoint in {year}</div>
            <div className="text-xs text-muted-foreground">Agency, provisioning, chandlery and services billed to the vessel — see Invoices for the detail.</div>
          </div>
          <div className="text-right text-sm font-semibold tabular-nums">
            {[...jls.entries()].map(([c, n]) => <div key={c}>{money(n, c)}</div>)}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Entry dialog (with receipt scan) ────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60 disabled:opacity-60";

function EntryDialog({ entry, defaultAccountId, accounts, canEdit, onClose, onSaved }: {
  entry: ExpenseEntry | null; defaultAccountId?: string; accounts: CashAccount[]; canEdit: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    account_id: entry?.account_id ?? defaultAccountId ?? accounts[0]?.id ?? "",
    kind: entry?.kind ?? "expense",
    amount: entry ? String(entry.amount) : "",
    entry_date: entry?.entry_date ?? new Date().toISOString().slice(0, 10),
    supplier: entry?.supplier ?? "",
    description: entry?.description ?? "",
    category: entry?.category ?? "",
    department: entry?.department ?? "",
    vat_amount: entry?.vat_amount != null ? String(entry.vat_amount) : "",
    reference: entry?.reference ?? "",
    original_amount: entry?.original_amount != null ? String(entry.original_amount) : "",
    original_currency: entry?.original_currency ?? "",
  }));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [scanned, setScanned] = useState(entry?.receipt_scanned ?? false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const account = accounts.find((a) => a.id === form.account_id);
  const ro = !canEdit;

  /** Read the receipt and fill in the form — nothing is saved until "Save". */
  const scan = async (file: File) => {
    setReceipt(file); setScanning(true); setScanNote(null); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await portalFetch("/api/portal/expenses?action=scan", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "That receipt couldn't be read.");
      const r = body.reading as { supplier: string | null; date: string | null; total: number | null; currency: string | null; vat_amount: number | null; reference: string | null; description: string | null; category: string | null; is_receipt: boolean; legible: boolean };
      if (!r.is_receipt) { setScanNote("That doesn't look like a receipt — fill it in by hand. The photo will still be attached."); return; }
      const sameCcy = !r.currency || !account || r.currency === account.currency;
      setForm((f) => ({
        ...f,
        supplier: r.supplier ?? f.supplier,
        entry_date: r.date ?? f.entry_date,
        description: r.description ?? f.description,
        category: r.category ?? f.category,
        reference: r.reference ?? f.reference,
        vat_amount: r.vat_amount != null && sameCcy ? String(r.vat_amount) : f.vat_amount,
        amount: r.total != null && sameCcy ? String(r.total) : f.amount,
        original_amount: r.total != null && !sameCcy ? String(r.total) : f.original_amount,
        original_currency: !sameCcy && r.currency ? r.currency : f.original_currency,
      }));
      setScanned(true);
      setScanNote(!r.legible
        ? "Parts of the receipt were hard to read — check every field."
        : !sameCcy
          ? `Paid in ${r.currency} — enter what it cost in ${account?.currency} from the card statement or the rate you used.`
          : "Filled in from the receipt — check it, then save.");
    } catch (e) {
      setScanNote(e instanceof Error ? e.message : "That receipt couldn't be read — fill it in by hand.");
    } finally { setScanning(false); }
  };

  const save = async () => {
    setBusy(true); setError(null);
    const body = {
      account_id: form.account_id, kind: form.kind, amount: form.amount, entry_date: form.entry_date,
      supplier: form.supplier, description: form.description, category: form.kind === "expense" ? form.category : "",
      department: form.department, vat_amount: form.kind === "expense" ? form.vat_amount : "", reference: form.reference,
      original_amount: form.original_amount, original_currency: form.original_currency, receipt_scanned: scanned,
    };
    try {
      let id = entry?.id;
      if (entry) await expensesRequest({ kind: "entry", id: entry.id }, { method: "PATCH", body: JSON.stringify(body) });
      else id = (await expensesRequest({ kind: "entry" }, { method: "POST", body: JSON.stringify(body) })).id;
      // The receipt goes on the entry it paid for.
      if (receipt && id) {
        try { await uploadPortalFile({ target: "expense_receipt", file: receipt, id }); }
        catch (e) { alert(`Saved, but the receipt photo didn't upload: ${e instanceof Error ? e.message : "unknown error"}. Open the entry to add it again.`); }
      }
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); setBusy(false); }
  };

  const remove = async () => {
    if (!entry || !confirm("Remove this entry? This can't be undone.")) return;
    setBusy(true);
    try { await expensesRequest({ kind: "entry", id: entry.id }, { method: "DELETE" }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove it."); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{entry ? (canEdit ? "Edit entry" : "Entry") : "Add expense"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        {entry?.created_by_name && <p className="mt-0.5 text-[11px] text-muted-foreground">Recorded by {entry.created_by_name} · {fmtDate(entry.created_at)}</p>}

        {!ro && (
          <label className={cn("mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 transition hover:bg-primary/10", scanning && "pointer-events-none opacity-70")}>
            {scanning ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Camera className="h-5 w-5 text-primary" />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{scanning ? "Reading the receipt…" : receipt ? "Scan a different receipt" : "Scan receipt"}</span>
              <span className="block text-[11px] text-muted-foreground">{receipt ? receipt.name : "Take a photo or choose one — the details fill in for you"}</span>
            </span>
            <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only"
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void scan(f); }} />
          </label>
        )}
        {scanNote && <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-200"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />{scanNote}</p>}

        <div className="mt-4 inline-flex w-full rounded-xl border border-border p-1 text-sm">
          {ENTRY_KINDS.map((k) => (
            <button key={k.key} type="button" disabled={ro} onClick={() => setForm((f) => ({ ...f, kind: k.key }))}
                    className={cn("flex-1 rounded-lg px-3 py-1.5 font-medium transition", form.kind === k.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {k.key === "expense" ? "Spent" : k.key === "funds_in" ? (account?.kind === "apa" ? "APA received" : "Top-up") : "Returned"}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Account" wide>
            <select className={inputCls} value={form.account_id} onChange={set("account_id")} disabled={ro}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </Field>
          <Field label={`Amount${account ? ` (${account.currency})` : ""} *`}>
            <input className={inputCls} value={form.amount} onChange={set("amount")} inputMode="decimal" disabled={ro} placeholder="0.00" />
          </Field>
          <Field label="Date">
            <input type="date" className={inputCls} value={form.entry_date} onChange={set("entry_date")} disabled={ro} />
          </Field>
          <Field label={form.kind === "funds_in" ? "From" : form.kind === "return" ? "Returned to" : "Supplier"} wide>
            <input className={inputCls} value={form.supplier} onChange={set("supplier")} disabled={ro} maxLength={160}
                   placeholder={form.kind === "expense" ? "e.g. Carrefour Marina Mall" : form.kind === "funds_in" ? "e.g. Charterer, Management company" : "e.g. Charterer"} />
          </Field>
          {form.kind === "expense" && (
            <>
              <Field label="Category">
                <select className={inputCls} value={form.category} onChange={set("category")} disabled={ro}>
                  <option value="">—</option>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Department">
                <select className={inputCls} value={form.department} onChange={set("department")} disabled={ro}>
                  <option value="">—</option>
                  {DEPARTMENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="What it was for" wide>
            <input className={inputCls} value={form.description} onChange={set("description")} disabled={ro} maxLength={500} placeholder="e.g. Fresh fish and vegetables for the charter" />
          </Field>
          {form.kind === "expense" && (
            <Field label="VAT included">
              <input className={inputCls} value={form.vat_amount} onChange={set("vat_amount")} inputMode="decimal" disabled={ro} placeholder="—" />
            </Field>
          )}
          <Field label="Receipt / ref no.">
            <input className={inputCls} value={form.reference} onChange={set("reference")} disabled={ro} maxLength={80} />
          </Field>
          {(form.original_amount || form.original_currency) ? (
            <>
              <Field label="Paid (other currency)">
                <input className={inputCls} value={form.original_amount} onChange={set("original_amount")} inputMode="decimal" disabled={ro} />
              </Field>
              <Field label="Currency paid in">
                <input className={inputCls} value={form.original_currency} onChange={set("original_currency")} disabled={ro} maxLength={3} placeholder="USD" />
              </Field>
            </>
          ) : !ro ? (
            <button type="button" onClick={() => setForm((f) => ({ ...f, original_currency: account?.currency === "USD" ? "EUR" : "USD" }))}
                    className="col-span-2 text-left text-[11px] text-muted-foreground hover:text-foreground">+ Paid in a different currency?</button>
          ) : null}
        </div>

        {entry && (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Receipt</div>
            <AttachedFiles refTable="onboard_expenses" refId={entry.id} target="expense_receipt" canEdit={canEdit} accept="image/*,application/pdf" label="Add receipt" />
          </div>
        )}

        {error && <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}

        {canEdit && (
          <div className="mt-5 flex gap-2">
            {entry && (
              <button type="button" onClick={() => void remove()} disabled={busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            )}
            <button type="button" onClick={() => void save()} disabled={busy || scanning || !form.amount || !form.account_id}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {entry ? "Save changes" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Account dialog ──────────────────────────────────────────────────────────

function AccountDialog({ account, charters, hasEntries, onClose, onSaved }: {
  account: CashAccount | null; charters: Charter[]; hasEntries: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    name: account?.name ?? "",
    kind: account?.kind ?? "petty_cash",
    currency: account?.currency ?? "EUR",
    holder_name: account?.holder_name ?? "",
    opening_balance: account ? String(account.opening_balance ?? 0) : "0",
    low_balance: account?.low_balance != null ? String(account.low_balance) : "",
    charter_booking_id: account?.charter_booking_id ?? "",
    notes: account?.notes ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // An APA named after its charter, unless they've typed a name.
  const pickCharter = (id: string) => {
    const c = charters.find((x) => x.id === id);
    setForm((f) => ({ ...f, charter_booking_id: id, name: f.name || (c ? `APA — ${c.charterer_name || c.charter_ref || "charter"}` : f.name) }));
  };

  const submit = async (extra: Record<string, unknown> = {}) => {
    setBusy(true); setError(null);
    const body = { ...form, charter_booking_id: form.kind === "apa" ? form.charter_booking_id : "", ...extra };
    try {
      if (account) await expensesRequest({ kind: "account", id: account.id }, { method: "PATCH", body: JSON.stringify(body) });
      else await expensesRequest({ kind: "account" }, { method: "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); setBusy(false); }
  };

  const remove = async () => {
    if (!account || !confirm(`Remove "${account.name}"?`)) return;
    setBusy(true);
    try { await expensesRequest({ kind: "account", id: account.id }, { method: "DELETE" }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove it."); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{account ? `Edit ${account.name}` : "New account"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Type">
            <select className={inputCls} value={form.kind} onChange={set("kind")}>
              {ACCOUNT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </Field>
          <Field label="Currency">
            <select className={inputCls} value={form.currency} onChange={set("currency")} disabled={hasEntries}>
              {MONEY_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          {form.kind === "apa" && (
            <Field label="Charter" wide>
              <select className={inputCls} value={form.charter_booking_id} onChange={(e) => pickCharter(e.target.value)}>
                <option value="">— not linked —</option>
                {charters.map((c) => <option key={c.id} value={c.id}>{c.charterer_name || c.charter_ref || "Charter"}{c.start_date ? ` · ${fmtDate(c.start_date)}` : ""}</option>)}
              </select>
            </Field>
          )}
          <Field label="Name *" wide>
            <input className={inputCls} value={form.name} onChange={set("name")} maxLength={120}
                   placeholder={form.kind === "apa" ? "APA — Smith party, July" : form.kind === "card" ? "Chief Stew's card" : "Petty cash — Captain"} />
          </Field>
          <Field label="Held by">
            <input className={inputCls} value={form.holder_name} onChange={set("holder_name")} maxLength={120} placeholder="e.g. Captain" />
          </Field>
          <Field label={form.kind === "apa" ? "APA already received" : "Opening balance"}>
            <input className={inputCls} value={form.opening_balance} onChange={set("opening_balance")} inputMode="decimal" />
          </Field>
          {form.kind !== "apa" && (
            <Field label="Warn when below">
              <input className={inputCls} value={form.low_balance} onChange={set("low_balance")} inputMode="decimal" placeholder="—" />
            </Field>
          )}
          <Field label="Notes" wide>
            <textarea className={cn(inputCls, "min-h-[70px]")} value={form.notes} onChange={set("notes")} maxLength={2000} />
          </Field>
        </div>
        {hasEntries && <p className="mt-2 text-[11px] text-muted-foreground">The currency is fixed once money has been recorded.</p>}
        {error && <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="mt-5 flex flex-wrap gap-2">
          {account && !hasEntries && (
            <button type="button" onClick={() => void remove()} disabled={busy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Remove
            </button>
          )}
          {account && hasEntries && (
            <button type="button" onClick={() => void submit({ archived: !account.archived })} disabled={busy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50">
              {account.archived ? "Reopen" : "Close account"}
            </button>
          )}
          <button type="button" onClick={() => void submit()} disabled={busy || !form.name.trim()}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {account ? "Save changes" : "Open account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : "col-span-2 sm:col-span-1"}>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
