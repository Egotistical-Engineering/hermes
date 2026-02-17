-- Add publishing support to projects table

ALTER TABLE public.projects
  ADD COLUMN published boolean NOT NULL DEFAULT false,
  ADD COLUMN short_id text,
  ADD COLUMN slug text,
  ADD COLUMN author_name text NOT NULL DEFAULT '',
  ADD COLUMN published_tabs text[] DEFAULT '{}',
  ADD COLUMN published_at timestamptz;

-- Partial unique index: only enforce uniqueness on non-null short_id values
CREATE UNIQUE INDEX idx_projects_short_id ON public.projects (short_id) WHERE short_id IS NOT NULL;

-- Allow anyone to read published projects (OR-combines with existing owner-scoped SELECT policy)
CREATE POLICY "Anyone can read published projects"
  ON public.projects FOR SELECT
  USING (published = true);
