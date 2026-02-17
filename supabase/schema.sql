create extension if not exists pgcrypto;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  listing_key text not null,
  username text,
  body text not null,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  constraint comments_listing_key_length_chk check (char_length(listing_key) between 1 and 64),
  constraint comments_body_length_chk check (char_length(body) between 1 and 1000),
  constraint comments_username_length_chk check (username is null or char_length(username) <= 32)
);

create index if not exists comments_listing_key_created_at_idx
  on public.comments (listing_key, created_at desc);

alter table public.comments enable row level security;

create policy "public read non-deleted comments"
  on public.comments
  for select
  using (is_deleted = false);

create policy "public insert comments"
  on public.comments
  for insert
  with check (
    char_length(listing_key) between 1 and 64
    and char_length(body) between 1 and 1000
    and (username is null or char_length(username) <= 32)
  );
