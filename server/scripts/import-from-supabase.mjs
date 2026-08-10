#!/usr/bin/env node
/**
 * One-shot import: Supabase Auth + projects backup JSONs → Neon (Better Auth schema).
 *
 * Reads three files produced during the migration backup:
 *   - hermes-auth-users.json       (auth.users rows, incl. bcrypt password hashes)
 *   - hermes-auth-identities.json  (auth.identities rows: google + email)
 *   - hermes-projects.json         (projects rows, incl. pages/highlights/publishing)
 *
 * Preserves original user UUIDs so projects.user_id references survive unchanged.
 * Idempotent: uses ON CONFLICT DO NOTHING throughout — safe to re-run.
 *
 * Usage:
 *   DATABASE_URL='postgres://...' node server/scripts/import-from-supabase.mjs /path/to/backup-dir
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const backupDir = process.argv[2];
if (!backupDir || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL=... node import-from-supabase.mjs <backup-dir>');
  process.exit(1);
}

const users = JSON.parse(readFileSync(join(backupDir, 'hermes-auth-users.json'), 'utf8'));
const identities = JSON.parse(readFileSync(join(backupDir, 'hermes-auth-identities.json'), 'utf8'));
const projects = JSON.parse(readFileSync(join(backupDir, 'hermes-projects.json'), 'utf8'));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, max: 3 });

const stats = { users: 0, credentialAccounts: 0, googleAccounts: 0, projects: 0, skipped: 0 };

try {
  // 1. Users — keep original UUIDs as Better Auth ids
  for (const u of users) {
    if (u.deleted_at) { stats.skipped++; continue; }
    const name = u.raw_user_meta_data?.full_name || u.raw_user_meta_data?.name || '';
    const image = u.raw_user_meta_data?.avatar_url || null;
    const res = await pool.query(
      `insert into "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt")
       values ($1, $2, $3, true, $4, $5, $6)
       on conflict ("id") do nothing`,
      [u.id, name, u.email.toLowerCase(), image, u.created_at, u.updated_at || u.created_at],
    );
    stats.users += res.rowCount;
  }

  // 2. Accounts
  //    - email identities → credential accounts carrying the bcrypt hash
  //    - google identities → provider accounts keyed by the Google sub
  const usersById = new Map(users.map((u) => [u.id, u]));
  for (const ident of identities) {
    const u = usersById.get(ident.user_id);
    if (!u || u.deleted_at) { stats.skipped++; continue; }

    if (ident.provider === 'email') {
      if (!u.encrypted_password || !u.encrypted_password.startsWith('$2')) { stats.skipped++; continue; }
      const res = await pool.query(
        `insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
         values ($1, $2, 'credential', $3, $4, $5, $6)
         on conflict ("providerId", "accountId") do nothing`,
        [randomUUID(), ident.user_id, ident.user_id, u.encrypted_password, ident.created_at, ident.updated_at || ident.created_at],
      );
      stats.credentialAccounts += res.rowCount;
    } else if (ident.provider === 'google') {
      const sub = ident.provider_id || ident.identity_data?.sub;
      if (!sub) { stats.skipped++; continue; }
      const res = await pool.query(
        `insert into "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
         values ($1, $2, 'google', $3, $4, $5)
         on conflict ("providerId", "accountId") do nothing`,
        [randomUUID(), String(sub), ident.user_id, ident.created_at, ident.updated_at || ident.created_at],
      );
      stats.googleAccounts += res.rowCount;
    } else {
      stats.skipped++;
    }
  }

  // 3. Projects — original ids, full pages/highlights/publishing state
  for (const p of projects) {
    if (!usersById.has(p.user_id)) { stats.skipped++; continue; }
    const res = await pool.query(
      `insert into projects (id, user_id, title, subtitle, status, content, pages, highlights,
         published, short_id, slug, author_name, published_tabs, published_pages, published_at,
         created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (id) do nothing`,
      [
        p.id, p.user_id, p.title ?? 'Untitled', p.subtitle ?? '', p.status ?? 'interview',
        p.content ?? '', JSON.stringify(p.pages ?? {}), JSON.stringify(p.highlights ?? []),
        p.published ?? false, p.short_id, p.slug, p.author_name ?? '',
        JSON.stringify(p.published_tabs ?? []), JSON.stringify(p.published_pages ?? {}),
        p.published_at, p.created_at, p.updated_at,
      ],
    );
    stats.projects += res.rowCount;
  }

  console.log('Import complete:', stats);

  // Sanity checks
  const { rows: [counts] } = await pool.query(
    `select (select count(*)::int from "user") as users,
            (select count(*)::int from "account") as accounts,
            (select count(*)::int from projects) as projects,
            (select count(*)::int from projects p where not exists
              (select 1 from "user" u where u."id" = p.user_id)) as orphan_projects`,
  );
  console.log('Database state:', counts);
  if (counts.orphan_projects > 0) {
    console.error('WARNING: orphaned projects detected');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
