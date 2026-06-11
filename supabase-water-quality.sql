-- Tabela de qualidade da água por curso (fonte oficial + crowdsource validado)
create table if not exists water_quality (
  id uuid primary key default gen_random_uuid(),
  watercourse_id text not null, -- ID do curso d'água (__santa_lucia__ ou ID do tributário)
  watercourse_name text not null,
  
  -- Fonte dos dados
  source_type text not null check (source_type in ('official', 'crowdsourced')),
  source_name text, -- ex: 'DINAMA', 'Usuario report'
  
  -- Qualidade (0-100)
  quality_score int not null check (quality_score >= 0 and quality_score <= 100),
  
  -- Detalhes
  is_polluted boolean generated always as (quality_score < 50) stored,
  description text, -- descrição da condição
  indicators jsonb, -- pH, turbidez, oxigênio, etc. quando disponível
  
  -- Geolocalização aproximada do ponto de amostragem (opcional)
  sample_lat float,
  sample_lon float,
  
  -- Metadados
  measured_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  -- Controle de versão: apenas a medição mais recente por fonte é ativa
  is_current boolean default true,
  
  unique(watercourse_id, source_type, source_name, is_current) where is_current = true
);

-- Índices
create index idx_water_quality_watercourse on water_quality(watercourse_id, is_current);
create index idx_water_quality_score on water_quality(quality_score);
create index idx_water_quality_polluted on water_quality(is_polluted) where is_polluted = true;

-- Tabela de reports de usuários (pendentes de moderação)
create table if not exists water_quality_reports (
  id uuid primary key default gen_random_uuid(),
  
  -- Referência ao curso
  watercourse_id text not null,
  watercourse_name text not null,
  
  -- Quem reportou
  user_id uuid references auth.users(id),
  device_id text, -- para usuários anônimos
  user_email text,
  
  -- Tipo de report
  report_type text not null check (report_type in ('clean_to_polluted', 'polluted_to_clean', 'general_condition')),
  -- clean_to_polluted: usuário viu que local limpo está poluído
  -- polluted_to_clean: usuário viu que local poluído melhorou
  -- general_condition: observação geral
  
  -- Dados do report
  observed_quality int check (observed_quality >= 0 and observed_quality <= 100), -- avaliação subjetiva 0-100
  description text not null, -- descrição do que foi observado
  indicators jsonb, -- observações específicas: {hasTrash: true, smell: 'strong', color: 'brown', hasFoam: true}
  
  -- Evidências
  photo_url text, -- foto opcional do local
  
  -- Geolocalização do report
  report_lat float,
  report_lon float,
  
  -- Status de moderação
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'under_review')),
  
  -- Moderação
  moderated_by uuid references auth.users(id),
  moderated_at timestamp with time zone,
  moderator_notes text, -- notas do moderador
  
  -- Se aprovado, referência ao registro oficial criado
  approved_quality_id uuid references water_quality(id),
  
  -- Controle
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Índices para moderação
create index idx_water_quality_reports_status on water_quality_reports(status);
create index idx_water_quality_reports_watercourse on water_quality_reports(watercourse_id, status);
create index idx_water_quality_reports_pending on water_quality_reports(status) where status = 'pending';

-- Trigger para atualizar updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_water_quality_updated_at on water_quality;
create trigger update_water_quality_updated_at
  before update on water_quality
  for each row
  execute function update_updated_at_column();

drop trigger if exists update_water_quality_reports_updated_at on water_quality_reports;
create trigger update_water_quality_reports_updated_at
  before update on water_quality_reports
  for each row
  execute function update_updated_at_column();

-- RLS (Row Level Security)
alter table water_quality enable row level security;
alter table water_quality_reports enable row level security;

-- Políticas: todos podem ler qualidade aprovada
-- Políticas: usuários autenticados podem criar reports
-- Políticas: apenas admins/moderação podem aprovar/rejeitar

-- Função para aprovar um report e criar registro oficial
create or replace function approve_water_quality_report(
  report_id uuid,
  moderator_id uuid,
  moderator_notes text,
  final_quality_score int
)
returns uuid as $$
declare
  new_quality_id uuid;
  report_record record;
begin
  -- Busca o report
  select * into report_record from water_quality_reports where id = report_id;
  
  if report_record is null then
    raise exception 'Report not found';
  end if;
  
  if report_record.status != 'pending' then
    raise exception 'Report already processed';
  end if;
  
  -- Marca reportes anteriores como não-correntes
  update water_quality 
  set is_current = false 
  where watercourse_id = report_record.watercourse_id 
    and source_type = 'crowdsourced';
  
  -- Cria novo registro oficial
  insert into water_quality (
    watercourse_id,
    watercourse_name,
    source_type,
    source_name,
    quality_score,
    description,
    indicators,
    sample_lat,
    sample_lon,
    measured_at
  ) values (
    report_record.watercourse_id,
    report_record.watercourse_name,
    'crowdsourced',
    'Report validado: ' || coalesce(report_record.user_email, report_record.device_id),
    final_quality_score,
    report_record.description,
    report_record.indicators,
    report_record.report_lat,
    report_record.report_lon,
    now()
  )
  returning id into new_quality_id;
  
  -- Atualiza o report
  update water_quality_reports set
    status = 'approved',
    moderated_by = moderator_id,
    moderated_at = now(),
    moderator_notes = moderator_notes,
    approved_quality_id = new_quality_id
  where id = report_id;
  
  return new_quality_id;
end;
$$ language plpgsql security definer;

-- Função para rejeitar report
create or replace function reject_water_quality_report(
  report_id uuid,
  moderator_id uuid,
  moderator_notes text
)
returns void as $$
begin
  update water_quality_reports set
    status = 'rejected',
    moderated_by = moderator_id,
    moderated_at = now(),
    moderator_notes = moderator_notes
  where id = report_id and status = 'pending';
end;
$$ language plpgsql security definer;
