-- ── Academy Courses Schema ───────────────────────────────────────────────────
-- Run this in the Supabase SQL editor

-- Cursos (agrupam capítulos sequenciais)
create table if not exists public.academy_courses (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  thumbnail_url text,
  category      text,
  level         text check (level in ('iniciante','intermediario','avancado')),
  author_name   text,
  is_free       boolean default true,
  is_published  boolean default false,
  total_chapters int default 0,
  like_count    int default 0,
  view_count    int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.academy_courses enable row level security;
create policy "Public read courses" on public.academy_courses for select using (is_published = true);
create policy "Admin insert courses" on public.academy_courses for insert with check (auth.role() = 'authenticated');
create policy "Admin update courses" on public.academy_courses for update using (auth.role() = 'authenticated');

-- Capítulos de cada curso
create table if not exists public.academy_chapters (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.academy_courses(id) on delete cascade,
  title         text not null,
  description   text,
  video_url     text,
  video_platform text default 'youtube',
  duration_min  int,
  sort_order    int default 0,
  is_free       boolean default true,
  created_at    timestamptz default now()
);
alter table public.academy_chapters enable row level security;
create policy "Public read chapters" on public.academy_chapters for select using (true);
create policy "Admin insert chapters" on public.academy_chapters for insert with check (auth.role() = 'authenticated');
create policy "Admin update chapters" on public.academy_chapters for update using (auth.role() = 'authenticated');

-- Progresso por capítulo por usuário
create table if not exists public.academy_chapter_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  course_id    uuid not null references public.academy_courses(id) on delete cascade,
  chapter_id   uuid not null references public.academy_chapters(id) on delete cascade,
  progress_pct int default 0,   -- 0-100
  completed    boolean default false,
  watched_at   timestamptz default now(),
  unique(user_id, chapter_id)
);
alter table public.academy_chapter_progress enable row level security;
create policy "Own read chapter_progress" on public.academy_chapter_progress for select using (auth.uid() = user_id);
create policy "Own upsert chapter_progress" on public.academy_chapter_progress for insert with check (auth.uid() = user_id);
create policy "Own update chapter_progress" on public.academy_chapter_progress for update using (auth.uid() = user_id);

-- RPC: incrementar views de curso
create or replace function increment_course_views(course_id uuid)
returns void language sql security definer as $$
  update public.academy_courses set view_count = view_count + 1 where id = course_id;
$$;
