-- Referrals: every member has a referral code (like a username). A new member can enter one at
-- sign-up (or within their first week); once they verify their mobile number, both get two weeks
-- of free access. `free_until` holds free time earned this way, stacked after any trial or plan.
-- Re-runnable.
-- MySQL & MariaDB compatible idempotent schema update using information_schema checks.

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'referral_code');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'CREATE UNIQUE INDEX uq_users_referral_code ON users (referral_code)', 'DO 0')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_referral_code');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE subscriptions ADD COLUMN free_until DATETIME NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions' AND COLUMN_NAME = 'free_until');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


CREATE TABLE IF NOT EXISTS referrals (
  referred_id VARCHAR(64) NOT NULL PRIMARY KEY,
  referrer_id VARCHAR(64) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL,
  rewarded_at DATETIME NULL DEFAULT NULL,
  INDEX idx_referrals_referrer (referrer_id, rewarded_at),
  CONSTRAINT fk_referral_referred FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_referral_referrer FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
