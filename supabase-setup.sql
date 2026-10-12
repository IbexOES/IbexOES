-- Run this entire script in Supabase Dashboard → SQL Editor.
-- All rows are private to the authenticated user who created them.
create extension if not exists pgcrypto;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  country text default 'USA',
  university text,
  program text,
  status text not null default 'New Lead',
  total_fee numeric(12,2) not null default 0 check (total_fee >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null default 'Bank Transfer',
  reference text,
  notes text,
  receipt_path text,
  created_at timestamptz not null default now()
);

create index if not exists students_owner_id_idx on public.students(owner_id);
create index if not exists payments_owner_id_idx on public.payments(owner_id);
create index if not exists payments_student_id_idx on public.payments(student_id);

alter table public.students enable row level security;
alter table public.payments enable row level security;

drop policy if exists "Owners can manage their students" on public.students;
create policy "Owners can manage their students" on public.students
  for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners can manage their payments" on public.payments;
create policy "Owners can manage their payments" on public.payments
  for all to authenticated using (auth.uid() = owner_id) with check (
    auth.uid() = owner_id and exists (
      select 1 from public.students s where s.id = student_id and s.owner_id = auth.uid()
    )
  );

-- Private storage bucket for screenshots/receipts. Files are not publicly accessible.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','application/pdf'];

drop policy if exists "Users can upload their own receipts" on storage.objects;
create policy "Users can upload their own receipts" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can view their own receipts" on storage.objects;
create policy "Users can view their own receipts" on storage.objects
  for select to authenticated using (
    bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own receipts" on storage.objects;
create policy "Users can delete their own receipts" on storage.objects
  for delete to authenticated using (
    bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Optional updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists students_updated_at on public.students;
create trigger students_updated_at before update on public.students
for each row execute function public.set_updated_at();
