-- Degree level and work field: fixed lists, so Discover can filter on them (free-text profession
-- and college names cannot be filtered reliably). Both optional.
-- Re-runnable: every column and index checks whether it already exists.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS education_level VARCHAR(16) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profession_field VARCHAR(24) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_education_level ON profiles (education_level);
CREATE INDEX IF NOT EXISTS idx_profiles_profession_field ON profiles (profession_field);
