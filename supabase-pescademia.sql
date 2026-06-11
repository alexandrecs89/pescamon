-- ── Pescademia Schema ───────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor

create table if not exists public.academy_content (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  content_type  text not null check (content_type in ('video','ebook','article','course')),
  category      text not null default 'geral',   -- tecnicas, equipamentos, especies, legislacao, geral
  level         text not null default 'iniciante' check (level in ('iniciante','intermediario','avancado')),
  -- Video fields
  video_url     text,   -- YouTube/Twitch/Vimeo embed URL or watch URL
  video_platform text,  -- youtube | twitch | vimeo | other
  duration_min  int,
  -- Ebook / material fields
  file_url      text,
  file_size_kb  int,
  page_count    int,
  -- Common
  thumbnail_url text,
  author_name   text,
  author_avatar text,
  tags          text[],
  language      text default 'pt',
  is_free       boolean default true,
  is_featured   boolean default false,
  view_count    int default 0,
  like_count    int default 0,
  published_at  timestamptz default now(),
  created_at    timestamptz default now(),
  created_by    uuid references auth.users(id) on delete set null
);

alter table public.academy_content enable row level security;
create policy "Public read" on public.academy_content for select using (true);
create policy "Admin insert" on public.academy_content for insert with check (auth.uid() is not null);
create policy "Admin update" on public.academy_content for update using (auth.uid() = created_by);
create policy "Admin delete" on public.academy_content for delete using (auth.uid() = created_by);

-- Progresso do usuário
create table if not exists public.academy_progress (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  content_id  uuid references public.academy_content(id) on delete cascade not null,
  completed   boolean default false,
  progress_pct int default 0,
  last_accessed timestamptz default now(),
  unique(user_id, content_id)
);
alter table public.academy_progress enable row level security;
create policy "Own read" on public.academy_progress for select using (auth.uid() = user_id);
create policy "Own upsert" on public.academy_progress for insert with check (auth.uid() = user_id);
create policy "Own update" on public.academy_progress for update using (auth.uid() = user_id);

-- Likes de conteúdo
create table if not exists public.academy_likes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  content_id  uuid references public.academy_content(id) on delete cascade not null,
  unique(user_id, content_id)
);
alter table public.academy_likes enable row level security;
create policy "Public read" on public.academy_likes for select using (true);
create policy "Own insert" on public.academy_likes for insert with check (auth.uid() = user_id);
create policy "Own delete" on public.academy_likes for delete using (auth.uid() = user_id);

-- RPC para contadores
create or replace function public.increment_content_views(content_id uuid)
returns void language sql security definer as $$
  update public.academy_content set view_count = view_count + 1 where id = content_id;
$$;

create or replace function public.increment_content_likes(content_id uuid)
returns void language sql security definer as $$
  update public.academy_content set like_count = like_count + 1 where id = content_id;
$$;

create or replace function public.decrement_content_likes(content_id uuid)
returns void language sql security definer as $$
  update public.academy_content set like_count = greatest(0, like_count - 1) where id = content_id;
$$;

-- Dados de exemplo para testar
insert into public.academy_content (title, description, content_type, category, level, video_url, video_platform, duration_min, thumbnail_url, author_name, tags, is_featured) values
(
  'Técnicas de Pesca no Rio Santa Lucía',
  'Aprenda as melhores técnicas para pescar no Rio Santa Lucía, incluindo iscas, pontos ideais e horários.',
  'video', 'tecnicas', 'iniciante',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'youtube', 22,
  'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
  'Pescamon Academy',
  ARRAY['santa lucia','tecnicas','iniciante'],
  true
),
(
  'Guia Completo de Espécies do Uruguai',
  'E-book com todas as espécies de peixes do Uruguai: hábitats, comportamento e técnicas específicas.',
  'ebook', 'especies', 'intermediario',
  null, null, null,
  null,
  'Pescamon Academy',
  ARRAY['especies','uruguai','guia'],
  true
),
(
  'Legislação de Pesca no Uruguai 2025',
  'Tudo sobre vedas, tamanhos mínimos, licenças e regulamentações da DINARA.',
  'article', 'legislacao', 'iniciante',
  null, null, null,
  null,
  'DINARA / Pescamon',
  ARRAY['legislacao','veda','dinara'],
  false
)
on conflict do nothing;
