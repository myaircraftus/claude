-- Migration: Marketing CMS
-- Purpose: admin-managed content for marketing pages (home, about, features, pricing, scanning, contact, privacy, terms, blog)
-- - Anyone can READ (it's public marketing content)
-- - Only platform admins (user_profiles.is_platform_admin) can WRITE

CREATE TABLE IF NOT EXISTS marketing_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page TEXT NOT NULL,
  slot TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('text', 'rich_text', 'image', 'video', 'link', 'number', 'json')),
  value TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (page, slot)
);

CREATE INDEX IF NOT EXISTS idx_marketing_content_page ON marketing_content(page);

-- Enable RLS
ALTER TABLE marketing_content ENABLE ROW LEVEL SECURITY;

-- Anyone can read (public marketing content)
DROP POLICY IF EXISTS "marketing_content_read" ON marketing_content;
CREATE POLICY "marketing_content_read" ON marketing_content
  FOR SELECT
  USING (true);

-- Only platform admins can write (insert/update/delete)
DROP POLICY IF EXISTS "marketing_content_admin_write" ON marketing_content;
CREATE POLICY "marketing_content_admin_write" ON marketing_content
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_platform_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_platform_admin = TRUE
    )
  );

-- Auto-update updated_at on change
CREATE OR REPLACE FUNCTION update_marketing_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS marketing_content_updated_at ON marketing_content;
CREATE TRIGGER marketing_content_updated_at
  BEFORE UPDATE ON marketing_content
  FOR EACH ROW
  EXECUTE FUNCTION update_marketing_content_updated_at();

-- NOTE: Storage bucket 'marketing-assets' must be created via Supabase dashboard
-- (storage buckets cannot be created reliably in SQL migrations).
-- Run this in SQL editor once:
--   INSERT INTO storage.buckets (id, name, public)
--   VALUES ('marketing-assets', 'marketing-assets', true)
--   ON CONFLICT (id) DO NOTHING;
--
-- Then add policies so platform admins can upload:
--   CREATE POLICY "marketing_assets_public_read" ON storage.objects
--     FOR SELECT USING (bucket_id = 'marketing-assets');
--   CREATE POLICY "marketing_assets_admin_write" ON storage.objects
--     FOR INSERT WITH CHECK (
--       bucket_id = 'marketing-assets' AND
--       EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = TRUE)
--     );
