-- Guides — department-organised, in-app-editable reference content (markdown).
-- Surfaced via a "Guides" sidebar group with one item per department.

create table if not exists public.guides (
  id          uuid        primary key default gen_random_uuid(),
  department  text        not null,
  category    text,
  slug        text        not null unique,
  title       text        not null,
  summary     text,
  body        text        not null default '',
  sort_order  int         not null default 0,
  published   boolean     not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists guides_department_idx on public.guides (department, sort_order);

alter table public.guides enable row level security;

drop policy if exists "Authenticated users can manage guides" on public.guides;
create policy "Authenticated users can manage guides"
  on public.guides for all
  using (auth.role() = 'authenticated');

drop trigger if exists guides_updated_at on public.guides;
create trigger guides_updated_at
  before update on public.guides
  for each row execute function public.set_updated_at();

-- Seed: Digital Document Guide (Crew & Immigration → Visas)
insert into public.guides (department, category, slug, title, summary, body, sort_order)
values (
  'Crew & Immigration', 'Visas', 'digital-document-guide',
  'Digital Document Guide',
  'Government criteria every digital document must meet — passport, seaman discharge book and photo specifications.',
  E'Each digital document must meet the following government criteria.\n\n'
  '## 1. Passport & Seaman Discharge Book\n\n'
  '- The document must be scanned or photographed on a **dark, flat surface**.\n'
  '- The document should appear flat, **without any visible folds or creases**.\n'
  '- All **four edges** of the document must be correct — make sure that no signatures, digits, or seals are cut off.\n'
  '- Any words and numbers on the document should be **clear and readable**.\n'
  '- Should be **sharp (not blurry)**, and without any glare.\n'
  '- The document should be scanned **in colour** so every element is visible and clear.\n'
  '- Acceptable document file format is **.jpg**.\n\n'
  '## 2. Photo\n\n'
  '- Photo size is **35 mm × 45 mm** (width × height).\n'
  '- Face size is **31 mm × 36 mm**.\n'
  '- The head must be shown in full and **centred** in the frame.\n'
  '- Photo should be **in colour**.\n'
  '- Background is **plain, white** coloured.\n'
  '- Should be **sharp (not blurry)**, and without any glare.\n'
  '- Must be a true likeness, natural representation, and **unaltered by computer software**.\n'
  '- Recent photograph — **not more than 6 months old** at the date of application.\n'
  '- **No shadow or reflection** on face or background.\n'
  '- Head facing forward, **not tilted**; shoulders straight.\n'
  '- **No head gear** except for religious reasons (covering must be plain and contrast with the background).\n'
  '- **No accessories** such as eye glasses; face must be fully visible.\n'
  '- **Neutral expression**, mouth closed.\n',
  0
)
on conflict (slug) do nothing;
