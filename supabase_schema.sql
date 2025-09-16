-- ===============================================
-- Supabase schema for Personality System (Step1-4 + Dashboard + Team)
-- ===============================================
-- Notes:
-- - Use Supabase Studio > SQL Editor to run this entire script.
-- - After running, go to Authentication > Providers and enable Email (magic link) for admin.html login.
-- - RLS (Row Level Security) is enabled; anon users can read config; authenticated users can write via policies.
-- ===============================================

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ========== Core entities ==========
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  email text unique,
  display_name text,
  created_at timestamptz default now()
);

-- Each assessment links to one logical "person" (user_id can be null for anonymous)
create table if not exists public.assessments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete set null,
  external_id text, -- you can store your own localStorage or github login id here
  note text,
  created_at timestamptz default now()
);

-- Step 1 answers (1-7 Likert, 80 items)
create table if not exists public.step1_answers (
  assessment_id uuid references public.assessments(id) on delete cascade,
  answers jsonb not null, -- { "q01": 5, "q02": 7, ... }
  struct8 jsonb,          -- optional: derived structure 8
  primary key (assessment_id)
);

-- Step 2 tags (200 tags with frequency/direction if any)
create table if not exists public.step2_tags (
  assessment_id uuid references public.assessments(id) on delete cascade,
  selected jsonb not null,       -- e.g., [{id:"T001", freq:"常态", dir:"偏多"}]
  eco16 jsonb,                   -- optional: derived ecology 16
  primary key (assessment_id)
);

-- Step 3 calibration (80 T/F mapped to struct8)
create table if not exists public.step3_calibration (
  assessment_id uuid references public.assessments(id) on delete cascade,
  answers jsonb not null,       -- { "g1_01": true, ... }
  struct8 jsonb,                -- derived
  eco16 jsonb,                  -- derived
  primary key (assessment_id)
);

-- Step 4 essence (14 dims + weights + composite)
create table if not exists public.step4_essence (
  assessment_id uuid references public.assessments(id) on delete cascade,
  labels jsonb not null,        -- selected labels per dim
  weights jsonb,                -- e.g., {preset:"general", items:[{dim:"注意力控制",w:0.08,score:71}, ...]}
  composite numeric,            -- final composite index
  primary key (assessment_id)
);

-- Dashboard merged snapshot (for quick team aggregation)
create table if not exists public.dashboard_snapshots (
  assessment_id uuid references public.assessments(id) on delete cascade,
  ecology16 jsonb not null,    -- [16]
  potential_self8 jsonb,       -- [8]
  potential_env8 jsonb,        -- [8]
  structure_self8 jsonb,       -- [8]
  structure_env8 jsonb,        -- [8]
  payload jsonb,               -- any extra your page stores (entropy, badges...)
  created_at timestamptz default now(),
  primary key (assessment_id)
);

-- Team sets: which assessments belong to a named team
create table if not exists public.teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  meta jsonb,
  created_at timestamptz default now()
);

create table if not exists public.team_members (
  team_id uuid references public.teams(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete cascade,
  role text, -- e.g., "owner", "member", "boss"
  primary key (team_id, assessment_id)
);

-- ========== Config tables (editable from admin) ==========
-- Dimensions dictionary (STRUCT/ECO/POT/TEAM/PROJ)
create table if not exists public.dimensions (
  id uuid primary key default uuid_generate_v4(),
  dtype text check (dtype in ('STRUCT','ECO','POT','TEAM','PROJ')) not null,
  key text not null,   -- machine key, e.g., "mirror", "筋骨", "信任速度"
  name text not null,  -- display name
  "order" int not null default 0,
  extra jsonb
);

-- Weights presets for structure/potential merge
create table if not exists public.weight_presets (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,     -- 'insight', 'experience', 'balanced', 'custom'
  description text,
  -- example weights: { "structure": {"essence":0.5,"env":0.2,"calib":0.3},
  --                   "potential": {"essence":0.5,"env":0.2,"calib":0.3} }
  weights jsonb not null
);

-- Questions bank for Step1 and Step3
create table if not exists public.questions (
  id uuid primary key default uuid_generate_v4(),
  step int not null check (step in (1,3)),
  code text not null,            -- e.g., "S1_Q01"
  text text not null,
  dim_key text,                  -- maps to dimensions.key
  weight numeric default 1
);

-- Tags catalog for Step2 (200 items)
create table if not exists public.tags (
  id text primary key,                -- e.g., "T001"
  category text not null,
  name text not null,
  dim_key text,                       -- optional mapping
  meta jsonb
);

-- Prototypes and industry/role target models (for team comparison)
create table if not exists public.prototypes (
  id uuid primary key default uuid_generate_v4(),
  type text check (type in ('PERSONAL','INDUSTRY_ROLE','TEAM')) not null,
  code text unique,
  name text not null,
  ecology16 jsonb, -- [16]
  potential8 jsonb, -- [8]
  structure8 jsonb, -- [8]
  weights jsonb,
  meta jsonb
);

-- ========== RLS ==========
alter table public.users enable row level security;
alter table public.assessments enable row level security;
alter table public.step1_answers enable row level security;
alter table public.step2_tags enable row level security;
alter table public.step3_calibration enable row level security;
alter table public.step4_essence enable row level security;
alter table public.dashboard_snapshots enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.dimensions enable row level security;
alter table public.weight_presets enable row level security;
alter table public.questions enable row level security;
alter table public.tags enable row level security;
alter table public.prototypes enable row level security;

-- Public read for config; write requires auth
create policy "config_read_public" on public.dimensions for select using (true);
create policy "config_read_public_w" on public.weight_presets for select using (true);
create policy "config_read_public_q" on public.questions for select using (true);
create policy "config_read_public_t" on public.tags for select using (true);
create policy "config_read_public_p" on public.prototypes for select using (true);

-- Only authenticated users can insert/update config (you can restrict further by email)
create policy "config_write_auth" on public.dimensions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "config_write_auth_w" on public.weight_presets for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "config_write_auth_q" on public.questions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "config_write_auth_t" on public.tags for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "config_write_auth_p" on public.prototypes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Assessments: anyone can create (anon), but only owner (by external_id) can read/update their own if you attach auth later
create policy "assess_insert_any" on public.assessments for insert with check (true);
create policy "assess_select_all" on public.assessments for select using (true);

-- Child tables: readable by all; insert/update allowed (for demo). You can harden later.
create policy "child_select" on public.step1_answers for select using (true);
create policy "child_insupd" on public.step1_answers for all using (true) with check (true);
create policy "child_select2" on public.step2_tags for select using (true);
create policy "child_insupd2" on public.step2_tags for all using (true) with check (true);
create policy "child_select3" on public.step3_calibration for select using (true);
create policy "child_insupd3" on public.step3_calibration for all using (true) with check (true);
create policy "child_select4" on public.step4_essence for select using (true);
create policy "child_insupd4" on public.step4_essence for all using (true) with check (true);
create policy "child_select5" on public.dashboard_snapshots for select using (true);
create policy "child_insupd5" on public.dashboard_snapshots for all using (true) with check (true);

create policy "team_select" on public.teams for select using (true);
create policy "team_write" on public.teams for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team_members_select" on public.team_members for select using (true);
create policy "team_members_write" on public.team_members for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ========== Seed minimal presets ==========
insert into public.weight_presets (code, description, weights) values
('insight', '洞察模式（本质>纠偏≥环境）', '{"structure":{"essence":0.5,"calib":0.3,"env":0.2},"potential":{"essence":0.5,"calib":0.3,"env":0.2}}')
on conflict (code) do nothing;

insert into public.weight_presets (code, description, weights) values
('experience', '体验模式（本质>环境>纠偏）', '{"structure":{"essence":0.5,"env":0.3,"calib":0.2},"potential":{"essence":0.5,"env":0.3,"calib":0.2}}')
on conflict (code) do nothing;

insert into public.weight_presets (code, description, weights) values
('balanced', '平衡模式（本质稍高，环境≈纠偏）', '{"structure":{"essence":0.45,"env":0.275,"calib":0.275},"potential":{"essence":0.45,"env":0.275,"calib":0.275}}')
on conflict (code) do nothing;

-- Example dimensions (you can adjust in admin.html)
insert into public.dimensions(dtype,key,name,"order") values
('STRUCT','mirror','镜面（觉察）',1),
('STRUCT','muscle','筋骨（闭环力）',2),
('STRUCT','water','水流（灵活）',3),
('STRUCT','flame','火焰（能量）',4),
('STRUCT','compass','指南针（方向）',5),
('STRUCT','shield','盾牌（情绪稳定）',6),
('STRUCT','bridge','桥梁（连接）',7),
('STRUCT','rock','岩石（毅力）',8)
on conflict do nothing;