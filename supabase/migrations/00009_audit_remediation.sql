-- 00009_audit_remediation.sql
-- Audit remediation: atomic highlights, RLS policies, invite code generation

-- 5A: Atomic highlights append RPC
-- Replaces the read-modify-write pattern with a single atomic JSONB append.
-- Caps highlights at 200 per project and verifies project ownership.
create or replace function public.append_highlights(
  p_project_id uuid,
  p_user_id uuid,
  p_new_highlights jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_existing jsonb;
  v_merged jsonb;
begin
  -- Verify project ownership
  select user_id, coalesce(highlights, '[]'::jsonb)
    into v_owner_id, v_existing
    from public.projects
    where id = p_project_id
    for update;

  if v_owner_id is null or v_owner_id != p_user_id then
    raise exception 'Project not found or not owned by user';
  end if;

  -- Append new highlights and cap at 200
  v_merged := v_existing || p_new_highlights;
  if jsonb_array_length(v_merged) > 200 then
    -- Keep the last 200 highlights (most recent)
    v_merged := (
      select jsonb_agg(elem)
      from (
        select elem
        from jsonb_array_elements(v_merged) as elem
        order by elem->>'id' desc
        limit 200
      ) sub
    );
  end if;

  update public.projects
    set highlights = v_merged
    where id = p_project_id;
end;
$$;

-- 5B: RLS write policies on user_mcp_servers
-- Ensures users can only insert/update/delete their own MCP server configs.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_mcp_servers' and policyname = 'Users can insert own MCP servers'
  ) then
    create policy "Users can insert own MCP servers"
      on public.user_mcp_servers
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'user_mcp_servers' and policyname = 'Users can update own MCP servers'
  ) then
    create policy "Users can update own MCP servers"
      on public.user_mcp_servers
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'user_mcp_servers' and policyname = 'Users can delete own MCP servers'
  ) then
    create policy "Users can delete own MCP servers"
      on public.user_mcp_servers
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;

-- 5C: Random invite code generator
create or replace function public.generate_invite_code()
returns text
language sql
as $$
  select encode(gen_random_bytes(6), 'hex');
$$;
