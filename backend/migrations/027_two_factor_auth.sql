-- Authenticator-app (TOTP, RFC 6238) two-factor authentication.
-- Secrets are stored encrypted at rest with AES-256-GCM (TOTP_ENCRYPTION_KEY); recovery codes and
-- short-lived pending login tokens are stored only as SHA-256 hashes.

CREATE TABLE IF NOT EXISTS user_totp (
  user_id VARCHAR(64) PRIMARY KEY,
  secret_encrypted VARCHAR(512) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  last_used_step BIGINT NULL DEFAULT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL,
  setup_expires_at DATETIME NULL DEFAULT NULL,
  enabled_at DATETIME NULL DEFAULT NULL,
  CONSTRAINT fk_user_totp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_totp_recovery_codes (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_totp_recovery_user (user_id, used_at),
  CONSTRAINT fk_totp_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS totp_pending_logins (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  is_new_user TINYINT(1) NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL DEFAULT NULL,
  UNIQUE KEY uq_totp_pending_token (token_hash),
  INDEX idx_totp_pending_user (user_id, created_at),
  CONSTRAINT fk_totp_pending_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

