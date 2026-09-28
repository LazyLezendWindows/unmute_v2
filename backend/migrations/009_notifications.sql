-- The activity feed: likes received, new matches and unread messages. One unread 'message' row
-- per conversation is bumped (count, preview, time) instead of adding a row per message.
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(16) NOT NULL,
  actor_id VARCHAR(64) DEFAULT NULL,
  conversation_id VARCHAR(64) DEFAULT NULL,
  item_count INT NOT NULL DEFAULT 1,
  preview VARCHAR(160) DEFAULT NULL,
  created_at VARCHAR(64) NOT NULL,
  read_at VARCHAR(64) DEFAULT NULL,
  INDEX idx_notifications_user (user_id, created_at),
  INDEX idx_notifications_conv (user_id, conversation_id, type),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
