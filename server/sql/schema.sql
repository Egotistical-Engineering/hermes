-- Hermes schema for Neon Postgres
-- Apply once to a fresh database:  psql "$DATABASE_URL" -f server/sql/schema.sql
--
-- Two halves:
--   1. Better Auth core tables (camelCase columns, quoted — Better Auth's default naming)
--   2. Application tables (snake_case, matching the API layer's row types)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Better Auth core
-- ---------------------------------------------------------------------------

create table if not exists "user" (
  "id" text primary key,
  "name" text not null default '',
  "email" text not null unique,
  "emailVerified" boolean not null default false,
  "image" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists "session" (
  "id" text primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);
create index if not exists session_user_id_idx on "session" ("userId");

create table if not exists "account" (
  "id" text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists account_user_id_idx on "account" ("userId");
create unique index if not exists account_provider_idx on "account" ("providerId", "accountId");

create table if not exists "verification" (
  "id" text primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists verification_identifier_idx on "verification" ("identifier");

-- ---------------------------------------------------------------------------
-- Application tables
-- ---------------------------------------------------------------------------

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" ("id") on delete cascade,
  title text not null default 'Untitled',
  subtitle text not null default '',
  status text not null default 'interview',
  content text not null default '',
  pages jsonb not null default '{}'::jsonb,
  highlights jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  short_id text unique,
  slug text,
  author_name text not null default '',
  published_tabs jsonb not null default '[]'::jsonb,
  published_pages jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_id_idx on projects (user_id);
create index if not exists projects_short_id_idx on projects (short_id) where published;

create table if not exists assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_mcp_servers (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" ("id") on delete cascade,
  name text not null,
  url text not null,
  headers jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_mcp_servers_user_id_idx on user_mcp_servers (user_id);
