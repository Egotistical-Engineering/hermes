-- User-configurable MCP servers (beta feature)
-- Each user can register up to 10 external MCP servers (HTTP only)

create table public.user_mcp_servers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  url         text not null,
  headers     jsonb not null default '{}',
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint user_mcp_servers_name_check check (name ~ '^[a-z0-9][a-z0-9-]{0,29}$'),
  constraint user_mcp_servers_url_length check (length(url) <= 512),
  unique (user_id, name)
);

create index user_mcp_servers_user_id_idx on public.user_mcp_servers(user_id);

alter table public.user_mcp_servers enable row level security;

create policy "Users can read own mcp servers"
  on public.user_mcp_servers for select
  using (auth.uid() = user_id);

-- Reuse set_updated_at trigger from 00001
create trigger user_mcp_servers_updated_at
  before update on public.user_mcp_servers
  for each row execute function public.set_updated_at();
