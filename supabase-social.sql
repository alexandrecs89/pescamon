-- ── Social Feed Schema ──────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor

-- Extended profiles (extends auth.users)
create table if not exists public.social_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique,
  display_name text,
  bio         text,
  avatar_url  text,
  location    text,
  followers_count int default 0,
  following_count int default 0,
  posts_count int default 0,
  created_at  timestamptz default now()
);
alter table public.social_profiles enable row level security;
create policy "Public read" on public.social_profiles for select using (true);
create policy "Own insert" on public.social_profiles for insert with check (auth.uid() = id);
create policy "Own update" on public.social_profiles for update using (auth.uid() = id);

-- Posts
create table if not exists public.social_posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  content     text not null,
  image_url   text,
  species_id  text,
  species_name text,
  weight_kg   numeric,
  location_name text,
  lat         double precision,
  lng         double precision,
  likes_count int default 0,
  comments_count int default 0,
  created_at  timestamptz default now()
);
alter table public.social_posts enable row level security;
create policy "Public read" on public.social_posts for select using (true);
create policy "Auth insert" on public.social_posts for insert with check (auth.uid() = user_id);
create policy "Own delete" on public.social_posts for delete using (auth.uid() = user_id);

-- Likes
create table if not exists public.social_likes (
  id      uuid primary key default gen_random_uuid(),
  post_id uuid references public.social_posts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  unique(post_id, user_id)
);
alter table public.social_likes enable row level security;
create policy "Public read" on public.social_likes for select using (true);
create policy "Auth insert" on public.social_likes for insert with check (auth.uid() = user_id);
create policy "Own delete" on public.social_likes for delete using (auth.uid() = user_id);

-- Comments
create table if not exists public.social_comments (
  id       uuid primary key default gen_random_uuid(),
  post_id  uuid references public.social_posts(id) on delete cascade not null,
  user_id  uuid references auth.users(id) on delete cascade not null,
  content  text not null,
  created_at timestamptz default now()
);
alter table public.social_comments enable row level security;
create policy "Public read" on public.social_comments for select using (true);
create policy "Auth insert" on public.social_comments for insert with check (auth.uid() = user_id);
create policy "Own delete" on public.social_comments for delete using (auth.uid() = user_id);

-- Follows
create table if not exists public.social_follows (
  id          uuid primary key default gen_random_uuid(),
  follower_id uuid references auth.users(id) on delete cascade not null,
  following_id uuid references auth.users(id) on delete cascade not null,
  created_at  timestamptz default now(),
  unique(follower_id, following_id)
);
alter table public.social_follows enable row level security;
create policy "Public read" on public.social_follows for select using (true);
create policy "Auth insert" on public.social_follows for insert with check (auth.uid() = follower_id);
create policy "Own delete" on public.social_follows for delete using (auth.uid() = follower_id);

-- Fishing Groups
create table if not exists public.fishing_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  avatar_url  text,
  owner_id    uuid references auth.users(id) on delete cascade not null,
  members_count int default 1,
  is_public   boolean default true,
  created_at  timestamptz default now()
);
alter table public.fishing_groups enable row level security;
create policy "Public read" on public.fishing_groups for select using (true);
create policy "Auth insert" on public.fishing_groups for insert with check (auth.uid() = owner_id);
create policy "Own update" on public.fishing_groups for update using (auth.uid() = owner_id);
create policy "Own delete" on public.fishing_groups for delete using (auth.uid() = owner_id);

-- Group Members
create table if not exists public.group_members (
  id       uuid primary key default gen_random_uuid(),
  group_id uuid references public.fishing_groups(id) on delete cascade not null,
  user_id  uuid references auth.users(id) on delete cascade not null,
  role     text default 'member',
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);
alter table public.group_members enable row level security;
create policy "Public read" on public.group_members for select using (true);
create policy "Auth insert" on public.group_members for insert with check (auth.uid() = user_id);
create policy "Own delete" on public.group_members for delete using (auth.uid() = user_id);

-- Trigger: auto-create social_profile on new user
create or replace function public.handle_new_user_social()
returns trigger language plpgsql security definer as $$
begin
  insert into public.social_profiles (id, display_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    lower(replace(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), ' ', '_')) || '_' || substr(new.id::text, 1, 4)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_social on auth.users;
create trigger on_auth_user_created_social
  after insert on auth.users
  for each row execute procedure public.handle_new_user_social();

-- Allow posts without text (image-only)
alter table public.social_posts alter column content drop not null;

-- Suporte a múltiplas fotos por post (até 4)
alter table public.social_posts add column if not exists image_urls text[] default '{}';

-- ── RPC helpers for atomic counters ──────────────────────────────────────────
create or replace function public.increment_likes(post_id uuid)
returns void language sql security definer as $$
  update public.social_posts set likes_count = likes_count + 1 where id = post_id;
$$;

create or replace function public.decrement_likes(post_id uuid)
returns void language sql security definer as $$
  update public.social_posts set likes_count = greatest(0, likes_count - 1) where id = post_id;
$$;

create or replace function public.increment_comments(post_id uuid)
returns void language sql security definer as $$
  update public.social_posts set comments_count = comments_count + 1 where id = post_id;
$$;
