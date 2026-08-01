create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.users(id) on delete cascade,
  following_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users(id) on delete cascade,
  receiver_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  media_url text,
  edited_at timestamptz,
  deleted_for_sender boolean not null default false,
  deleted_for_receiver boolean not null default false,
  deleted_for_everyone boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

alter table public.direct_messages add column if not exists media_url text;
alter table public.direct_messages add column if not exists edited_at timestamptz;
alter table public.direct_messages add column if not exists deleted_for_sender boolean not null default false;
alter table public.direct_messages add column if not exists deleted_for_receiver boolean not null default false;
alter table public.direct_messages add column if not exists deleted_for_everyone boolean not null default false;

create table if not exists public.profile_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.users(id) on delete cascade,
  reviewed_user_id uuid not null references public.users(id) on delete cascade,
  rating int not null default 5 check (rating between 1 and 5),
  content text not null,
  created_at timestamptz not null default now(),
  unique (reviewer_id, reviewed_user_id),
  check (reviewer_id <> reviewed_user_id)
);

alter table public.follows enable row level security;
alter table public.direct_messages enable row level security;
alter table public.profile_reviews enable row level security;

create policy "Users can read follows" on public.follows for select using (true);
create policy "Users can follow" on public.follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow" on public.follows for delete using (auth.uid() = follower_id);

create policy "Users can read their messages" on public.direct_messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Users can send messages" on public.direct_messages
  for insert with check (auth.uid() = sender_id);
create policy "Users can edit recent own messages" on public.direct_messages
  for update using (auth.uid() = sender_id and created_at > now() - interval '5 minutes');
create policy "Users can update message delete state" on public.direct_messages
  for update using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can read reviews" on public.profile_reviews for select using (true);
create policy "Users can write reviews" on public.profile_reviews
  for insert with check (auth.uid() = reviewer_id);
create policy "Users can update own reviews" on public.profile_reviews
  for update using (auth.uid() = reviewer_id);
