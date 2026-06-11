-- ============================================================
-- Seed: Conteúdos de teste para a Pescademia
-- Execute no Supabase SQL Editor
-- ============================================================

-- ── 1. academy_content (vídeos e ebooks avulsos) ─────────────────────────────

INSERT INTO public.academy_content (
  title, description, content_type, category, level,
  video_url, video_platform, duration_min,
  thumbnail_url, author_name, tags,
  is_free, is_featured,
  like_count, view_count, published_at
) VALUES

-- Vídeos em destaque
(
  'Técnicas de Lançamento para Iniciantes',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aprenda os fundamentos do lançamento com vara e molinete para pescar no Rio Santa Lucía.',
  'video', 'tecnicas', 'iniciante',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 18,
  'https://images.unsplash.com/photo-1510265236892-329bfd7de7a3?w=640&q=80',
  'Equipe Pescamon', ARRAY['lançamento','iniciante','molinete'],
  true, true, 42, 310, now()
),
(
  'Leitura de Rio: Identificando Pontos de Pesca',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Como identificar refúgios de peixes, corredeiras e poços em rios de planície.',
  'video', 'locais', 'intermediario',
  'https://www.youtube.com/watch?v=9bZkp7q19f0', 'youtube', 24,
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=640&q=80',
  'Equipe Pescamon', ARRAY['rio','locais','leitura de água'],
  true, true, 87, 620, now()
),
(
  'Nós de Pesca Essenciais',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. Os 5 nós mais usados na pesca esportiva: palomar, uni, albright, surgeon e FG.',
  'video', 'tecnicas', 'iniciante',
  'https://www.youtube.com/watch?v=L_jWHffIx5E', 'youtube', 12,
  'https://images.unsplash.com/photo-1563908855-a35ac6898f93?w=640&q=80',
  'Equipe Pescamon', ARRAY['nós','linha','fundamentos'],
  true, false, 55, 410, now()
),
(
  'Pesca de Tucunaré: Comportamento e Estratégia',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore. Entenda o comportamento territorial do tucunaré e as melhores iscas artificiais.',
  'video', 'especies', 'intermediario',
  'https://www.youtube.com/watch?v=3JZ_D3ELwOQ', 'youtube', 31,
  'https://images.unsplash.com/photo-1534278931827-8a259344abe7?w=640&q=80',
  'Equipe Pescamon', ARRAY['tucunaré','artificial','predador'],
  true, true, 134, 890, now()
),
(
  'Montagem de Anzóis e Chumbadas',
  'Excepteur sint occaecat cupidatat non proident. Guia completo para montar anzóis offset, chumbadas tipo carretilha e líderes fluorocarbon.',
  'video', 'equipamentos', 'iniciante',
  'https://www.youtube.com/watch?v=fJ9rUzIMcZQ', 'youtube', 15,
  'https://images.unsplash.com/photo-1572544180516-cfe8e4b55a1d?w=640&q=80',
  'Equipe Pescamon', ARRAY['anzol','chumbada','montagem'],
  true, false, 28, 195, now()
),
(
  'Pesca Noturna no Rio: Dicas e Cuidados',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor. Equipamentos de segurança, iluminação e espécies mais ativas à noite.',
  'video', 'tecnicas', 'avancado',
  'https://www.youtube.com/watch?v=BciOfljFSfo', 'youtube', 22,
  'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=640&q=80',
  'Equipe Pescamon', ARRAY['noturna','segurança','espécies'],
  true, false, 61, 430, now()
),
(
  'Escolhendo o Molinete Ideal',
  'Sunt in culpa qui officia deserunt mollit anim id est laborum. Diferenças entre front drag, rear drag, relação de recuperação e rolamentos para cada aplicação.',
  'video', 'equipamentos', 'iniciante',
  'https://www.youtube.com/watch?v=YQHsXMglC9A', 'youtube', 20,
  'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=640&q=80',
  'Equipe Pescamon', ARRAY['molinete','equipamento','iniciante'],
  true, false, 73, 520, now()
),
(
  'Conservação e Pesca Responsável',
  'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit. Práticas de pesca esportiva, devolução correta e impacto ambiental.',
  'video', 'conservacao', 'iniciante',
  'https://www.youtube.com/watch?v=eVTXPUF4Oz4', 'youtube', 16,
  'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=640&q=80',
  'Equipe Pescamon', ARRAY['conservação','pesca responsável','devolução'],
  true, false, 99, 750, now()
),

-- Ebooks
(
  'Guia de Espécies do Rio Santa Lucía',
  'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet. Identificação visual, habitat, época de reprodução e técnicas recomendadas para cada espécie.',
  'ebook', 'especies', 'iniciante',
  null, null, null,
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=640&q=80',
  'Equipe Pescamon', ARRAY['espécies','identificação','guia'],
  true, true, 45, 280, now()
),
(
  'Manual de Segurança para Pescadores',
  'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis. Primeiros socorros, equipamentos obrigatórios e procedimentos de emergência.',
  'ebook', 'tecnicas', 'iniciante',
  null, null, null,
  'https://images.unsplash.com/photo-1503435824048-a799a3a84bf7?w=640&q=80',
  'Equipe Pescamon', ARRAY['segurança','manual','emergência'],
  true, false, 18, 120, now()
),
(
  'Calendário de Pesca: Sazonalidade e Piracema',
  'Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit. Meses ideais para cada espécie, períodos de defeso e janelas de oportunidade.',
  'ebook', 'locais', 'intermediario',
  null, null, null,
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=640&q=80',
  'Equipe Pescamon', ARRAY['sazonalidade','piracema','calendário'],
  true, false, 33, 210, now()
);

-- ── 2. academy_courses (cursos com capítulos sequenciais) ────────────────────

-- Curso 1
WITH c1 AS (
  INSERT INTO public.academy_courses (
    title, description, thumbnail_url, category, level,
    author_name, is_free, is_published, total_chapters, like_count, view_count
  ) VALUES (
    'Pesca Esportiva do Zero',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Do equipamento básico às primeiras capturas: um curso completo para quem nunca pescou.',
    'https://images.unsplash.com/photo-1541943181603-d8fe267a5dcf?w=640&q=80',
    'tecnicas', 'iniciante',
    'Equipe Pescamon', true, true, 5, 201, 1450
  ) RETURNING id
)
INSERT INTO public.academy_chapters (course_id, title, description, video_url, video_platform, duration_min, sort_order, is_free)
SELECT
  c1.id,
  chapter.title,
  chapter.description,
  chapter.video_url,
  'youtube',
  chapter.duration_min,
  chapter.sort_order,
  true
FROM c1, (VALUES
  (1, 'Equipamentos Básicos: Vara, Molinete e Linha',        'Ut enim ad minim veniam, quis nostrud exercitation. Tudo o que você precisa para começar a pescar.', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 14),
  (2, 'Nós Essenciais para Iniciantes',                     'Duis aute irure dolor in reprehenderit in voluptate velit. Os três nós que você precisa aprender primeiro.', 'https://www.youtube.com/watch?v=9bZkp7q19f0', 11),
  (3, 'Iscas Naturais: Minhoca, Milho e Moela',             'Excepteur sint occaecat cupidatat non proident. Como montar e apresentar as iscas naturais mais eficientes.', 'https://www.youtube.com/watch?v=L_jWHffIx5E', 13),
  (4, 'Técnica de Lançamento com Molinete de Frente',       'Sed ut perspiciatis unde omnis iste natus error sit voluptatem. Postura, pegada e execução do lançamento.', 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ', 17),
  (5, 'Sua Primeira Captura: Da Ferrada ao Desanzol',       'Nemo enim ipsam voluptatem quia voluptas sit. O que fazer quando o peixe morde e como soltá-lo com segurança.', 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ', 15)
) AS chapter(sort_order, title, description, video_url, duration_min);

-- Curso 2
WITH c2 AS (
  INSERT INTO public.academy_courses (
    title, description, thumbnail_url, category, level,
    author_name, is_free, is_published, total_chapters, like_count, view_count
  ) VALUES (
    'Iscas Artificiais: Do Básico ao Avançado',
    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Aprenda a escolher, montar e apresentar isca artificial para diversas espécies.',
    'https://images.unsplash.com/photo-1519729013058-838c1ef0c7d3?w=640&q=80',
    'tecnicas', 'intermediario',
    'Equipe Pescamon', true, true, 4, 156, 980
  ) RETURNING id
)
INSERT INTO public.academy_chapters (course_id, title, description, video_url, video_platform, duration_min, sort_order, is_free)
SELECT
  c2.id,
  chapter.title,
  chapter.description,
  chapter.video_url,
  'youtube',
  chapter.duration_min,
  chapter.sort_order,
  true
FROM c2, (VALUES
  (1, 'Tipos de Isca Artificial: Jig, Spinner e Popper',    'At vero eos et accusamus et iusto odio dignissimos. Diferenças de ação, profundidade e situação de uso.', 'https://www.youtube.com/watch?v=BciOfljFSfo', 19),
  (2, 'Ação de Vara para Artificiais',                      'Nam libero tempore, cum soluta nobis est eligendi. Jerks, twitch, steady retrieve e stop-and-go.', 'https://www.youtube.com/watch?v=YQHsXMglC9A', 22),
  (3, 'Cores e Padrões: Quando Usar Cada Um',               'Temporibus autem quibusdam et aut officiis debitis. Regra da água clara, escura e noturna.', 'https://www.youtube.com/watch?v=eVTXPUF4Oz4', 16),
  (4, 'Montagem de Texas Rig e Carolina Rig',               'Itaque earum rerum hic tenetur a sapiente delectus. As duas montagens mais versáteis da pesca esportiva.', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 20)
) AS chapter(sort_order, title, description, video_url, duration_min);

-- Curso 3
WITH c3 AS (
  INSERT INTO public.academy_courses (
    title, description, thumbnail_url, category, level,
    author_name, is_free, is_published, total_chapters, like_count, view_count
  ) VALUES (
    'Ecologia da Pesca no Rio Santa Lucía',
    'Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis. Entenda o ecossistema fluvial para se tornar um pescador mais eficiente e responsável.',
    'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=640&q=80',
    'conservacao', 'iniciante',
    'Equipe Pescamon', true, true, 3, 88, 540
  ) RETURNING id
)
INSERT INTO public.academy_chapters (course_id, title, description, video_url, video_platform, duration_min, sort_order, is_free)
SELECT
  c3.id,
  chapter.title,
  chapter.description,
  chapter.video_url,
  'youtube',
  chapter.duration_min,
  chapter.sort_order,
  true
FROM c3, (VALUES
  (1, 'O Rio como Habitat: Zonas e Microhabitats',          'Quis autem vel eum iure reprehenderit qui in ea voluptate. Corredeiras, poços, remansos e margens vegetadas.', 'https://www.youtube.com/watch?v=9bZkp7q19f0', 21),
  (2, 'Cadeia Alimentar e Comportamento de Predadores',     'Neque porro quisquam est qui dolorem ipsum quia dolor sit. Como os peixes se posicionam para caçar.', 'https://www.youtube.com/watch?v=L_jWHffIx5E', 18),
  (3, 'Piracema: Respeitar para Pescar Mais Amanhã',        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Impacto do defeso na biomassa e recuperação de estoques.', 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ', 14)
) AS chapter(sort_order, title, description, video_url, duration_min);

-- ── Fim ──────────────────────────────────────────────────────────────────────
