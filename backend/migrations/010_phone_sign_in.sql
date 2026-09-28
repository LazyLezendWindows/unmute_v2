-- Phone sign-in. A phone identity is an auth_accounts row (provider 'phone', provider_account_id is
-- the E.164 number), so accounts created with a phone have no email: users.email becomes optional
-- (UNIQUE still applies to the addresses that exist; NULLs never collide).
ALTER TABLE users MODIFY email VARCHAR(255) NULL;

-- One-time sign-in codes sent by SMS. Only a SHA-256 hash of phone + code is stored; a code is
-- single-use (consumed_at), short-lived (expires_at) and locked after a few wrong guesses (attempts).
CREATE TABLE IF NOT EXISTS phone_codes (
  id CHAR(36) PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL DEFAULT NULL,
  INDEX idx_phone_codes_phone (phone, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
