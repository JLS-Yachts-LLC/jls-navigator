/**
 * Who is sending, for the JLS email signature: name from user_profiles,
 * position and mobile from the person's Team Directory entry (staff_profiles,
 * matched by email). Missing pieces are simply left off the signature.
 */
import type { SignatureSender } from "@/lib/brand/jls-signature";

export async function signatureSender(sb: any, userId: string, email: string): Promise<SignatureSender> {
  const addr = (email ?? "").trim().toLowerCase();
  const [{ data: me }, { data: staff }] = await Promise.all([
    sb.from("user_profiles").select("display_name").eq("user_id", userId).maybeSingle(),
    addr
      ? sb.from("staff_profiles").select("full_name, position, direct_mobile, office_number")
          .ilike("email", addr).eq("is_active", true).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    name: me?.display_name || staff?.full_name || "Our Port & Agency Team",
    position: staff?.position ?? null,
    email: addr || null,
    phone: staff?.direct_mobile || staff?.office_number || null,
  };
}
