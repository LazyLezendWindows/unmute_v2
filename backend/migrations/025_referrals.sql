-- Referrals: every member has a referral code (like a username). A new member can enter one at
-- sign-up (or within their first week); once they verify their mobile number, both get two weeks
-- of free access. `free_until` holds free time earned this way, stacked after any trial or plan.
-- Re-runnable.
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) NULL DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_referral_code ON users (referral_code);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS free_until DATETIME NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS referrals (
  referred_id VARCHAR(64) NOT NULL PRIMARY KEY,
  referrer_id VARCHAR(64) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL,
  rewarded_at DATETIME NULL DEFAULT NULL,
  INDEX idx_referrals_referrer (referrer_id, rewarded_at),
  CONSTRAINT fk_referral_referred FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_referral_referrer FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
