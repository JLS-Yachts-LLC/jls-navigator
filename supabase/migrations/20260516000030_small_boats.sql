-- Small Boat Registration table
-- Columns derived from the SharePoint list used by JLS Port Operations

create table if not exists public.small_boats (
  id                           uuid primary key default gen_random_uuid(),

  -- Core registration info
  boat_name                    text not null,
  status                       text,         -- 'Registered', 'Working on it', 'Pending', etc.
  reg_type                     text,         -- 'New Reg Dubai Pleasure Above 12', 'Commercial', 'Pleasure', etc.
  authority                    text,         -- 'DMA', 'FTA'
  reg_start_date               date,
  reg_end_date                 date,
  boat_type                    text,         -- 'Powerboat', 'Jet Ski', 'Sailing Yacht', 'Motor Yacht'
  reg_sub_type                 text,         -- 'New Reg', 'Reg. Renewal', 'Transfer', 'Reg. Cxl'
  eight_meters_or_below        boolean       default false,
  marine_craft_length          text,

  -- Client / login details
  client_email                 text,
  login_username               text,
  login_password               text,

  -- Commercial
  quotation_no                 text,
  signed_quote                 boolean       default false,
  quotation_approved           boolean       default false,

  -- Required documents (checklist booleans)
  doc_emirates_id              boolean       default false,
  doc_passport_copy            boolean       default false,
  doc_visa_copy                boolean       default false,
  doc_salary_certificate       boolean       default false,   -- Salary cert ≥ AED 20k
  doc_partnership_trade_license boolean      default false,
  doc_title_deed               boolean       default false,
  doc_trade_license            boolean       default false,
  doc_establishment_card       boolean       default false,
  doc_builder_certificate      boolean       default false,   -- Marine Craft Builder Certificate
  doc_proof_of_ownership       boolean       default false,
  doc_cancellation_certificate boolean       default false,   -- Marine craft cancellation cert
  doc_sale_agreement           boolean       default false,   -- Attested sale agreement
  doc_customs_clearance        boolean       default false,
  doc_tdra_license             boolean       default false,   -- TDRA Ship Station License
  doc_insurance_policy         boolean       default false,   -- 13-month insurance policy
  doc_trailer_registration     boolean       default false,
  doc_environment_certificate  boolean       default false,   -- ESMA environment specs cert
  doc_stability_booklet        boolean       default false,   -- Stability booklet (>12 pax)

  -- Workflow / inspection
  document_submission_date     date,
  inspection_date              date,
  inspection_location          text,
  pro                          text,         -- PRO name handling this
  receipts                     text,
  marine_craft_license         text,

  -- Misc
  link_to_folder               text,         -- SharePoint folder URL
  notes                        text,
  send_email                   boolean       default false,
  archive                      boolean       default false,

  created_at                   timestamptz   not null default now(),
  updated_at                   timestamptz   not null default now()
);

-- RLS
alter table public.small_boats enable row level security;

create policy "Authenticated users can manage small_boats"
  on public.small_boats
  for all
  using (auth.role() = 'authenticated');

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger small_boats_updated_at
  before update on public.small_boats
  for each row execute function public.set_updated_at();
