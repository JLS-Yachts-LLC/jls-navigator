-- QuickBooks deletions: documents deleted in QBO used to stay in the qbo_invoices
-- mirror forever (no delete handling in the sync). They are now soft-deleted —
-- kept for the audit trail, hidden from every reader by `deleted_at is null`.
-- Set by: the webhook (operation Delete), the CDC pass in the 5-min sync, and the
-- daily ID reconcile. Any later upsert of a live document clears it again.

alter table public.qbo_invoices
  add column if not exists deleted_at     timestamptz,
  add column if not exists deleted_reason text;

create index if not exists qbo_invoices_live_realm_idx
  on public.qbo_invoices (realm_id, doc_type) where deleted_at is null;

-- Sync bookkeeping for the CDC deletion pass and the reconcile report.
alter table public.qbo_sync_state
  add column if not exists last_cdc_at       timestamptz,
  add column if not exists last_reconcile_at timestamptz,
  add column if not exists last_reconcile    jsonb;

-- Finance dashboard: exclude soft-deleted documents (body otherwise unchanged).
create or replace function public.qbo_finance_dashboard__unguarded(p_year integer default null::integer, p_realm text default null::text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not (
    public.is_polaris_global_admin(auth.uid())
    or exists (
      select 1 from public.user_module_access uma
      join public.modules m on m.module_id = uma.module_id
      where uma.user_id = auth.uid()
        and m.name = 'finance'
        and coalesce(uma.active, true)
    )
  ) then
    raise exception 'Access denied: finance permission required';
  end if;

  return (
    with inv as (
      select * from public.qbo_invoices
      where doc_type = 'invoice'
        and deleted_at is null
        and (p_year is null or extract(year from txn_date) = p_year)
        and (p_realm is null or realm_id = p_realm)
    ), pay as (
      select * from public.qbo_payments
      where (p_year is null or extract(year from txn_date) = p_year)
        and (p_realm is null or realm_id = p_realm)
    )
    select jsonb_build_object(
      'invoice_count',     (select count(*) from inv),
      'invoiced_total',    coalesce((select sum(total_amt) from inv), 0),
      'outstanding_total', coalesce((select sum(balance) from inv), 0),
      'paid_total',        coalesce((select sum(total_amt - coalesce(balance,0)) from inv), 0),
      'payments_total',    coalesce((select sum(total_amt) from pay), 0),
      'payments_count',    (select count(*) from pay),
      'paid_count',        (select count(*) from inv where status = 'Paid'),
      'unpaid_count',      (select count(*) from inv where status = 'Unpaid'),
      'partial_count',     (select count(*) from inv where status = 'Partial'),
      'overdue_count',     (select count(*) from inv where status = 'Overdue'),
      'overdue_total',     coalesce((select sum(balance) from inv where status = 'Overdue'), 0),
      'top_outstanding',   (select coalesce(jsonb_agg(t order by t.outstanding desc), '[]'::jsonb)
                            from (select customer_name, sum(balance) as outstanding, count(*) as invoices
                                  from inv where balance > 0.005 group by customer_name
                                  order by sum(balance) desc limit 8) t),
      'recent_payments',   (select coalesce(jsonb_agg(t order by t.txn_date desc), '[]'::jsonb)
                            from (select customer_name, total_amt, txn_date from pay order by txn_date desc limit 8) t),
      'by_month',          (select coalesce(jsonb_agg(t order by t.m), '[]'::jsonb)
                            from (select to_char(date_trunc('month', txn_date), 'YYYY-MM') as m,
                                         sum(total_amt) as invoiced, sum(balance) as outstanding, count(*) as n
                                  from inv where txn_date is not null group by 1 order by 1) t)
    )
  );
end;
$function$;
