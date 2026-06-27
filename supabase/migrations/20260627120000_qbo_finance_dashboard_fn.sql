create or replace function public.qbo_finance_dashboard(p_year int default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with inv as (
    select * from public.qbo_invoices
    where doc_type = 'invoice'
      and (p_year is null or extract(year from txn_date) = p_year)
  )
  select jsonb_build_object(
    'invoice_count',     (select count(*) from inv),
    'invoiced_total',    coalesce((select sum(total_amt) from inv), 0),
    'outstanding_total', coalesce((select sum(balance) from inv), 0),
    'paid_total',        coalesce((select sum(total_amt - coalesce(balance,0)) from inv), 0),
    'paid_count',        (select count(*) from inv where status = 'Paid'),
    'unpaid_count',      (select count(*) from inv where status = 'Unpaid'),
    'partial_count',     (select count(*) from inv where status = 'Partial'),
    'overdue_count',     (select count(*) from inv where status = 'Overdue'),
    'overdue_total',     coalesce((select sum(balance) from inv where status = 'Overdue'), 0),
    'top_outstanding',   (select coalesce(jsonb_agg(t order by t.outstanding desc), '[]'::jsonb)
                          from (select customer_name, sum(balance) as outstanding, count(*) as invoices
                                from inv where balance > 0.005 group by customer_name
                                order by sum(balance) desc limit 8) t),
    'by_month',          (select coalesce(jsonb_agg(t order by t.m), '[]'::jsonb)
                          from (select to_char(date_trunc('month', txn_date), 'YYYY-MM') as m,
                                       sum(total_amt) as invoiced, sum(balance) as outstanding, count(*) as n
                                from inv where txn_date is not null group by 1 order by 1) t)
  );
$$;
grant execute on function public.qbo_finance_dashboard(int) to authenticated;
