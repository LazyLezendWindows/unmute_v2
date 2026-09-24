-- Profile details shown on cards and profiles: gender (for "Show me"), work, height, lifestyle,
-- and a small photo gallery (https links, like avatar_url). All optional; existing rows stay valid.
ALTER TABLE profiles
  ADD COLUMN gender VARCHAR(16) DEFAULT NULL,
  ADD COLUMN profession VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN height_cm SMALLINT UNSIGNED DEFAULT NULL,
  ADD COLUMN drinking VARCHAR(16) DEFAULT NULL,
  ADD COLUMN smoking VARCHAR(16) DEFAULT NULL,
  ADD COLUMN workout VARCHAR(16) DEFAULT NULL,
  ADD COLUMN photos TEXT DEFAULT NULL;

-- "Show me" narrows discovery by gender.
CREATE INDEX idx_profiles_gender ON profiles (gender);
