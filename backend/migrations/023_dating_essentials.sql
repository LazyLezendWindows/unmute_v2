-- Features most dating apps have: profile prompts and Indian profile details, pausing a profile,
-- replies / reactions / unsend in chat, and a ban list so removed members can't sign up again.
-- Re-runnable: every statement checks whether it already ran.

-- Profile: prompts (JSON [{ "q": "<question key>", "a": "<answer>" }]) and details people filter by.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS prompts TEXT NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS religion VARCHAR(16) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mother_tongue VARCHAR(16) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS languages TEXT NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS diet VARCHAR(16) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS marital_status VARCHAR(16) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS family_plans VARCHAR(24) NULL DEFAULT NULL;

-- A paused member is hidden from Discover; their matches and chats carry on.
ALTER TABLE users ADD COLUMN IF NOT EXISTS paused_at DATETIME NULL DEFAULT NULL;

-- Chat: reply to a message, and unsend (the row stays so the conversation reads in order).
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id VARCHAR(64) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL DEFAULT NULL;

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
