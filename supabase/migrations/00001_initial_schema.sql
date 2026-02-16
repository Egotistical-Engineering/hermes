-- Hermes initial schema
-- Tables: projects, brain_dumps, interviews, drafts, feedback, assistant_conversations

-- ============================================================
-- projects
-- ============================================================
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  status      text not null default 'interview'
                check (status in ('interview','draft','rewriting','feedback','complete')),
  content     text not null default '',
  highlights  jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_user_id_idx on public.projects(user_id);

alter table public.projects enable row level security;

create policy "Users can read own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ============================================================
-- brain_dumps
-- ============================================================
create table public.brain_dumps (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  content      text not null default '',
  prior_essays jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index brain_dumps_project_id_idx on public.brain_dumps(project_id);

alter table public.brain_dumps enable row level security;

create policy "Users can read own brain_dumps"
  on public.brain_dumps for select
  using (exists (
    select 1 from public.projects where projects.id = brain_dumps.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can insert own brain_dumps"
  on public.brain_dumps for insert
  with check (exists (
    select 1 from public.projects where projects.id = brain_dumps.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can update own brain_dumps"
  on public.brain_dumps for update
  using (exists (
    select 1 from public.projects where projects.id = brain_dumps.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can delete own brain_dumps"
  on public.brain_dumps for delete
  using (exists (
    select 1 from public.projects where projects.id = brain_dumps.project_id and projects.user_id = auth.uid()
  ));

-- ============================================================
-- interviews
-- ============================================================
create table public.interviews (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  messages    jsonb not null default '[]'::jsonb,
  outline     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index interviews_project_id_idx on public.interviews(project_id);

alter table public.interviews enable row level security;

create policy "Users can read own interviews"
  on public.interviews for select
  using (exists (
    select 1 from public.projects where projects.id = interviews.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can insert own interviews"
  on public.interviews for insert
  with check (exists (
    select 1 from public.projects where projects.id = interviews.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can update own interviews"
  on public.interviews for update
  using (exists (
    select 1 from public.projects where projects.id = interviews.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can delete own interviews"
  on public.interviews for delete
  using (exists (
    select 1 from public.projects where projects.id = interviews.project_id and projects.user_id = auth.uid()
  ));

-- ============================================================
-- drafts
-- ============================================================
create table public.drafts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  version     integer not null default 1,
  skeleton    text not null default '',
  rewrite     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index drafts_project_id_idx on public.drafts(project_id);

alter table public.drafts enable row level security;

create policy "Users can read own drafts"
  on public.drafts for select
  using (exists (
    select 1 from public.projects where projects.id = drafts.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can insert own drafts"
  on public.drafts for insert
  with check (exists (
    select 1 from public.projects where projects.id = drafts.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can update own drafts"
  on public.drafts for update
  using (exists (
    select 1 from public.projects where projects.id = drafts.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can delete own drafts"
  on public.drafts for delete
  using (exists (
    select 1 from public.projects where projects.id = drafts.project_id and projects.user_id = auth.uid()
  ));

-- ============================================================
-- feedback
-- ============================================================
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  draft_id    uuid references public.drafts(id) on delete set null,
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index feedback_project_id_idx on public.feedback(project_id);

alter table public.feedback enable row level security;

create policy "Users can read own feedback"
  on public.feedback for select
  using (exists (
    select 1 from public.projects where projects.id = feedback.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can insert own feedback"
  on public.feedback for insert
  with check (exists (
    select 1 from public.projects where projects.id = feedback.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can update own feedback"
  on public.feedback for update
  using (exists (
    select 1 from public.projects where projects.id = feedback.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can delete own feedback"
  on public.feedback for delete
  using (exists (
    select 1 from public.projects where projects.id = feedback.project_id and projects.user_id = auth.uid()
  ));

-- ============================================================
-- assistant_conversations
-- ============================================================
create table public.assistant_conversations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null unique references public.projects(id) on delete cascade,
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.assistant_conversations enable row level security;

create policy "Users can read own assistant_conversations"
  on public.assistant_conversations for select
  using (exists (
    select 1 from public.projects where projects.id = assistant_conversations.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can insert own assistant_conversations"
  on public.assistant_conversations for insert
  with check (exists (
    select 1 from public.projects where projects.id = assistant_conversations.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can update own assistant_conversations"
  on public.assistant_conversations for update
  using (exists (
    select 1 from public.projects where projects.id = assistant_conversations.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can delete own assistant_conversations"
  on public.assistant_conversations for delete
  using (exists (
    select 1 from public.projects where projects.id = assistant_conversations.project_id and projects.user_id = auth.uid()
  ));

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger brain_dumps_updated_at
  before update on public.brain_dumps
  for each row execute function public.set_updated_at();

create trigger interviews_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();

create trigger drafts_updated_at
  before update on public.drafts
  for each row execute function public.set_updated_at();

create trigger feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

create trigger assistant_conversations_updated_at
  before update on public.assistant_conversations
  for each row execute function public.set_updated_at();
