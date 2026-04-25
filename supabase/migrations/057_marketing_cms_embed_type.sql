-- Migration: extend marketing_content content_type CHECK to include 'embed'
-- Purpose: support YouTube/Vimeo URLs as a first-class content type alongside
-- file-uploaded images and videos.

ALTER TABLE marketing_content DROP CONSTRAINT IF EXISTS marketing_content_content_type_check;

ALTER TABLE marketing_content
  ADD CONSTRAINT marketing_content_content_type_check
  CHECK (content_type IN ('text', 'rich_text', 'image', 'video', 'embed', 'link', 'number', 'json'));
