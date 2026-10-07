-- Email alerts for new matches and messages while a member isn't using the app.
-- `email_alerts` is the member's on/off switch; `email_alert_log` throttles to one email per
-- conversation every few hours. Re-runnable.
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_alerts TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS email_alert_log (
  user_id VARCHAR(64) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  sent_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, topic),
  CONSTRAINT fk_email_alert_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
