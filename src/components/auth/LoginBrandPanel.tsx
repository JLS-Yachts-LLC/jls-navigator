import { PolarisLogo } from "@/components/polaris-logo";
import { ShieldCheck, Smartphone, ClipboardList, Globe } from "lucide-react";

/** Left branding panel for the two-panel login (POLARIS_PLATFORM_UX.md §1.1). */
export function LoginBrandPanel() {
  const badges = [
    { Icon: ShieldCheck, label: "Enterprise Security", sub: "Bank-level encryption" },
    { Icon: Smartphone, label: "MFA Ready", sub: "Multi-factor authentication" },
    { Icon: ClipboardList, label: "Audit Logging", sub: "Full activity tracking" },
    { Icon: Globe, label: "Regional Redundancy", sub: "High availability" },
  ];
  return (
    <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#080D14] px-10 py-12">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_25%_20%,rgba(0,196,204,0.25),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(232,160,32,0.16),transparent_50%)]" />

      <div className="relative">
        <PolarisLogo className="w-48" />
        <p className="mt-4 text-sm text-[#3A5570]">The Operating System Behind Yacht Operations</p>
      </div>

      {/* hero band */}
      <div className="relative my-8 flex-1 rounded-xl border border-white/5 bg-gradient-to-br from-[#0D1520] via-[#0A1018] to-[#0D1A24] min-h-[240px] overflow-hidden">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_50%_120%,rgba(0,196,204,0.35),transparent_60%)]" />
        <div className="absolute bottom-6 left-6 right-6">
          <div className="font-display text-lg font-semibold text-[#E8EDF5]">350 yachts. 11 regions. One platform.</div>
          <div className="mt-1 text-xs text-[#3A5570]">Crew, immigration, logistics and finance — unified.</div>
        </div>
      </div>

      <div className="relative grid grid-cols-2 gap-4">
        {badges.map(({ Icon, label, sub }) => (
          <div key={label} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#00C4CC]" />
            <div>
              <div className="font-display text-[11px] font-semibold text-[#E8EDF5]">{label}</div>
              <div className="text-[10px] text-[#3A5570]">{sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
