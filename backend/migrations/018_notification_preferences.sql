CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id VARCHAR(64) PRIMARY KEY,
  calls BOOLEAN NOT NULL DEFAULT TRUE,
  messages BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_notification_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
