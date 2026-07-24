-- Migration: umadata.keiro（毛色 / CSV BL列）
-- Created: 2026-07-24
-- Status: NOT APPLIED to production by this PR. Review and run manually.
--
-- Purpose:
--   Store coat color (毛色) from umadata CSV Excel column BL (0-based index 63).
--   Japanese strings must be preserved (TEXT / UTF-8).
--
-- Apply (manual, after review):
--   psql "$DATABASE_URL" -f db/migrations/20260724_add_umadata_keiro.sql
--
-- Rollback (manual):
--   ALTER TABLE umadata DROP COLUMN IF EXISTS keiro;
--
-- Notes:
--   - Existing rows will have NULL keiro until CSV is re-imported.
--   - There is no upload history / raw JSON retaining BL values for backfill.
--   - Do NOT rely on runtime ALTER inside upload handlers.

ALTER TABLE umadata
  ADD COLUMN IF NOT EXISTS keiro TEXT;

COMMENT ON COLUMN umadata.keiro IS '毛色 (umadata CSV BL列). Japanese coat-color name. NULL until re-import.';
