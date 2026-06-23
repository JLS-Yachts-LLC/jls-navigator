import { Phone, Mail, MessageCircle, Video } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials, mailtoHref, telHref, teamsHref, whatsappHref } from "@/lib/directory/contact-actions";
import type { StaffProfile } from "@/lib/directory/types";

export function StaffAvatar({ staff, className }: { staff: StaffProfile; className?: string }) {
  return (
    <Avatar className={cn("border border-border", className)}>
      {staff.profile_photo_url && <AvatarImage src={staff.profile_photo_url} alt={staff.full_name} />}
      <AvatarFallback className="bg-primary/15 text-primary font-medium">
        {initials(staff.preferred_name || staff.full_name)}
      </AvatarFallback>
    </Avatar>
  );
}

type ActionDef = { href: string | null; label: string; icon: typeof Phone; external?: boolean };

/** One-click contact actions — only renders channels the staff member actually has. */
export function ContactActions({ staff, size = "sm" }: { staff: StaffProfile; size?: "sm" | "md" }) {
  const actions: ActionDef[] = [
    { href: telHref(staff.direct_mobile), label: "Call", icon: Phone },
    { href: mailtoHref(staff.email), label: "Email", icon: Mail },
    { href: whatsappHref(staff.whatsapp_number), label: "WhatsApp", icon: MessageCircle, external: true },
    { href: teamsHref(staff.teams_upn), label: "Teams", icon: Video },
  ];
  const dim = size === "md" ? "h-9 px-3 text-xs" : "h-7 px-2 text-[11px]";
  const iconDim = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.map((a) => (
        <a
          key={a.label}
          href={a.href ?? undefined}
          {...(a.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          aria-disabled={!a.href}
          onClick={(e) => {
            if (!a.href) e.preventDefault();
            else e.stopPropagation();
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border font-medium transition-colors",
            dim,
            a.href
              ? "border-border text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40"
              : "cursor-not-allowed border-border/50 text-muted-foreground/40",
          )}
          title={a.href ? `${a.label} ${staff.full_name}` : `No ${a.label.toLowerCase()} on file`}
        >
          <a.icon className={iconDim} />
          {size === "md" && a.label}
        </a>
      ))}
    </div>
  );
}
