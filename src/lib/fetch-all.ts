// Supabase/PostgREST caps a single response at 1000 rows. fetchAllRows pages
// through a query so the FULL list loads regardless of size.
//
// Pass a factory that returns a FRESH query builder on each call (so .range()
// can be applied per page). Returns the same { data, error } shape as a normal
// Supabase query, so call sites can drop it in with minimal change:
//
//   const { data, error } = await fetchAllRows(() =>
//     supabase.from("permits").select("*").order("expiry_date"))
//
export async function fetchAllRows<T = any>(
  makeQuery: () => any,
  pageSize = 1000,
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}
