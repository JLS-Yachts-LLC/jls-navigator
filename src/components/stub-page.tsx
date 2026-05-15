import { Construction } from "lucide-react";

export function StubPage({ title, breadcrumb, description }: { title: string; breadcrumb: string; description?: string }) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/40 px-6 py-3">
        <div className="text-xs text-muted-foreground">{breadcrumb}</div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
      </header>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Construction className="h-7 w-7" />
          </div>
          <h2 className="font-display text-lg font-semibold">Coming soon</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {description ?? `The ${title} module is being prepared.`}
          </p>
        </div>
      </div>
    </div>
  );
}
