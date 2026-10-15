import { useState } from "react";
import { FileSignature, FileText, FileStack, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { EsignPage } from "@/components/esign/esign-page";
import { EsignDetailPage } from "@/components/esign/esign-detail-page";
import { EsignTemplatesPage } from "@/components/esign/esign-templates-page";
import { FormsPage } from "@/components/anchor/forms-page";
import { SignatoriesPage } from "@/components/anchor/signatories-page";
import { CampaignsPage } from "@/components/anchor/campaigns/campaigns-page";
import { useCanSeeAnchorConfidential } from "@/components/anchor/confidential";
import { PenLine, Megaphone } from "lucide-react";

/**
 * Anchor — Documents (e-Sign) + Campaigns + Templates + Digital Forms + Signatories,
 * as tabs, plus Confidential (its own Documents / Templates / Signatories) for
 * admins and people with the "Anchor — Confidential" permission only. The
 * database hides confidential items from everyone else; the tab is just not shown.
 */
const TABS = [
  { key: "documents", label: "Documents", icon: FileSignature },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "templates", label: "Templates", icon: FileStack },
  { key: "forms", label: "Forms", icon: FileText },
  { key: "signatories", label: "Signatories", icon: PenLine },
  { key: "confidential", label: "Confidential", icon: Lock },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const CONFIDENTIAL_TABS = [
  { key: "documents", label: "Documents", icon: FileSignature },
  { key: "templates", label: "Templates", icon: FileStack },
  { key: "signatories", label: "Signatories", icon: PenLine },
] as const;
type ConfidentialKey = (typeof CONFIDENTIAL_TABS)[number]["key"];

export function AnchorPage() {
  const [tab, setTab] = useState<TabKey>("documents");
  const [confTab, setConfTab] = useState<ConfidentialKey>("documents");
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  // Remember the campaign being tracked, so "back" from a document returns to it.
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const canSeeConfidential = useCanSeeAnchorConfidential() === true;
  const tabs = TABS.filter((t) => t.key !== "confidential" || canSeeConfidential);
  const current: TabKey = tab === "confidential" && !canSeeConfidential ? "documents" : tab;

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
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = current === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                t.key === "confidential" && "ml-auto",
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {current === "confidential" && (
        <div className="flex items-center gap-1 border-b border-border/40 bg-muted/10 px-4">
          {CONFIDENTIAL_TABS.map((t) => {
            const Icon = t.icon;
            const on = confTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setConfTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 my-1.5 text-[13px] font-medium transition",
                  on ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Only admins and people with Anchor — Confidential access can see this
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {current === "confidential"
          ? confTab === "documents" ? <EsignPage confidential onOpenDocument={setOpenDocId} />
            : confTab === "templates" ? <EsignTemplatesPage confidential />
            : <SignatoriesPage confidential />
          : current === "documents" ? <EsignPage onOpenDocument={setOpenDocId} />
          : current === "campaigns" ? <CampaignsPage onOpenDocument={setOpenDocId} resumeCampaignId={campaignId} onDetailChange={setCampaignId} />
          : current === "templates" ? <EsignTemplatesPage />
          : current === "signatories" ? <SignatoriesPage />
          : <FormsPage />}
      </div>
    </div>
  );
}

export default AnchorPage;
