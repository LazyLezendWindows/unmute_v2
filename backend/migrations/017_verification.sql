-- Email verification codes, and photo (selfie) / government ID checks reviewed by moderators.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at DATETIME NULL DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_verified TINYINT(1) NOT NULL DEFAULT 0;

-- One-time email codes (verification and password reset); only a hash is stored, as for SMS codes.
CREATE TABLE IF NOT EXISTS email_codes (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  purpose VARCHAR(16) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL DEFAULT NULL,
  INDEX idx_email_codes (email, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Selfie and ID submissions. The image lives in private storage (never publicly served) and is
-- deleted once a moderator decides; this row keeps the outcome.
CREATE TABLE IF NOT EXISTS verification_requests (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  kind VARCHAR(8) NOT NULL,
  file_name VARCHAR(120) NULL DEFAULT NULL,
  gesture VARCHAR(80) NULL DEFAULT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending',
  reason VARCHAR(200) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL,
  reviewed_at DATETIME NULL DEFAULT NULL,
  reviewed_by VARCHAR(64) NULL DEFAULT NULL,
  INDEX idx_verif_user (user_id, kind, created_at),
  INDEX idx_verif_status (status, created_at),
  CONSTRAINT fk_verif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
