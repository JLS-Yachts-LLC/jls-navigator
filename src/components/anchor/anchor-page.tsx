import { useState } from "react";
import { FileSignature, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { EsignPage } from "@/components/esign/esign-page";
import { EsignDetailPage } from "@/components/esign/esign-detail-page";
import { FormsPage } from "@/components/anchor/forms-page";
import { SignatoriesPage } from "@/components/anchor/signatories-page";
import { PenLine } from "lucide-react";

/** Anchor — Documents (e-Sign) + Digital Forms + Signatories, as tabs. */
const TABS = [
  { key: "documents", label: "Documents", icon: FileSignature },
  { key: "forms", label: "Forms", icon: FileText },
  { key: "signatories", label: "Signatories", icon: PenLine },
] as const;

export function AnchorPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("documents");
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  // Document detail renders INLINE (stays in the Beta view instead of routing away).
  if (openDocId) {
    return (
      <div className="flex h-full flex-col">
        <EsignDetailPage documentId={openDocId} onBack={() => setOpenDocId(null)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border/60 bg-card/30 px-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "documents" ? <EsignPage onOpenDocument={setOpenDocId} /> : tab === "signatories" ? <SignatoriesPage /> : <FormsPage />}
      </div>
    </div>
  );
}

export default AnchorPage;
