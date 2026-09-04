import { useState } from "react";
import { cn } from "@/lib/utils";
import { Ship, Building2, FileStack, Package } from "lucide-react";
import { ClientItemForm, InternalItemForm } from "@/components/shipsync/warehouse/forms";

type Owner = "client" | "internal";
type InternalKind = "documents" | "assets";

export function NewStorage({ onSaved }: { onSaved: () => Promise<void> }) {
  const [owner, setOwner] = useState<Owner>("client");
  const [internalKind, setInternalKind] = useState<InternalKind>("documents");
  const [key, setKey] = useState(0); // bump to reset the form after a successful save

  async function handleSaved() {
    await onSaved();
    setKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex gap-1 rounded-lg border border-border bg-card/50 p-1 w-fit">
        <button onClick={() => setOwner("client")}
          className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
            owner === "client" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <Ship className="h-3.5 w-3.5" /> Client
        </button>
        <button onClick={() => setOwner("internal")}
          className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
            owner === "internal" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <Building2 className="h-3.5 w-3.5" /> Internal
        </button>
      </div>

      {owner === "internal" && (
        <div className="flex gap-1 rounded-lg border border-border bg-card/50 p-1 w-fit">
          <button onClick={() => setInternalKind("documents")}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
              internalKind === "documents" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
            <FileStack className="h-3.5 w-3.5" /> Documents
          </button>
          <button onClick={() => setInternalKind("assets")}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
              internalKind === "assets" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
            <Package className="h-3.5 w-3.5" /> Assets
          </button>
        </div>
      )}

      {owner === "client"
        ? <ClientItemForm key={`client-${key}`} editing={null} existingContents={[]} onSaved={handleSaved} />
        : <InternalItemForm key={`internal-${internalKind}-${key}`} kind={internalKind} editing={null} existingContents={[]} onSaved={handleSaved} />}
    </div>
  );
}
