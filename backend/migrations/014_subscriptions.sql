-- Subscription plans and device fingerprinting for multi-SIM abuse prevention.

-- One active subscription per user. trial_started_at is set on first login and never changes.
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id VARCHAR(64) PRIMARY KEY,
  trial_started_at DATETIME NOT NULL,
  plan VARCHAR(20) NULL DEFAULT NULL,   -- NULL = trial/expired, else: day|week|month|2months|3months|6months|year
  plan_started_at DATETIME NULL DEFAULT NULL,
  plan_expires_at DATETIME NULL DEFAULT NULL,
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Device fingerprints: ties a browser/device fingerprint to a user_id so that a second account
-- on the same device is detected at login time. fingerprint is a SHA-256 of client-supplied signals.
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id CHAR(36) PRIMARY KEY,
  fingerprint CHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  first_seen_at DATETIME NOT NULL,
  INDEX idx_df_fingerprint (fingerprint),
  INDEX idx_df_user (user_id),
  CONSTRAINT fk_df_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
