import { createFileRoute } from "@tanstack/react-router";
import { QbExcelImportPage } from "@/components/qb/excel-import-page";

export const Route = createFileRoute("/_app/qb-import")({
  component: QbExcelImportPage,
  head: () => ({ meta: [{ title: "QuickBooks Excel Import — Polaris" }] }),
});
