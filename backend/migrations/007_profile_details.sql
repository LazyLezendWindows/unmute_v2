-- Profile details shown on cards and profiles: gender (for "Show me"), work, height, lifestyle,
-- and a small photo gallery (https links, like avatar_url). All optional; existing rows stay valid.
-- Re-runnable: every column and index checks whether it already exists.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender VARCHAR(16) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profession VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS height_cm SMALLINT UNSIGNED DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS drinking VARCHAR(16) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS smoking VARCHAR(16) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS workout VARCHAR(16) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS photos TEXT DEFAULT NULL;

-- "Show me" narrows discovery by gender.
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles (gender);
