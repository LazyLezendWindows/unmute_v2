-- Device tokens are random server-issued cookies, not hardware fingerprints.
-- Keep claims after account deletion so deletion cannot reset the trial on this installation.
CREATE TABLE trial_devices (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_orders (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  plan VARCHAR(20) NOT NULL,
  amount INT NOT NULL,
  payment_id VARCHAR(64) NULL UNIQUE,
  fulfilled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_billing_user (user_id),
  CONSTRAINT fk_billing_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
