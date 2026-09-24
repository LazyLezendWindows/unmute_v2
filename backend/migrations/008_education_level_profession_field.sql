-- Degree level and work field: fixed lists, so Discover can filter on them (free-text profession
-- and college names cannot be filtered reliably). Both optional.
ALTER TABLE profiles
  ADD COLUMN education_level VARCHAR(16) DEFAULT NULL,
  ADD COLUMN profession_field VARCHAR(24) DEFAULT NULL;

CREATE INDEX idx_profiles_education_level ON profiles (education_level);
CREATE INDEX idx_profiles_profession_field ON profiles (profession_field);
