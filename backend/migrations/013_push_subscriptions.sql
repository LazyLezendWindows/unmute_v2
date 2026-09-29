-- Web Push subscriptions: one row per browser or installed app that allowed notifications, so an
-- incoming call can ring (and a missed call show) while Unmute is closed.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  endpoint VARCHAR(700) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_push_endpoint (endpoint),
  INDEX idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
