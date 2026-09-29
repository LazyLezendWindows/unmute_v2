-- Premium extras for paid plans: Profile Boosts and Travel mode.
CREATE TABLE IF NOT EXISTS boosts (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  started_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  INDEX idx_boosts_user (user_id, started_at),
  INDEX idx_boosts_active (ends_at),
  CONSTRAINT fk_boost_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A place a member is travelling to: Discover searches around it instead of their home area.
CREATE TABLE IF NOT EXISTS travel_modes (
  user_id VARCHAR(64) PRIMARY KEY,
  place_id VARCHAR(64) NOT NULL,
  label VARCHAR(160) NOT NULL,
  latitude DECIMAL(8, 5) NOT NULL,
  longitude DECIMAL(8, 5) NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_travel_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
