-- Features most dating apps have: profile prompts and Indian profile details, pausing a profile,
-- replies / reactions / unsend in chat, and a ban list so removed members can't sign up again.
-- Re-runnable: every statement checks whether it already ran.

-- Profile: prompts (JSON [{ "q": "<question key>", "a": "<answer>" }]) and details people filter by.
-- MySQL & MariaDB compatible idempotent schema update using information_schema checks.

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE profiles ADD COLUMN prompts TEXT NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'prompts');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE profiles ADD COLUMN religion VARCHAR(16) NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'religion');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE profiles ADD COLUMN mother_tongue VARCHAR(16) NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'mother_tongue');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE profiles ADD COLUMN languages TEXT NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'languages');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE profiles ADD COLUMN diet VARCHAR(16) NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'diet');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE profiles ADD COLUMN marital_status VARCHAR(16) NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'marital_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE profiles ADD COLUMN family_plans VARCHAR(24) NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'family_plans');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- A paused member is hidden from Discover; their matches and chats carry on.
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE users ADD COLUMN paused_at DATETIME NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'paused_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Chat: reply to a message, and unsend (the row stays so the conversation reads in order).
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE messages ADD COLUMN reply_to_id VARCHAR(64) NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'reply_to_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE messages ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'deleted_at');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- One reaction per member per message.
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT fk_reaction_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_reaction_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Banned emails and phone numbers, stored only as SHA-256 hashes of the normalised value.
CREATE TABLE IF NOT EXISTS banned_identities (
  id CHAR(36) PRIMARY KEY,
  kind VARCHAR(8) NOT NULL,
  value_hash CHAR(64) NOT NULL,
  user_id VARCHAR(64) NULL DEFAULT NULL,
  reason VARCHAR(200) NULL DEFAULT NULL,
  admin_id CHAR(36) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_banned_identity (kind, value_hash),
  INDEX idx_banned_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
