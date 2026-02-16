ALTER TABLE public.projects
  ADD COLUMN pages jsonb NOT NULL DEFAULT '{}'::jsonb;
