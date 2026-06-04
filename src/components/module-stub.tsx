/**
 * Generic placeholder for modules that are in the roadmap but not yet built.
 * Shows module identity, description, and planned features.
 */
import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

interface ModuleStubProps {
  icon: ReactNode;
  name: string;
  tagline: string;
  description: string;
  phase?: string;
  features: string[];
  accentColor?: string; // tailwind color class e.g. "text-amber-400"
}

export function ModuleStub({
  icon,
  name,
  tagline,
  description,
  phase,
  features,
  accentColor = "text-primary",
}: ModuleStubProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className={`mb-4 ${accentColor} opacity-60`} style={{ fontSize: 48 }}>
          {icon}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <h1 className={`font-display text-2xl font-bold tracking-tight ${accentColor}`}>{name}</h1>
          {phase && (
            <Badge variant="outline" className="text-xs border-primary/40 text-primary/70">
              {phase}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground/80 italic mb-1">{tagline}</p>
        <p className="text-sm text-muted-foreground max-w-md mb-8">{description}</p>

        <div className="w-full max-w-lg rounded-xl border border-border bg-card/60 p-5 text-left">
          <div className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">
            Planned Features
          </div>
          <ul className="space-y-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${accentColor.replace("text-", "bg-")} opacity-60`} />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-xs text-muted-foreground/40">
          This module is on the Aquila One roadmap and will be activated in a future phase.
        </p>
      </div>
    </div>
  );
}
