-- Email alerts for new matches and messages while a member isn't using the app.
-- `email_alerts` is the member's on/off switch; `email_alert_log` throttles to one email per
-- conversation every few hours. Re-runnable.
-- MySQL & MariaDB compatible idempotent schema update using information_schema checks.

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE notification_preferences ADD COLUMN email_alerts TINYINT(1) NOT NULL DEFAULT 1', 'DO 0')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_preferences' AND COLUMN_NAME = 'email_alerts');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


CREATE TABLE IF NOT EXISTS email_alert_log (
  user_id VARCHAR(64) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  sent_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, topic),
  CONSTRAINT fk_email_alert_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
