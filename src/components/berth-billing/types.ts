// Agency Module — Marina Berth Billing & Revenue Management

export interface MarinaOption {
  id: string;
  name: string;
}

export interface BerthOption {
  id: string;
  marina_id: string;
  berth_number: string;
  status: BerthStatus;
  max_loa_m: number | null;
}

export interface OrganisationOption {
  org_id: string;
  name: string;
}

export type BerthStatus = "available" | "occupied" | "maintenance" | "reserved";

export type BillingFrequency = "daily" | "monthly";

export type VatTreatment = "standard" | "zero_rated" | "exempt";

export type OccupancyStatus = "occupied" | "ready_for_invoice" | "invoiced" | "closed";

export type InvoiceStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "paid"
  | "closed";

export interface DashboardRow {
  occupancy_id: string;
  vessel: string;
  client: string;
  marina: string;
  berth: string;
  port_call_id: string | null;
  arrival: string;
  departure: string | null;
  rate: number;
  billing_period: BillingFrequency;
  days_occupied: number;
  revenue_earned: number;
  invoice_raised: boolean;
  invoice_sent: boolean;
  client_paid: boolean;
  supplier_invoice_received: boolean;
  supplier_paid: boolean;
  outstanding_balance: number;
  margin: number;
  age_of_invoice_days: number | null;
  responsible_team_member: string | null;
}

export interface BillingLineRow {
  id: string;
  period_start: string;
  period_end: string;
  calculation_type: string;
  base_amount: number;
  discount_amount: number;
  vat_amount: number;
  total_amount: number;
  currency: string;
  calculated_at: string;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  status: InvoiceStatus;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  currency: string;
  created_at: string;
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  sent: "Sent",
  paid: "Paid",
  closed: "Closed",
};

export const NEXT_INVOICE_STATUS: Record<InvoiceStatus, InvoiceStatus | null> = {
  draft: "pending_approval",
  pending_approval: "approved",
  approved: "sent",
  sent: "paid",
  paid: "closed",
  closed: null,
};
