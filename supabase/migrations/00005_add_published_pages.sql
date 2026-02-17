-- Add published_pages column to store a frozen snapshot of content at publish time.
-- Readers see published_pages instead of live-editing pages.

ALTER TABLE projects ADD COLUMN published_pages JSONB DEFAULT '{}';

-- Backfill: copy current pages into published_pages for already-published projects
-- so existing published essays continue to work.
UPDATE projects SET published_pages = pages WHERE published = true;
